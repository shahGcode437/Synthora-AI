"""Request/response contracts for POST /api/v1/generate."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.plan import GenerationPlan

CheckStatus = Literal["passed", "warning", "error", "skipped"]


class GenerateRequest(BaseModel):
    plan: GenerationPlan
    seed: int | None = Field(default=None, description="Overrides plan.seed when given.")
    default_rows: int | None = Field(
        default=None, ge=1, le=1_000_000, description="Used for tables without a target_rows."
    )


class CheckResult(BaseModel):
    name: str
    status: CheckStatus
    message: str
    count: int | None = None
    examples: list[str] = Field(default_factory=list)


class TableValidation(BaseModel):
    table: str
    rows: int
    passed: bool
    checks: list[CheckResult]


class ValidationReport(BaseModel):
    passed: bool
    error_count: int
    warning_count: int
    tables: list[TableValidation]
    rules: list[CheckResult] = Field(default_factory=list)


class EdgeCaseApplied(BaseModel):
    table: str
    column: str
    kind: str
    rows_affected: int
    detail: str | None = None


class GenerationMetadata(BaseModel):
    tables_generated: int
    rows_generated: int
    rows_per_table: dict[str, int]
    generation_order: list[str]
    seed: int
    seed_source: Literal["request", "plan", "random"]
    locale: str | None
    faker_locale: str
    edge_cases_applied: list[EdgeCaseApplied] = Field(default_factory=list)
    duration_ms: int


class GenerateResponse(BaseModel):
    data: dict[str, list[dict[str, Any]]]
    validation: ValidationReport
    warnings: list[str]
    metadata: GenerationMetadata
