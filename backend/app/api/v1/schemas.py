"""Saved Generation Plans ("schemas"): reload one and generate again with no AI call."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.workspace import current_workspace
from app.config import get_settings
from app.db import get_db
from app.models.library import SchemaCreate, SchemaDetail, SchemaSummary, SchemaUpdate
from app.models.db import SavedSchema
from app.models.plan import GenerationPlan

router = APIRouter(prefix="/api/v1/schemas", tags=["schemas"])


def _summary(s: SavedSchema) -> dict:
    plan = s.plan or {}
    tables = plan.get("tables", [])
    return dict(
        id=s.id, name=s.name, description=s.description, domain=plan.get("domain", ""),
        tables=[t.get("name", "") for t in tables], columns=sum(len(t.get("columns", [])) for t in tables),
        source_mode=plan.get("source_mode", "prompt"), created_at=s.created_at, updated_at=s.updated_at,
    )


def _own(db: Session, ws: str, schema_id: str) -> SavedSchema:
    row = db.scalar(select(SavedSchema).where(SavedSchema.id == schema_id, SavedSchema.workspace_id == ws))
    if row is None:
        raise ApiError(404, "not_found", "Schema not found.")
    return row


@router.get("", response_model=list[SchemaSummary])
def list_schemas(ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> list[SchemaSummary]:
    rows = db.scalars(select(SavedSchema).where(SavedSchema.workspace_id == ws)
                      .order_by(SavedSchema.updated_at.desc())).all()
    return [SchemaSummary(**_summary(r)) for r in rows]


@router.post("", status_code=201, response_model=SchemaDetail)
def create_schema(req: SchemaCreate, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> SchemaDetail:
    count = db.scalar(select(func.count()).select_from(SavedSchema).where(SavedSchema.workspace_id == ws)) or 0
    if count >= get_settings().max_schemas_per_workspace:
        raise ApiError(409, "limit_reached", f"You can keep up to {get_settings().max_schemas_per_workspace} schemas. Delete one first.")
    row = SavedSchema(workspace_id=ws, name=req.name, description=req.description, plan=req.plan.model_dump(mode="json"))
    db.add(row)
    db.commit()
    return SchemaDetail(**_summary(row), plan=req.plan)


@router.get("/{schema_id}", response_model=SchemaDetail)
def get_schema(schema_id: str, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> SchemaDetail:
    row = _own(db, ws, schema_id)
    return SchemaDetail(**_summary(row), plan=GenerationPlan.model_validate(row.plan))


@router.put("/{schema_id}", response_model=SchemaDetail)
def update_schema(schema_id: str, req: SchemaUpdate, ws: str = Depends(current_workspace),
                  db: Session = Depends(get_db)) -> SchemaDetail:
    row = _own(db, ws, schema_id)
    if req.name is not None:
        row.name = req.name
    if "description" in req.model_fields_set:
        row.description = req.description
    if req.plan is not None:
        row.plan = req.plan.model_dump(mode="json")
    db.commit()
    return SchemaDetail(**_summary(row), plan=GenerationPlan.model_validate(row.plan))


@router.delete("/{schema_id}", status_code=204)
def delete_schema(schema_id: str, ws: str = Depends(current_workspace), db: Session = Depends(get_db)) -> Response:
    db.delete(_own(db, ws, schema_id))
    db.commit()
    return Response(status_code=204)
