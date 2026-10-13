"""ORM tables. Every row carries a workspace_id (an anonymous per-browser id) and is always queried with it."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; they are always UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class GenerationRun(Base):
    """One row per generation made with a workspace id. Stores the plan and a validation summary, never the data."""

    __tablename__ = "generation_runs"
    __table_args__ = (Index("ix_generation_runs_workspace_created", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    source_mode: Mapped[str] = mapped_column(String(10))
    domain: Mapped[str] = mapped_column(String(120))
    data_type: Mapped[str] = mapped_column(String(12))  # tabular | relational
    tables: Mapped[int] = mapped_column(Integer)
    rows: Mapped[int] = mapped_column(Integer)
    seed: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    validation_passed: Mapped[bool] = mapped_column(Boolean)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    plan: Mapped[dict] = mapped_column(JSON)


class SavedSchema(Base):
    """A saved Generation Plan that can be reloaded and generated again without any AI call."""

    __tablename__ = "saved_schemas"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SavedDataset(Base):
    """A dataset the user chose to keep. Rows are stored gzip-compressed JSON."""

    __tablename__ = "saved_datasets"
    __table_args__ = (Index("ix_saved_datasets_workspace_created", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    source_mode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tables: Mapped[list] = mapped_column(JSON)  # [{name, rows, columns}]
    total_rows: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)  # uncompressed JSON size
    plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # summary only
    data_gz: Mapped[bytes] = mapped_column(LargeBinary)
