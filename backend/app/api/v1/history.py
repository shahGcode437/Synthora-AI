"""Generation history and the workspace overview (all values come from stored rows)."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.workspace import current_workspace
from app.db import get_db
from app.models.library import HistoryPage, Overview, RunDetail, RunSummary
from app.models.db import GenerationRun, SavedDataset, SavedSchema

router = APIRouter(prefix="/api/v1", tags=["history"])


def run_summary(r: GenerationRun) -> RunSummary:
    return RunSummary(
        id=r.id, created_at=r.created_at, source_mode=r.source_mode, domain=r.domain, data_type=r.data_type,
        tables=r.tables, rows=r.rows, seed=r.seed, duration_ms=r.duration_ms, validation_passed=r.validation_passed,
        error_count=r.error_count, warning_count=r.warning_count, settings=r.settings or {},
    )


@router.get("/history", response_model=HistoryPage)
def list_history(
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    status: Literal["all", "passed", "failed"] = "all",
    ws: str = Depends(current_workspace), db: Session = Depends(get_db),
) -> HistoryPage:
    cond = [GenerationRun.workspace_id == ws]
    if status != "all":
        cond.append(GenerationRun.validation_passed == (status == "passed"))
    total = db.scalar(select(func.count()).select_from(GenerationRun).where(*cond)) or 0
    rows = db.scalars(select(GenerationRun).where(*cond).order_by(GenerationRun.created_at.desc())
                      .limit(limit).offset(offset)).all()
    return HistoryPage(items=[run_summary(r) for r in rows], total=total)


def _own_run(db: Session, ws: str, run_id: str) -> GenerationRun:
    run = db.scalar(select(GenerationRun).where(GenerationRun.id == run_id, GenerationRun.workspace_id == ws))
    if run is None:
        raise ApiError(404, "not_found", "Run not found.")
    return run


@router.get("/history/{run_id}", response_model=RunDetail)
def get_run(run_id: str, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> RunDetail:
    r = _own_run(db, ws, run_id)
    return RunDetail(**run_summary(r).model_dump(), plan=r.plan)


@router.delete("/history/{run_id}", status_code=204)
def delete_run(run_id: str, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> Response:
    db.delete(_own_run(db, ws, run_id))
    db.commit()
    return Response(status_code=204)


@router.delete("/history", status_code=204)
def clear_history(ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> Response:
    db.execute(delete(GenerationRun).where(GenerationRun.workspace_id == ws))
    db.commit()
    return Response(status_code=204)


@router.get("/overview", response_model=Overview)
def overview(ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> Overview:
    uid = GenerationRun.workspace_id == ws
    count = lambda *c: db.scalar(select(func.count()).select_from(GenerationRun).where(uid, *c)) or 0  # noqa: E731
    recent = db.scalars(select(GenerationRun).where(uid).order_by(GenerationRun.created_at.desc()).limit(5)).all()
    return Overview(
        generations=count(),
        rows_generated=db.scalar(select(func.coalesce(func.sum(GenerationRun.rows), 0)).where(uid)) or 0,
        passed=count(GenerationRun.validation_passed.is_(True)),
        failed=count(GenerationRun.validation_passed.is_(False)),
        schemas=db.scalar(select(func.count()).select_from(SavedSchema).where(SavedSchema.workspace_id == ws)) or 0,
        datasets=db.scalar(select(func.count()).select_from(SavedDataset).where(SavedDataset.workspace_id == ws)) or 0,
        last_run=run_summary(recent[0]) if recent else None,
        recent=[run_summary(r) for r in recent],
    )
