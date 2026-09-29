"""Tests use stub providers ONLY to exercise router/normalization logic; production code ships none."""
import json

import pytest
from fastapi.testclient import TestClient

from app.ai.base import BaseLLMProvider
from app.ai.errors import ProviderCallError
from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.main import app

VALID_PLAN = {
    "domain": "test-domain",
    "tables": [
        {
            "name": "t",
            "columns": [
                {
                    "name": "id",
                    "data_type": "integer",
                    "semantic_type": "identifier",
                    "is_primary_key": True,
                    "generator": {"strategy": "deterministic_id"},
                }
            ],
        }
    ],
}
BODY = {"mode": "prompt", "prompt": "anything", "target_rows": 7, "locale": "en_PK"}


class Stub(BaseLLMProvider):
    def __init__(self, name, outputs):
        self.name, self.model, self.outputs, self.calls = name, "stub", list(outputs), 0

    async def complete_json(self, request, timeout):
        self.calls += 1
        out = self.outputs.pop(0) if len(self.outputs) > 1 else self.outputs[0]
        if isinstance(out, Exception):
            raise out
        return out


def client_with(*providers):
    router = LLMRouter(list(providers), 5, 1)
    app.dependency_overrides[get_llm_router] = lambda: router
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset():
    yield
    app.dependency_overrides.clear()


def test_health_and_root():
    c = TestClient(app)
    assert c.get("/health").json()["status"] == "ok"
    assert c.get("/").status_code == 200


def test_openapi_has_analyze():
    assert "post" in TestClient(app).get("/openapi.json").json()["paths"]["/api/v1/analyze"]


def test_provider_not_configured_is_explicit_503():
    r = client_with().post("/api/v1/analyze", json=BODY)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "ai_provider_not_configured"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"mode": "prompt"},
        {"mode": "prompt", "prompt": "   "},
        {"mode": "bogus", "prompt": "x"},
        {"mode": "prompt", "prompt": "x", "target_rows": 0},
        {"mode": "prompt", "prompt": "x", "edge_case_mode": "extreme"},
    ],
)
def test_request_validation(body):
    r = client_with().post("/api/v1/analyze", json=body)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_sample_mode_not_implemented():
    r = client_with(Stub("a", [json.dumps(VALID_PLAN)])).post("/api/v1/analyze", json={"mode": "sample"})
    assert r.status_code == 501


def test_success_applies_user_controls():
    r = client_with(Stub("a", [json.dumps(VALID_PLAN)])).post("/api/v1/analyze", json=BODY)
    assert r.status_code == 200
    body = r.json()
    assert body["plan"]["locale"] == "en_PK"
    assert body["plan"]["tables"][0]["target_rows"] == 7
    assert body["ai"]["provider"] == "a" and body["ai"]["fallbacks"] == 0


def test_fallback_on_call_failure_and_invalid_output():
    bad_call = Stub("a", [ProviderCallError("429")])
    bad_json = Stub("b", ["not json", "{}"])  # invalid then schema-invalid, retried once
    good = Stub("c", ["```json\n" + json.dumps(VALID_PLAN) + "\n```"])
    r = client_with(bad_call, bad_json, good).post("/api/v1/analyze", json=BODY)
    assert r.status_code == 200
    assert r.json()["ai"] == {**r.json()["ai"], "provider": "c", "fallbacks": 2}
    assert bad_call.calls == 1 and bad_json.calls == 2


def test_all_providers_fail_is_502():
    r = client_with(Stub("a", [ProviderCallError("down")])).post("/api/v1/analyze", json=BODY)
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "ai_providers_failed"


def test_plan_integrity_rejects_bad_foreign_key():
    bad = json.loads(json.dumps(VALID_PLAN))
    bad["tables"][0]["foreign_keys"] = [
        {"column": "id", "references_table": "missing", "references_column": "id"}
    ]
    r = client_with(Stub("a", [json.dumps(bad)])).post("/api/v1/analyze", json=BODY)
    assert r.status_code == 502  # invalid structured output never reaches the client
