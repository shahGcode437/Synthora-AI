"""LLM Router: ordered providers, retry, fallback, structured-output validation.

Success means the output parsed AND validated against the response model,
not merely an HTTP 200 (docs/API.md section 11).
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.base import BaseLLMProvider, LLMRequest
from app.ai.errors import (
    AllProvidersFailedError,
    InvalidStructuredOutputError,
    ProviderCallError,
    ProviderNotConfiguredError,
)
from app.models.api import AIRunMeta

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_json_output(raw: str) -> object:
    """Parse model output, tolerating markdown fences / surrounding prose."""
    text = _FENCE.sub("", (raw or "").strip()).strip()
    if not text:
        raise InvalidStructuredOutputError("empty response")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise InvalidStructuredOutputError("response is not valid JSON") from None


class LLMRouter:
    def __init__(
        self,
        providers: list[BaseLLMProvider],
        timeout_seconds: float = 25,
        max_retries_per_provider: int = 1,
    ):
        self.providers = providers
        self.timeout = timeout_seconds
        self.max_retries = max_retries_per_provider

    @property
    def is_configured(self) -> bool:
        return bool(self.providers)

    async def complete_structured(
        self, request: LLMRequest, response_model: type[T]
    ) -> tuple[T, AIRunMeta]:
        if not self.providers:
            raise ProviderNotConfiguredError(
                "No AI provider is configured. Set an API key and model in backend/.env "
                "(see .env.example)."
            )

        attempts: list[str] = []
        start = time.perf_counter()
        for index, provider in enumerate(self.providers):
            for _ in range(self.max_retries + 1):
                try:
                    raw = await provider.complete_json(request, self.timeout)
                    parsed = response_model.model_validate(parse_json_output(raw))
                except ProviderCallError as exc:
                    attempts.append(f"{provider.name}: call failed ({exc})")
                    logger.warning("ai task=%s %s", request.task, attempts[-1])
                    break  # transport-level failure: move to next provider
                except InvalidStructuredOutputError as exc:
                    attempts.append(f"{provider.name}: invalid output ({exc})")
                except ValidationError as exc:
                    attempts.append(
                        f"{provider.name}: schema validation failed ({exc.error_count()} errors)"
                    )
                else:
                    meta = AIRunMeta(
                        provider=provider.name,
                        model=provider.model,
                        latency_ms=int((time.perf_counter() - start) * 1000),
                        fallbacks=index,
                    )
                    logger.info(
                        "ai task=%s provider=%s model=%s latency_ms=%d fallbacks=%d",
                        request.task, meta.provider, meta.model, meta.latency_ms, meta.fallbacks,
                    )
                    return parsed, meta
                logger.warning("ai task=%s %s", request.task, attempts[-1])
        raise AllProvidersFailedError(attempts)
