"""OpenAI-compatible adapters (Chat Completions, JSON mode): OpenAI and Qwen (Alibaba Model Studio).
Keys, models and base URLs come from settings and are never logged.

JSON mode (not strict json_schema) is used on purpose: GenerationPlan has open-ended
objects (generator.params) that strict structured outputs cannot express. The schema is
given in the prompt and the router validates the result against GenerationPlan.
"""
from __future__ import annotations

import asyncio
import json
import logging

from openai import APIConnectionError, APIStatusError, AsyncOpenAI

from app.ai.base import BaseLLMProvider, LLMRequest
from app.ai.errors import ProviderCallError
from app.config import Settings

logger = logging.getLogger(__name__)
_TRANSIENT = (429, 500, 502, 503, 504)


class OpenAIProvider(BaseLLMProvider):
    name = "openai"
    label = "OpenAI"

    def __init__(self, api_key: str, model: str, base_url: str | None = None):
        self.model = model
        # SDK retries disabled: retry policy lives here and in the router.
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url, max_retries=0)

    def _adapt_bad_request(self, exc: APIStatusError, kwargs: dict) -> bool:
        """Adjust kwargs after a 400 caused by an unsupported option. True if changed (retry)."""
        if "temperature" in str(exc).lower() and "temperature" in kwargs:
            kwargs.pop("temperature")  # some models reject a custom temperature
            return True
        return False

    async def complete_json(self, request: LLMRequest, timeout: float) -> str:
        system = request.system_instruction
        if request.response_json_schema:
            system += (
                f"\n\nRespond with a single JSON object valid against this JSON Schema "
                f"({request.response_schema_name}):\n"
                + json.dumps(request.response_json_schema, separators=(",", ":"))
            )
        kwargs: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(request.input, ensure_ascii=False)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": request.temperature,
        }
        text = None
        transient_retried = False
        for _ in range(3):  # a 400 option-adaptation and one quick transient retry can both occur
            try:
                response = await asyncio.wait_for(
                    self._client.chat.completions.create(**kwargs), timeout=timeout
                )
                text = response.choices[0].message.content
                break
            except asyncio.TimeoutError as exc:
                raise ProviderCallError(f"timeout after {timeout}s") from exc
            except APIStatusError as exc:
                code = getattr(exc, "code", None)
                if exc.status_code == 400 and self._adapt_bad_request(exc, kwargs):
                    continue
                if not transient_retried and exc.status_code in _TRANSIENT and code != "insufficient_quota":
                    transient_retried = True
                    await asyncio.sleep(2)
                    continue
                # Status and error code only: never include headers, keys or the raw message.
                raise ProviderCallError(f"{self.label} API error {exc.status_code}: {code or 'error'}") from exc
            except APIConnectionError as exc:
                raise ProviderCallError(f"connection error ({type(exc).__name__})") from exc
            except Exception as exc:
                raise ProviderCallError(type(exc).__name__) from exc
        if not text:
            raise ProviderCallError("empty response (refusal or filtered)")
        return text


def create_openai_provider(settings: Settings) -> OpenAIProvider | None:
    if not settings.openai_api_key or not settings.openai_model:
        return None
    return OpenAIProvider(settings.openai_api_key, settings.openai_model)


class QwenProvider(OpenAIProvider):
    """Qwen via Alibaba Cloud Model Studio's OpenAI-compatible endpoint (region/workspace-specific base URL)."""

    name = "qwen"
    label = "Qwen"

    def _adapt_bad_request(self, exc: APIStatusError, kwargs: dict) -> bool:
        # Some Qwen3 models require thinking to be disabled for non-streaming calls.
        if "enable_thinking" in str(exc).lower() and "extra_body" not in kwargs:
            kwargs["extra_body"] = {"enable_thinking": False}
            return True
        return super()._adapt_bad_request(exc, kwargs)


def create_qwen_provider(settings: Settings) -> QwenProvider | None:
    url = settings.qwen_base_url.strip()
    if not (settings.qwen_api_key and settings.qwen_model and url):
        return None
    local = url.lower().startswith(("http://localhost", "http://127.0.0.1"))
    if not (url.lower().startswith("https://") or local):
        logger.warning("QWEN_BASE_URL must start with https://; Qwen provider skipped")
        return None
    return QwenProvider(settings.qwen_api_key, settings.qwen_model, base_url=url)
