"""Request/response contracts for accounts, history, saved schemas and saved datasets."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.plan import GenerationPlan

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def _clean_email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254 or not _EMAIL.match(v):
        raise ValueError("Enter a valid email address.")
    return v


def _clean_name(v: str) -> str:
    v = " ".join(v.split())
    if not 1 <= len(v) <= 80:
        raise ValueError("Name must be 1 to 80 characters.")
    return v


# ------------------------------------------------------------------ auth
class SignupRequest(BaseModel):
    name: str
    email: str
    password: str = Field(max_length=128)

    _n = field_validator("name")(_clean_name)
    _e = field_validator("email")(_clean_email)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(max_length=128)

    _e = field_validator("email")(_clean_email)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=20, max_length=4096)


class Preferences(BaseModel):
    """Mirrors the frontend Settings object. Unknown keys are rejected, so the column cannot be abused as storage."""

    model_config = ConfigDict(extra="forbid")

    workspace_name: str = Field(default="My Workspace", max_length=60)
    locale: str = Field(default="", max_length=16)
    rows: str = Field(default="", pattern=r"^\d{0,7}$")
    edge: Literal["none", "ai_recommended", "low", "medium", "high", "custom"] = "ai_recommended"
    privacy: Literal["auto", "safe_default", "none", "custom"] = "auto"
    seed: str = Field(default="", pattern=r"^-?\d{0,12}$")
    export_format: Literal["auto", "csv", "json", "zip"] = "auto"
    theme: Literal["dark", "light"] = "dark"
    density: Literal["comfortable", "compact"] = "comfortable"
    animations: bool = True
    depth: Literal["full", "reduced"] = "full"


class ProfilePatch(BaseModel):
    name: str | None = None
    preferences: Preferences | None = None

    @field_validator("name")
    @classmethod
    def _n(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)


class ChangePasswordRequest(BaseModel):
    current_password: str | None = Field(default=None, max_length=128)
    new_password: str = Field(max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str | None = Field(default=None, max_length=128)
    confirm_email: str | None = Field(default=None, max_length=254)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None
    has_password: bool
    has_google: bool
    email_verified: bool
    created_at: datetime
    last_login_at: datetime | None
    preferences: dict[str, Any]


class AuthResponse(BaseModel):
    """`token` is for API clients (Authorization: Bearer). Browsers are also given an HttpOnly session cookie and
    must send `csrf_token` back in the X-CSRF-Token header on state-changing requests."""

    user: UserOut
    token: str
    csrf_token: str
    expires_at: datetime


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    user_agent: str | None
    current: bool


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
