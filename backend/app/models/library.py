"""Request/response contracts for history, saved schemas and saved datasets."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.plan import GenerationPlan

def _clean_name(v: str) -> str:
    v = " ".join(v.split())
    if not 1 <= len(v) <= 80:
        raise ValueError("Name must be 1 to 80 characters.")
    return v


# ------------------------------------------------------------------ history
class RunSummary(BaseModel):
    id: str
    created_at: datetime
    source_mode: str
    domain: str
    data_type: str
    tables: int
    rows: int
    seed: int
    duration_ms: int
    validation_passed: bool
    error_count: int
    warning_count: int
    settings: dict[str, Any]


class RunDetail(RunSummary):
    plan: dict[str, Any]


class HistoryPage(BaseModel):
    items: list[RunSummary]
    total: int


class Overview(BaseModel):
    generations: int
    rows_generated: int
    passed: int
    failed: int
    schemas: int
    datasets: int
    last_run: RunSummary | None
    recent: list[RunSummary]


# ------------------------------------------------------------------ saved schemas
class SchemaCreate(BaseModel):
    name: str
    description: str | None = Field(default=None, max_length=500)
    plan: GenerationPlan

    _n = field_validator("name")(_clean_name)


class SchemaUpdate(BaseModel):
    name: str | None = None
    description: str | None = Field(default=None, max_length=500)
    plan: GenerationPlan | None = None

    @field_validator("name")
    @classmethod
    def _n(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)


class SchemaSummary(BaseModel):
    id: str
    name: str
    description: str | None
    domain: str
    tables: list[str]
    columns: int
    source_mode: str
    created_at: datetime
    updated_at: datetime


class SchemaDetail(SchemaSummary):
    plan: GenerationPlan


# ------------------------------------------------------------------ saved datasets
class DatasetCreate(BaseModel):
    name: str
    data: dict[str, list[dict[str, Any]]]
    plan: GenerationPlan | None = None
    validation: dict[str, Any] | None = None  # only passed / error_count / warning_count are kept
    seed: int | None = None
    source_mode: Literal["prompt", "sample"] | None = None

    _n = field_validator("name")(_clean_name)


class DatasetTableMeta(BaseModel):
    name: str
    rows: int
    columns: list[str]


class DatasetSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    source_mode: str | None
    seed: int | None
    tables: list[DatasetTableMeta]
    total_rows: int
    size_bytes: int
    validation: dict[str, Any] | None


class DatasetDetail(DatasetSummary):
    plan: dict[str, Any] | None
    preview: dict[str, list[dict[str, Any]]]
