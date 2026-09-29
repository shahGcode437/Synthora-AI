"""Deterministic profile of an uploaded CSV. Computed locally; never by an LLM."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Dtype = Literal["string", "integer", "float", "boolean", "date", "datetime"]


class ValueFreq(BaseModel):
    value: str
    count: int
    pct: float


class ColumnProfile(BaseModel):
    name: str
    dtype: Dtype
    row_count: int
    null_count: int
    null_pct: float
    unique_count: int
    unique_ratio: float
    sample_values: list[str] = Field(default_factory=list)  # PII columns hold shape masks, never raw values

    # numeric
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    median: float | None = None
    std: float | None = None
    quantiles: dict[str, float] | None = None
    log_mean: float | None = None  # of ln(x), positive columns only
    log_std: float | None = None

    # categorical
    top_values: list[ValueFreq] = Field(default_factory=list)

    # dates
    date_min: str | None = None
    date_max: str | None = None
    date_format: str | None = None

    # strings
    str_len: dict[str, float] | None = None

    # signals
    is_categorical: bool = False
    is_numeric: bool = False
    is_date: bool = False
    is_identifier: bool = False
    id_like_name: bool = False
    candidate_primary_key: bool = False
    id_pattern: dict | None = None
    id_repeat: dict[str, float] | None = None  # for repeated id-like columns
    pattern_hints: list[str] = Field(default_factory=list)
    pii_hint: str | None = None
    rank_counts: list[int] = Field(default_factory=list, exclude=True, description="value frequencies, descending (internal)")


class DatasetProfile(BaseModel):
    table_name: str
    total_rows: int
    total_columns: int
    delimiter: str
    columns: list[ColumnProfile]
    likely_identifiers: list[str] = Field(default_factory=list)
    likely_categorical: list[str] = Field(default_factory=list)
    likely_numeric: list[str] = Field(default_factory=list)
    likely_date: list[str] = Field(default_factory=list)
    likely_pii: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    def column(self, name: str) -> ColumnProfile | None:
        return next((c for c in self.columns if c.name == name), None)
