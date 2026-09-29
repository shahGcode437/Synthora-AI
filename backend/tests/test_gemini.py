"""Gemini adapter tests with a fake SDK client. No network, no API key."""
import asyncio
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from app.ai.base import LLMRequest
from app.ai.errors import ProviderCallError
from app.ai.gemini import GeminiProvider, create_gemini_provider
from app.ai.providers import build_providers
from app.config import Settings
from app.models.plan import GeneratorStrategy

REQ = LLMRequest(
    task="t", system_instruction="sys", input={"prompt": "p"},
    response_schema_name="GenerationPlan", response_json_schema={"type": "object"},
)


def provider_with(generate):
    p = GeminiProvider("test-key", "test-model")
    p._client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    return p


def run(coro):
    return asyncio.run(coro)


def test_success_returns_text_and_sends_json_config():
    seen = {}

    async def gen(model, contents, config):
        seen.update(model=model, contents=contents, config=config)
        return SimpleNamespace(text='{"ok": true}')

    assert run(provider_with(gen).complete_json(REQ, 5)) == '{"ok": true}'
    assert seen["model"] == "test-model"
    assert seen["config"].response_mime_type == "application/json"
    assert "JSON Schema" in seen["config"].system_instruction


def test_empty_response_is_call_error():
    async def gen(**_):
        return SimpleNamespace(text=None)

    with pytest.raises(ProviderCallError):
        run(provider_with(gen).complete_json(REQ, 5))


def test_timeout_is_call_error():
    async def gen(**_):
        await asyncio.sleep(1)

    with pytest.raises(ProviderCallError, match="timeout"):
        run(provider_with(gen).complete_json(REQ, 0.01))


def test_api_error_never_leaks_key():
    async def gen(**_):
        raise genai_errors.APIError(429, {"error": {"message": "quota key=test-key", "status": "RESOURCE_EXHAUSTED"}})

    with pytest.raises(ProviderCallError) as ei:
        run(provider_with(gen).complete_json(REQ, 5))
    assert "429" in str(ei.value) and "test-key" not in str(ei.value)


def test_registration_requires_key_and_model():
    assert create_gemini_provider(Settings(_env_file=None)) is None
    assert create_gemini_provider(Settings(_env_file=None, gemini_api_key="k")) is None
    s = Settings(_env_file=None, gemini_api_key="k", gemini_model="m", llm_provider_order="gemini,openai")
    assert [p.name for p in build_providers(s)] == ["gemini"]


def test_strategy_aliases():
    assert GeneratorStrategy("deterministic") is GeneratorStrategy.DETERMINISTIC_ID
    assert GeneratorStrategy("ai") is GeneratorStrategy.AI_TEXT
