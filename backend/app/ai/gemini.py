"""Gemini adapter (Google GenAI SDK). Key and model come from settings; never logged."""
from __future__ import annotations

import asyncio
import json

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.ai.base import BaseLLMProvider, LLMRequest
from app.ai.errors import ProviderCallError
from app.config import Settings


class GeminiProvider(BaseLLMProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str):
        self.model = model
        self._client = genai.Client(api_key=api_key)

    async def complete_json(self, request: LLMRequest, timeout: float) -> str:
        system = request.system_instruction
        if request.response_json_schema:
            system += (
                f"\n\nYour output MUST be one JSON object valid against this JSON Schema "
                f"({request.response_schema_name}):\n"
                + json.dumps(request.response_json_schema, separators=(",", ":"))
            )
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=request.temperature,
            response_mime_type="application/json",
        )
        text = None
        for attempt in range(2):  # one quick retry for transient overload/rate-limit
            try:
                response = await asyncio.wait_for(
                    self._client.aio.models.generate_content(
                        model=self.model,
                        contents=json.dumps(request.input, ensure_ascii=False),
                        config=config,
                    ),
                    timeout=timeout,
                )
                text = response.text
                break
            except asyncio.TimeoutError as exc:
                raise ProviderCallError(f"timeout after {timeout}s") from exc
            except genai_errors.APIError as exc:
                if attempt == 0 and exc.code in (429, 500, 502, 503, 504):
                    await asyncio.sleep(2)
                    continue
                # Message only: never include request headers/keys.
                raise ProviderCallError(f"Gemini API error {exc.code}: {exc.status}") from exc
            except Exception as exc:  # network / SDK errors
                raise ProviderCallError(f"{type(exc).__name__}") from exc
        if not text:
            raise ProviderCallError("empty response (possibly blocked)")
        return text


def create_gemini_provider(settings: Settings) -> GeminiProvider | None:
    if not settings.gemini_api_key or not settings.gemini_model:
        return None
    return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
