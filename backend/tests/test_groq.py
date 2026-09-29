"""Groq adapter and Gemini -> Groq failover. Fake clients: no network, no keys."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import openai
import pytest

from app.ai.errors import AllProvidersFailedError, ProviderCallError
from app.ai.openai_provider import GROQ_BASE_URL, GroqProvider, create_groq_provider
from app.ai.providers import build_providers
from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.config import Settings
from app.main import app
from tests.test_openai_failover import (  # noqa: F401  (client is a pytest fixture)
    BODY, PLAN, REQ, _http_error, client, failing_gemini, ok_gemini, run, use,
)

KEY = "gsk-secret-key-123"


def groq_with(create) -> GroqProvider:
    p = GroqProvider(KEY, "groq-test", base_url=GROQ_BASE_URL)
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return p


def reply(text):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


def ok_groq(calls=None):
    async def create(**kw):
        if calls is not None:
            calls.append(kw)
        return reply(json.dumps(PLAN))
    return groq_with(create)


def failing_groq(status=500, code=None):
    async def create(**_):
        raise _http_error(status, code)
    return groq_with(create)


# ------------------------------------------------------------------ adapter
def test_groq_success_request_shape_and_endpoint():
    calls: list = []
    p = ok_groq(calls)
    assert json.loads(run(p.complete_json(REQ, 5)))["domain"] == "test"
    kw = calls[0]
    assert kw["model"] == "groq-test" and kw["response_format"] == {"type": "json_object"}
    assert "JSON Schema" in kw["messages"][0]["content"]
    real = GroqProvider(KEY, "m", base_url=GROQ_BASE_URL)
    assert real.name == "groq" and str(real._client.base_url).rstrip("/") == "https://api.groq.com/openai/v1"


def test_groq_malformed_output_is_rejected_by_router():
    async def create(**_):
        return reply("definitely not json")

    async def go():
        from app.ai.prompts import build_schema_analysis_request
        from app.models.api import AnalyzeRequest
        from app.models.plan import GenerationPlan
        router = LLMRouter([groq_with(create)], 5, 1)
        return await router.complete_structured(build_schema_analysis_request(AnalyzeRequest(**BODY)), GenerationPlan)

    with pytest.raises(AllProvidersFailedError) as ei:
        run(go())
    assert "groq: invalid output" in " ".join(ei.value.attempts) and "definitely not json" not in str(ei.value)


def test_groq_empty_output():
    for empty in (None, ""):
        async def create(**_):
            return reply(empty)
        with pytest.raises(ProviderCallError, match="empty"):
            run(groq_with(create).complete_json(REQ, 5))


def test_groq_timeout_and_connection_error():
    async def slow(**_):
        await asyncio.sleep(1)

    with pytest.raises(ProviderCallError, match="timeout"):
        run(groq_with(slow).complete_json(REQ, 0.01))

    async def conn(**_):
        raise openai.APIConnectionError(request=httpx.Request("POST", GROQ_BASE_URL))

    with pytest.raises(ProviderCallError, match="connection"):
        run(groq_with(conn).complete_json(REQ, 5))


def test_groq_rate_limit_4xx_5xx_map_to_call_errors(monkeypatch):
    async def no_sleep(_):
        return None
    monkeypatch.setattr("app.ai.openai_provider.asyncio.sleep", no_sleep)
    for status, code, attempts in [(429, "rate_limit_exceeded", 2), (500, None, 2), (503, "over_capacity", 2),
                                   (401, "invalid_api_key", 1), (404, "model_not_found", 1), (400, "invalid_request", 1)]:
        n = {"c": 0}

        async def create(**_):
            n["c"] += 1
            raise _http_error(status, code)

        with pytest.raises(ProviderCallError) as ei:
            run(groq_with(create).complete_json(REQ, 5))
        assert f"Groq API error {status}" in str(ei.value)
        assert n["c"] == attempts   # transient statuses retried once, others not


def test_groq_secrets_never_in_errors():
    async def create(**_):
        resp = httpx.Response(401, request=httpx.Request("POST", GROQ_BASE_URL, headers={"Authorization": f"Bearer {KEY}"}))
        raise openai.APIStatusError(f"bad key {KEY}", response=resp, body={"code": "invalid_api_key"})

    with pytest.raises(ProviderCallError) as ei:
        run(groq_with(create).complete_json(REQ, 5))
    assert KEY not in str(ei.value) and "Bearer" not in str(ei.value) and "Authorization" not in str(ei.value)


# ------------------------------------------------------------------ registration / order
@pytest.mark.parametrize("cfg", [{}, {"groq_api_key": "k"}, {"groq_model": "m"}])
def test_groq_skipped_unless_key_and_model_set(cfg):
    assert create_groq_provider(Settings(_env_file=None, **cfg)) is None


def test_groq_registered_and_order():
    both = dict(gemini_api_key="g", gemini_model="gm", groq_api_key="k", groq_model="m")
    assert create_groq_provider(Settings(_env_file=None, groq_api_key="k", groq_model="m")).name == "groq"
    assert [p.name for p in build_providers(Settings(_env_file=None, llm_provider_order="gemini,groq", **both))] == ["gemini", "groq"]
    assert [p.name for p in build_providers(Settings(_env_file=None, llm_provider_order="groq,gemini", **both))] == ["groq", "gemini"]
    no_groq = {k: v for k, v in both.items() if not k.startswith("groq")}
    assert [p.name for p in build_providers(Settings(_env_file=None, llm_provider_order="gemini,groq", **no_groq))] == ["gemini"]


# ------------------------------------------------------------------ failover through the real routes
def test_gemini_succeeds_no_fallback(client):
    r = use(client, ok_gemini(), ok_groq())
    assert r.status_code == 200 and r.json()["ai"]["provider"] == "gemini" and r.json()["ai"]["fallbacks"] == 0


def test_gemini_fails_groq_succeeds_fallback_one(client):
    r = use(client, failing_gemini(429, "RESOURCE_EXHAUSTED"), ok_groq())
    ai = r.json()["ai"]
    assert r.status_code == 200 and ai["provider"] == "groq" and ai["model"] == "groq-test" and ai["fallbacks"] == 1
    assert r.json()["plan"]["domain"] == "test" and r.json()["plan"]["tables"][0]["target_rows"] == 7


def test_gemini_bad_model_falls_back_to_groq(client):
    r = use(client, failing_gemini(404, "NOT_FOUND"), ok_groq())
    assert r.json()["ai"]["provider"] == "groq" and r.json()["ai"]["fallbacks"] == 1


def test_both_fail_clean_502(client):
    r = use(client, failing_gemini(), failing_groq(503, "over_capacity"))
    assert r.status_code == 502
    err = r.json()["error"]
    assert err["code"] == "ai_providers_failed" and err["message"] == "All configured AI providers failed."
    joined = " ".join(err["details"])
    assert "gemini" in joined and "groq" in joined and KEY not in r.text


CSV = (b"name,city,age\nAyesha Khan,Lahore,31\nAli Raza,Karachi,42\nSana Malik,Lahore,28\nBilal Shah,Lahore,35\n"
       b"Hina Butt,Karachi,29\nUsman Iqbal,Lahore,44\nNoor Mirza,Karachi,33\nOmar Sheikh,Lahore,38\n"
       b"Zainab Ali,Karachi,26\nHamza Baig,Lahore,30\n")
SAMPLE_AI_PLAN = {"domain": "people", "tables": [{"name": "ignored", "columns": [
    {"name": "name", "data_type": "string", "semantic_type": "person_name", "generator": {"strategy": "faker", "generator": "name"},
     "pii": {"classification": "direct_identifier", "privacy_action": "synthesize"}},
    {"name": "city", "data_type": "string", "semantic_type": "city", "generator": {"strategy": "categorical"}},
    {"name": "age", "data_type": "integer", "semantic_type": "age", "generator": {"strategy": "statistical"}}]}]}


def test_sample_csv_path_works_through_groq(client):
    calls: list = []

    async def create(**kw):
        calls.append(kw)
        return reply(json.dumps(SAMPLE_AI_PLAN))

    router = LLMRouter([failing_gemini(), groq_with(create)], 5, 0)
    app.dependency_overrides[get_llm_router] = lambda: router
    r = client.post("/api/v1/analyze/sample", files={"file": ("people.csv", CSV, "text/csv")}, data={"target_rows": "30"})
    assert r.status_code == 200
    body = r.json()
    assert body["ai"]["provider"] == "groq" and body["ai"]["fallbacks"] == 1
    (t,) = body["plan"]["tables"]
    cols = {c["name"]: c for c in t["columns"]}
    assert t["name"] == "people" and t["target_rows"] == 30
    assert cols["city"]["generator"]["params"]["weights"] == {"Lahore": 0.6, "Karachi": 0.4}
    assert body["profile"]["total_rows"] == 10
    sent = calls[0]["messages"][1]["content"]
    assert "Ayesha" not in sent and "Khan" not in sent          # masked sample, not the raw file
    g = client.post("/api/v1/generate", json={"plan": body["plan"], "seed": 1})
    assert g.status_code == 200 and len(g.json()["data"]["people"]) == 30
