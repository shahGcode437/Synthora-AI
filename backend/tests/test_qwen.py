"""Qwen (OpenAI-compatible) adapter and three-provider failover. Fake clients: no network, no keys."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import openai
import pytest
from fastapi.testclient import TestClient

from app.ai.errors import ProviderCallError
from app.ai.openai_provider import QwenProvider, create_qwen_provider
from app.ai.providers import build_providers
from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.config import Settings
from app.main import app
from tests.test_openai_failover import (  # noqa: F401  (client is a pytest fixture)
    BODY, PLAN, REQ, _http_error, client, failing_gemini, failing_openai, ok_gemini, ok_openai, run, use,
)

KEY = "qwen-secret-key-123"
URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"


def qwen_with(create) -> QwenProvider:
    p = QwenProvider(KEY, "qwen-test", base_url=URL)
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return p


def reply(text):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


def ok_qwen(calls=None):
    async def create(**kw):
        if calls is not None:
            calls.append(kw)
        return reply(json.dumps(PLAN))
    return qwen_with(create)


def failing_qwen(status=500, code=None):
    async def create(**_):
        raise _http_error(status, code)
    return qwen_with(create)


def qwen_returning(text):
    async def create(**_):
        return reply(text)
    return qwen_with(create)


# ------------------------------------------------------------------ adapter
def test_qwen_success_request_shape():
    calls: list = []
    text = run(ok_qwen(calls).complete_json(REQ, 5))
    assert json.loads(text)["domain"] == "test"
    kw = calls[0]
    assert kw["model"] == "qwen-test" and kw["response_format"] == {"type": "json_object"}
    assert "JSON Schema" in kw["messages"][0]["content"] and json.loads(kw["messages"][1]["content"]) == {"prompt": "p"}


def test_qwen_uses_configured_base_url_and_name():
    p = QwenProvider(KEY, "qwen-test", base_url=URL)
    assert p.name == "qwen" and p.model == "qwen-test"
    assert str(p._client.base_url).rstrip("/") == URL.rstrip("/")


def test_qwen_empty_output_is_call_error():
    for empty in (None, ""):
        with pytest.raises(ProviderCallError, match="empty"):
            run(qwen_returning(empty).complete_json(REQ, 5))


def test_qwen_malformed_json_is_rejected_by_router_not_adapter():
    """The adapter returns raw text; the existing router parses/validates and moves on."""
    async def go():
        router = LLMRouter([qwen_returning("this is not json")], 5, 1)
        from app.ai.prompts import build_schema_analysis_request
        from app.models.api import AnalyzeRequest
        from app.models.plan import GenerationPlan
        return await router.complete_structured(build_schema_analysis_request(AnalyzeRequest(**BODY)), GenerationPlan)

    from app.ai.errors import AllProvidersFailedError
    with pytest.raises(AllProvidersFailedError) as ei:
        run(go())
    assert "qwen: invalid output" in " ".join(ei.value.attempts) and "not json" not in str(ei.value)


def test_qwen_timeout():
    async def slow(**_):
        await asyncio.sleep(1)

    with pytest.raises(ProviderCallError, match="timeout"):
        run(qwen_with(slow).complete_json(REQ, 0.01))


def test_qwen_connection_error():
    async def conn(**_):
        raise openai.APIConnectionError(request=httpx.Request("POST", URL))

    with pytest.raises(ProviderCallError, match="connection"):
        run(qwen_with(conn).complete_json(REQ, 5))


def test_qwen_429_and_5xx_map_to_call_errors_and_transients_retry_once(monkeypatch):
    async def no_sleep(_):
        return None
    monkeypatch.setattr("app.ai.openai_provider.asyncio.sleep", no_sleep)
    for status, code in [(429, "limit_requests"), (500, None), (503, "service_unavailable"), (401, "invalid_api_key")]:
        n = {"c": 0}

        async def create(**_):
            n["c"] += 1
            raise _http_error(status, code)

        with pytest.raises(ProviderCallError) as ei:
            run(qwen_with(create).complete_json(REQ, 5))
        assert f"Qwen API error {status}" in str(ei.value)
        assert n["c"] == (2 if status in (429, 500, 503) else 1)


def test_qwen_secrets_never_in_errors():
    for exc_status, code in [(401, "invalid_api_key"), (429, "quota"), (500, None)]:
        async def create(**_):
            resp = httpx.Response(exc_status, request=httpx.Request(
                "POST", URL, headers={"Authorization": f"Bearer {KEY}"}))
            raise openai.APIStatusError(f"bad key {KEY} sent", response=resp, body={"code": code})

        with pytest.raises(ProviderCallError) as ei:
            run(qwen_with(create).complete_json(REQ, 5))
        text = str(ei.value) + repr(ei.value.__cause__ and type(ei.value.__cause__).__name__)
        assert KEY not in str(ei.value) and "Bearer" not in str(ei.value) and "Authorization" not in text


def test_qwen_enable_thinking_400_is_adapted_once():
    seen: list = []

    async def create(**kw):
        seen.append(kw.get("extra_body"))
        if not kw.get("extra_body"):
            raise _http_error(400, "invalid_parameter_error",
                              "parameter.enable_thinking must be set to false for non-streaming calls")
        return reply("{}")

    assert run(qwen_with(create).complete_json(REQ, 5)) == "{}"
    assert seen == [None, {"enable_thinking": False}]


# ------------------------------------------------------------------ registration / order
@pytest.mark.parametrize("cfg", [
    {}, {"qwen_api_key": "k"}, {"qwen_model": "m"}, {"qwen_base_url": URL},
    {"qwen_api_key": "k", "qwen_model": "m"}, {"qwen_api_key": "k", "qwen_base_url": URL},
    {"qwen_model": "m", "qwen_base_url": URL},
])
def test_qwen_skipped_unless_key_model_and_base_url_all_set(cfg):
    assert create_qwen_provider(Settings(_env_file=None, **cfg)) is None


def test_qwen_registered_when_fully_configured_and_insecure_url_rejected():
    ok = Settings(_env_file=None, qwen_api_key="k", qwen_model="m", qwen_base_url=URL)
    assert create_qwen_provider(ok).name == "qwen"
    assert create_qwen_provider(Settings(_env_file=None, qwen_api_key="k", qwen_model="m",
                                         qwen_base_url="http://example.com/v1")) is None
    assert create_qwen_provider(Settings(_env_file=None, qwen_api_key="k", qwen_model="m",
                                         qwen_base_url="http://localhost:9999/v1")) is not None


ALL = dict(gemini_api_key="g", gemini_model="gm", openai_api_key="o", openai_model="om",
           qwen_api_key="q", qwen_model="qm", qwen_base_url=URL)


@pytest.mark.parametrize("order,cfg,expected", [
    ("gemini,openai,qwen", ALL, ["gemini", "openai", "qwen"]),
    ("qwen,gemini", ALL, ["qwen", "gemini"]),
    ("gemini,openai,qwen", {k: v for k, v in ALL.items() if not k.startswith("openai")}, ["gemini", "qwen"]),
    ("gemini,openai,qwen", {k: v for k, v in ALL.items() if not k.startswith("qwen")}, ["gemini", "openai"]),
    ("gemini,openai,qwen,xai", ALL, ["gemini", "openai", "qwen"]),          # xai has no adapter: skipped
    ("gemini,openai,qwen", {}, []),
])
def test_provider_order_and_skipping(order, cfg, expected):
    assert [p.name for p in build_providers(Settings(_env_file=None, llm_provider_order=order, **cfg))] == expected


# ------------------------------------------------------------------ three-provider failover via the real route
def test_A_gemini_succeeds(client):
    r = use(client, ok_gemini(), ok_openai(), ok_qwen())
    ai = r.json()["ai"]
    assert r.status_code == 200 and ai["provider"] == "gemini" and ai["fallbacks"] == 0


def test_B_gemini_fails_openai_succeeds(client):
    r = use(client, failing_gemini(), ok_openai(), ok_qwen())
    ai = r.json()["ai"]
    assert r.status_code == 200 and ai["provider"] == "openai" and ai["fallbacks"] == 1


def test_C_gemini_and_openai_fail_qwen_succeeds(client):
    r = use(client, failing_gemini(429, "RESOURCE_EXHAUSTED"), failing_openai(429, "insufficient_quota"), ok_qwen())
    assert r.status_code == 200
    ai = r.json()["ai"]
    assert ai["provider"] == "qwen" and ai["model"] == "qwen-test" and ai["fallbacks"] == 2
    assert r.json()["plan"]["tables"][0]["target_rows"] == 7 and r.json()["plan"]["domain"] == "test"


def test_C2_invalid_plan_from_earlier_providers_also_falls_through_to_qwen(client):
    async def junk(**_):
        return reply('{"domain": "x"}')
    from tests.test_openai_failover import openai_with
    r = use(client, failing_gemini(), openai_with(junk), ok_qwen())
    assert r.status_code == 200 and r.json()["ai"]["provider"] == "qwen" and r.json()["ai"]["fallbacks"] == 2


def test_D_all_three_fail_clean_502(client):
    r = use(client, failing_gemini(), failing_openai(500), failing_qwen(500))
    assert r.status_code == 502
    err = r.json()["error"]
    assert err["code"] == "ai_providers_failed" and err["message"] == "All configured AI providers failed."
    joined = " ".join(err["details"])
    assert all(n in joined for n in ("gemini", "openai", "qwen")) and len(err["details"]) >= 3
    assert KEY not in r.text and "sk-test-secret" not in r.text and "gem-test-secret" not in r.text


CSV = (
    b"name,city,age\n"
    b"Ayesha Khan,Lahore,31\nAli Raza,Karachi,42\nSana Malik,Lahore,28\nBilal Shah,Lahore,35\n"
    b"Hina Butt,Karachi,29\nUsman Iqbal,Lahore,44\nNoor Mirza,Karachi,33\nOmar Sheikh,Lahore,38\n"
    b"Zainab Ali,Karachi,26\nHamza Baig,Lahore,30\n"
)
SAMPLE_AI_PLAN = {"domain": "people", "locale": "en_PK", "tables": [{"name": "ignored", "columns": [
    {"name": "name", "data_type": "string", "semantic_type": "person_name", "generator": {"strategy": "faker", "generator": "name"},
     "pii": {"classification": "direct_identifier", "privacy_action": "synthesize"}},
    {"name": "city", "data_type": "string", "semantic_type": "city", "generator": {"strategy": "categorical"}},
    {"name": "age", "data_type": "integer", "semantic_type": "age", "generator": {"strategy": "statistical"}}]}]}


def test_E_sample_csv_analysis_works_through_qwen(client):
    async def create(**_):
        return reply(json.dumps(SAMPLE_AI_PLAN))

    router = LLMRouter([failing_gemini(), failing_openai(500), qwen_with(create)], 5, 0)
    app.dependency_overrides[get_llm_router] = lambda: router
    r = client.post("/api/v1/analyze/sample", files={"file": ("people.csv", CSV, "text/csv")},
                    data={"instruction": "preserve city ratios", "target_rows": "30"})
    assert r.status_code == 200
    body = r.json()
    assert body["ai"]["provider"] == "qwen" and body["ai"]["fallbacks"] == 2
    # profiling + grounding are provider-independent
    (t,) = body["plan"]["tables"]
    cols = {c["name"]: c for c in t["columns"]}
    assert t["name"] == "people" and t["target_rows"] == 30
    assert cols["city"]["generator"]["params"]["weights"] == {"Lahore": 0.6, "Karachi": 0.4}
    assert cols["age"]["generator"]["params"]["min"] == 26 and cols["age"]["generator"]["params"]["max"] == 44
    assert body["profile"]["total_rows"] == 10 and body["plan"]["source_mode"] == "sample"
    # the prompt sent to Qwen carried only the compact profile + masked sample, not the raw file
    g = client.post("/api/v1/generate", json={"plan": body["plan"], "seed": 1})
    assert g.status_code == 200 and len(g.json()["data"]["people"]) == 30


def test_E2_qwen_receives_masked_sample_not_raw_names(client):
    calls: list = []
    router = LLMRouter([ok_qwen(calls)], 5, 0)
    app.dependency_overrides[get_llm_router] = lambda: router
    client.post("/api/v1/analyze/sample", files={"file": ("people.csv", CSV, "text/csv")})
    sent = calls[0]["messages"][1]["content"]
    assert "Ayesha" not in sent and "Khan" not in sent and "Aaaaaa Aaaa" in sent
