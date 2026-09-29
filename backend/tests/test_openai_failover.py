"""OpenAI adapter + provider failover. Real adapter classes with fake SDK clients: no network, no keys."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import openai
import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors

from app.ai.base import LLMRequest
from app.ai.errors import ProviderCallError
from app.ai.gemini import GeminiProvider
from app.ai.openai_provider import OpenAIProvider, create_openai_provider
from app.ai.providers import build_providers
from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.config import Settings
from app.main import app

PLAN = {
    "domain": "test",
    "tables": [{"name": "t", "columns": [{
        "name": "id", "data_type": "integer", "semantic_type": "identifier", "is_primary_key": True,
        "generator": {"strategy": "deterministic_id"}}]}],
}
REQ = LLMRequest(task="t", system_instruction="sys", input={"prompt": "p"},
                 response_schema_name="GenerationPlan", response_json_schema={"type": "object"})
BODY = {"mode": "prompt", "prompt": "anything", "target_rows": 7}


def _http_error(status: int, code: str | None = None, msg: str = "boom"):
    resp = httpx.Response(status, request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"))
    return openai.APIStatusError(msg, response=resp, body={"code": code} if code else None)


def openai_with(create):
    p = OpenAIProvider("sk-test-secret", "gpt-test")
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return p


def gemini_with(generate):
    p = GeminiProvider("gem-test-secret", "gem-test")
    p._client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    return p


def ok_openai(calls=None):
    async def create(**kw):
        if calls is not None:
            calls.append(kw)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(PLAN)))])
    return openai_with(create)


def ok_gemini():
    async def gen(**_):
        return SimpleNamespace(text=json.dumps(PLAN))
    return gemini_with(gen)


def failing_gemini(code=503, status="UNAVAILABLE"):
    async def gen(**_):
        raise genai_errors.APIError(code, {"error": {"message": "x", "status": status}})
    return gemini_with(gen)


def failing_openai(status=500, code=None):
    async def create(**_):
        raise _http_error(status, code)
    return openai_with(create)


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def client(monkeypatch):
    async def no_sleep(_):  # skip the adapters' 2s transient-retry pause
        return None
    monkeypatch.setattr("app.ai.gemini.asyncio.sleep", no_sleep)
    monkeypatch.setattr("app.ai.openai_provider.asyncio.sleep", no_sleep)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def use(client, *providers):
    router = LLMRouter(list(providers), 5, 1)
    app.dependency_overrides[get_llm_router] = lambda: router
    return client.post("/api/v1/analyze", json=BODY)


# ------------------------------------------------------------------ adapter
def test_openai_request_shape_and_success():
    calls: list = []
    text = run(ok_openai(calls).complete_json(REQ, 5))
    assert json.loads(text)["domain"] == "test"
    kw = calls[0]
    assert kw["model"] == "gpt-test" and kw["response_format"] == {"type": "json_object"}
    assert kw["messages"][0]["role"] == "system" and "JSON Schema" in kw["messages"][0]["content"]
    assert json.loads(kw["messages"][1]["content"]) == {"prompt": "p"}


def test_openai_errors_map_to_provider_call_error_without_leaking_key():
    for status, code in [(401, "invalid_api_key"), (404, "model_not_found"), (429, "insufficient_quota")]:
        with pytest.raises(ProviderCallError) as ei:
            run(failing_openai(status, code).complete_json(REQ, 5))
        msg = str(ei.value)
        assert str(status) in msg and code in msg and "sk-test-secret" not in msg


def test_openai_transient_error_is_retried_once():
    n = {"c": 0}

    async def create(**_):
        n["c"] += 1
        if n["c"] == 1:
            raise _http_error(503)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="{}"))])

    assert run(openai_with(create).complete_json(REQ, 5)) == "{}" and n["c"] == 2


def test_openai_quota_exhausted_is_not_retried():
    n = {"c": 0}

    async def create(**_):
        n["c"] += 1
        raise _http_error(429, "insufficient_quota")

    with pytest.raises(ProviderCallError):
        run(openai_with(create).complete_json(REQ, 5))
    assert n["c"] == 1


def test_openai_drops_unsupported_temperature_and_retries():
    seen: list = []

    async def create(**kw):
        seen.append("temperature" in kw)
        if "temperature" in kw:
            raise _http_error(400, "unsupported_value", "Unsupported value: 'temperature' does not support 0.1")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="{}"))])

    assert run(openai_with(create).complete_json(REQ, 5)) == "{}" and seen == [True, False]


def test_openai_timeout_connection_and_empty_are_call_errors():
    async def slow(**_):
        await asyncio.sleep(1)

    with pytest.raises(ProviderCallError, match="timeout"):
        run(openai_with(slow).complete_json(REQ, 0.01))

    async def conn(**_):
        raise openai.APIConnectionError(request=httpx.Request("POST", "https://x"))

    with pytest.raises(ProviderCallError, match="connection"):
        run(openai_with(conn).complete_json(REQ, 5))

    async def empty(**_):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=None))])

    with pytest.raises(ProviderCallError, match="empty"):
        run(openai_with(empty).complete_json(REQ, 5))


# ------------------------------------------------------------------ registration / order
def test_registration_requires_key_and_model():
    assert create_openai_provider(Settings(_env_file=None)) is None
    assert create_openai_provider(Settings(_env_file=None, openai_api_key="k")) is None
    assert create_openai_provider(Settings(_env_file=None, openai_model="m")) is None
    assert create_openai_provider(Settings(_env_file=None, openai_api_key="k", openai_model="m")).name == "openai"


@pytest.mark.parametrize("order,expected", [
    ("gemini,openai", ["gemini", "openai"]),
    ("openai,gemini", ["openai", "gemini"]),
    ("gemini", ["gemini"]),
    ("gemini,openai,qwen,xai", ["gemini", "openai"]),     # unimplemented providers are skipped
])
def test_provider_order_is_configurable(order, expected):
    s = Settings(_env_file=None, gemini_api_key="g", gemini_model="gm", openai_api_key="o", openai_model="om",
                 llm_provider_order=order)
    assert [p.name for p in build_providers(s)] == expected


def test_openai_only_registered_when_configured():
    s = Settings(_env_file=None, gemini_api_key="g", gemini_model="gm", llm_provider_order="gemini,openai")
    assert [p.name for p in build_providers(s)] == ["gemini"]


# ------------------------------------------------------------------ failover through the real route
def test_first_provider_succeeds_no_fallback(client):
    r = use(client, ok_gemini(), ok_openai())
    assert r.status_code == 200
    assert r.json()["ai"]["provider"] == "gemini" and r.json()["ai"]["fallbacks"] == 0


def test_first_fails_second_succeeds_fallback_is_one(client):
    r = use(client, failing_gemini(), ok_openai())
    assert r.status_code == 200
    ai = r.json()["ai"]
    assert ai["provider"] == "openai" and ai["model"] == "gpt-test" and ai["fallbacks"] == 1
    assert r.json()["plan"]["domain"] == "test" and r.json()["plan"]["tables"][0]["target_rows"] == 7


@pytest.mark.parametrize("gemini", [lambda: failing_gemini(429, "RESOURCE_EXHAUSTED"), lambda: failing_gemini(404, "NOT_FOUND")])
def test_gemini_quota_or_bad_model_falls_back(client, gemini):
    r = use(client, gemini(), ok_openai())
    assert r.status_code == 200 and r.json()["ai"]["provider"] == "openai" and r.json()["ai"]["fallbacks"] == 1


def test_invalid_output_from_first_provider_falls_back(client):
    async def junk(**_):
        return SimpleNamespace(text='{"domain": "x"}')  # valid JSON, invalid GenerationPlan
    r = use(client, gemini_with(junk), ok_openai())
    assert r.status_code == 200 and r.json()["ai"]["provider"] == "openai" and r.json()["ai"]["fallbacks"] == 1


def test_order_reversed_uses_openai_first(client):
    r = use(client, ok_openai(), failing_gemini())
    assert r.json()["ai"]["provider"] == "openai" and r.json()["ai"]["fallbacks"] == 0


def test_both_fail_is_clean_502_listing_each_provider(client):
    r = use(client, failing_gemini(), failing_openai(500))
    assert r.status_code == 502
    err = r.json()["error"]
    assert err["code"] == "ai_providers_failed"
    joined = " ".join(err["details"])
    assert "gemini" in joined and "openai" in joined
    assert "sk-test-secret" not in r.text and "gem-test-secret" not in r.text


def test_sample_mode_also_fails_over(client):
    router = LLMRouter([failing_gemini(), ok_openai()], 5, 1)
    app.dependency_overrides[get_llm_router] = lambda: router
    r = client.post("/api/v1/analyze/sample", files={"file": ("c.csv", b"a,b\n1,x\n2,y\n", "text/csv")})
    assert r.status_code == 200 and r.json()["ai"]["provider"] == "openai" and r.json()["ai"]["fallbacks"] == 1
