from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import ai_user
from app.db import get_db
from app.models.api import ErrorResponse
from app.models.db import User
from app.models.generation import GenerateRequest, GenerateResponse
from app.services.generate import generate_dataset
from app.services.history import record_generation

router = APIRouter(prefix="/api/v1", tags=["generate"])


@router.post(
    "/generate",
    response_model=GenerateResponse,
    responses={422: {"model": ErrorResponse, "description": "Invalid plan or request"}},
)
def generate_endpoint(req: GenerateRequest, user: User | None = Depends(ai_user),
                      db: Session = Depends(get_db)) -> GenerateResponse:
    """Generate synthetic rows from a Generation Plan and validate them (CPU-bound, runs in a threadpool).

    Anonymous use is allowed (unless AUTH_REQUIRED_FOR_AI). Signed-in runs are added to the user's history."""
    res = generate_dataset(req)
    if user is not None:
        record_generation(db, user, req, res)
    return res
