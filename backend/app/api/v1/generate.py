from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.workspace import optional_workspace
from app.db import get_db
from app.models.api import ErrorResponse
from app.models.generation import GenerateRequest, GenerateResponse
from app.services.generate import generate_dataset
from app.services.history import record_generation

router = APIRouter(prefix="/api/v1", tags=["generate"])


@router.post(
    "/generate",
    response_model=GenerateResponse,
    responses={422: {"model": ErrorResponse, "description": "Invalid plan or request"}},
)
def generate_endpoint(req: GenerateRequest, ws: str | None = Depends(optional_workspace),
                      db: Session = Depends(get_db)) -> GenerateResponse:
    """Generate synthetic rows from a Generation Plan and validate them (CPU-bound, runs in a threadpool).

    Runs made with an X-Workspace-Id header are added to that workspace's history; others are not recorded."""
    res = generate_dataset(req)
    if ws is not None:
        record_generation(db, ws, req, res)
    return res
