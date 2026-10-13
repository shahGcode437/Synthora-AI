"""Saved Generation Plans ("schemas"): reload one and generate again with no AI call."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.errors import ApiError
from app.config import get_settings
from app.db import get_db
from app.models.accounts import SchemaCreate, SchemaDetail, SchemaSummary, SchemaUpdate
from app.models.db import SavedSchema, User
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


def _own(db: Session, user: User, schema_id: str) -> SavedSchema:
    row = db.scalar(select(SavedSchema).where(SavedSchema.id == schema_id, SavedSchema.user_id == user.id))
    if row is None:
        raise ApiError(404, "not_found", "Schema not found.")
    return row


@router.get("", response_model=list[SchemaSummary])
def list_schemas(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[SchemaSummary]:
    rows = db.scalars(select(SavedSchema).where(SavedSchema.user_id == user.id)
                      .order_by(SavedSchema.updated_at.desc())).all()
    return [SchemaSummary(**_summary(r)) for r in rows]


@router.post("", status_code=201, response_model=SchemaDetail)
def create_schema(req: SchemaCreate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> SchemaDetail:
    count = db.scalar(select(func.count()).select_from(SavedSchema).where(SavedSchema.user_id == user.id)) or 0
    if count >= get_settings().max_schemas_per_user:
        raise ApiError(409, "limit_reached", f"You can keep up to {get_settings().max_schemas_per_user} schemas. Delete one first.")
    row = SavedSchema(user_id=user.id, name=req.name, description=req.description, plan=req.plan.model_dump(mode="json"))
    db.add(row)
    db.commit()
    return SchemaDetail(**_summary(row), plan=req.plan)


@router.get("/{schema_id}", response_model=SchemaDetail)
def get_schema(schema_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> SchemaDetail:
    row = _own(db, user, schema_id)
    return SchemaDetail(**_summary(row), plan=GenerationPlan.model_validate(row.plan))


@router.put("/{schema_id}", response_model=SchemaDetail)
def update_schema(schema_id: str, req: SchemaUpdate, user: User = Depends(current_user),
                  db: Session = Depends(get_db)) -> SchemaDetail:
    row = _own(db, user, schema_id)
    if req.name is not None:
        row.name = req.name
    if "description" in req.model_fields_set:
        row.description = req.description
    if req.plan is not None:
        row.plan = req.plan.model_dump(mode="json")
    db.commit()
    return SchemaDetail(**_summary(row), plan=GenerationPlan.model_validate(row.plan))


@router.delete("/{schema_id}", status_code=204)
def delete_schema(schema_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.delete(_own(db, user, schema_id))
    db.commit()
    return Response(status_code=204)
