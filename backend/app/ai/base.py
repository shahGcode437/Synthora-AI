"""Provider abstraction. Adapters (Gemini/OpenAI/Qwen/Grok or LiteLLM) implement this."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel, Field


class LLMRequest(BaseModel):
    """Internal request shape shared by every AI task (docs/API.md section 8)."""

    task: str
    system_instruction: str
    input: dict[str, Any] = Field(default_factory=dict)
    response_schema_name: str
    response_json_schema: dict[str, Any] | None = None
    tier: Literal["fast", "smart"] = "smart"
    temperature: float = 0.1


class BaseLLMProvider(ABC):
    name: str
    model: str | None = None

    @abstractmethod
    async def complete_json(self, request: LLMRequest, timeout: float) -> str:
        """Return the raw JSON text produced by the model.

        Must raise ``ProviderCallError`` for connection/timeout/rate-limit/5xx problems.
        """
