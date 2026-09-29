"""Request/response models for the public API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.plan import GenerationPlan

MAX_TARGET_ROWS = 1_000_000


class AnalyzeRequest(BaseModel):
    mode: Literal["prompt", "sample"]
    prompt: str | None = Field(default=None, max_length=8000)
    target_rows: int | None = Field(default=None, ge=1, le=MAX_TARGET_ROWS, description="None = Auto")
    locale: str | None = Field(default=None, max_length=16, description="e.g. en_PK. None = Auto")
    edge_case_mode: Literal["none", "ai_recommended", "low", "medium", "high", "custom"] = "ai_recommended"
    privacy_mode: Literal["auto", "safe_default", "none", "custom"] = "auto"
    seed: int | None = None

    @model_validator(mode="after")
    def _prompt_required(self) -> "AnalyzeRequest":
        if self.mode == "prompt":
            if not self.prompt or not self.prompt.strip():
                raise ValueError("'prompt' is required when mode is 'prompt'")
            self.prompt = self.prompt.strip()
        return self


class AIRunMeta(BaseModel):
    provider: str
    model: str | None = None
    latency_ms: int
    fallbacks: int = 0


class AnalyzeResponse(BaseModel):
    plan: GenerationPlan
    ai: AIRunMeta


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list | dict | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
