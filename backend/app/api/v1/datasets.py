"""Saved datasets: generated data the user chose to keep (gzip-compressed JSON, per-workspace access)."""
from __future__ import annotations

import gzip
import json
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.workspace import current_workspace
from app.config import get_settings
from app.db import get_db
from app.models.library import DatasetCreate, DatasetDetail, DatasetSummary, DatasetTableMeta
from app.models.db import SavedDataset

router = APIRouter(prefix="/api/v1/datasets", tags=["datasets"])
PREVIEW_ROWS = 50


def _summary(d: SavedDataset) -> dict:
    return dict(id=d.id, name=d.name, created_at=d.created_at, source_mode=d.source_mode, seed=d.seed,
                tables=[DatasetTableMeta(**t) for t in d.tables], total_rows=d.total_rows, size_bytes=d.size_bytes,
                validation=d.validation)


def _own(db: Session, ws: str, dataset_id: str) -> SavedDataset:
    row = db.scalar(select(SavedDataset).where(SavedDataset.id == dataset_id, SavedDataset.workspace_id == ws))
    if row is None:
        raise ApiError(404, "not_found", "Dataset not found.")
    return row


def _load(d: SavedDataset) -> dict[str, list[dict[str, Any]]]:
    return json.loads(gzip.decompress(d.data_gz))


def _clean_validation(v: dict | None) -> dict | None:
    """Keep only three scalar facts from the client-supplied validation report."""
    if not isinstance(v, dict):
        return None
    out: dict[str, Any] = {}
    if isinstance(v.get("passed"), bool):
        out["passed"] = v["passed"]
    for k in ("error_count", "warning_count"):
        if isinstance(v.get(k), int) and not isinstance(v[k], bool) and v[k] >= 0:
            out[k] = v[k]
    return out or None


@router.get("", response_model=list[DatasetSummary])
def list_datasets(ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> list[DatasetSummary]:
    rows = db.scalars(select(SavedDataset).where(SavedDataset.workspace_id == ws)
                      .order_by(SavedDataset.created_at.desc())).all()
    return [DatasetSummary(**_summary(r)) for r in rows]


@router.post("", status_code=201, response_model=DatasetSummary)
def create_dataset(req: DatasetCreate, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> DatasetSummary:
    cfg = get_settings()
    if not req.data or any(not rows for rows in req.data.values()):
        raise ApiError(422, "invalid_dataset", "Every table must have at least one row.")
    if not all(isinstance(r, dict) for rows in req.data.values() for r in rows[:50]):
        raise ApiError(422, "invalid_dataset", "Rows must be objects.")
    count = db.scalar(select(func.count()).select_from(SavedDataset).where(SavedDataset.workspace_id == ws)) or 0
    if count >= cfg.max_datasets_per_workspace:
        raise ApiError(409, "limit_reached", f"You can keep up to {cfg.max_datasets_per_workspace} datasets. Delete one first.")
    raw = json.dumps(req.data, separators=(",", ":"), default=str).encode()
    if len(raw) > cfg.max_dataset_bytes:
        raise ApiError(413, "dataset_too_large",
                       f"This dataset is {len(raw) // 1024:,} KB; the limit is {cfg.max_dataset_bytes // 1024:,} KB. "
                       "Generate fewer rows, or export it instead.")
    row = SavedDataset(
        workspace_id=ws, name=req.name, source_mode=req.source_mode, seed=req.seed,
        tables=[{"name": n, "rows": len(r), "columns": list(r[0].keys())} for n, r in req.data.items()],
        total_rows=sum(len(r) for r in req.data.values()), size_bytes=len(raw),
        plan=req.plan.model_dump(mode="json") if req.plan else None,
        validation=_clean_validation(req.validation), data_gz=gzip.compress(raw, compresslevel=6),
    )
    db.add(row)
    db.commit()
    return DatasetSummary(**_summary(row))


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: str, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> DatasetDetail:
    row = _own(db, ws, dataset_id)
    preview = {name: rows[:PREVIEW_ROWS] for name, rows in _load(row).items()}
    return DatasetDetail(**_summary(row), plan=row.plan, preview=preview)


@router.get("/{dataset_id}/data")
def get_dataset_data(dataset_id: str, ws: str = Depends(current_workspace),
                     db: Session = Depends(get_db)) -> dict[str, list[dict[str, Any]]]:
    return _load(_own(db, ws, dataset_id))


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> Response:
    db.delete(_own(db, ws, dataset_id))
    db.commit()
    return Response(status_code=204)
