from fastapi import APIRouter

from app.models.api import ErrorResponse
from app.models.generation import GenerateRequest, GenerateResponse
from app.services.generate import generate_dataset

router = APIRouter(prefix="/api/v1", tags=["generate"])


@router.post(
    "/generate",
    response_model=GenerateResponse,
    responses={422: {"model": ErrorResponse, "description": "Invalid plan or request"}},
)
def generate_endpoint(req: GenerateRequest) -> GenerateResponse:
    """Generate synthetic rows from a Generation Plan and validate them (CPU-bound, runs in a threadpool)."""
    return generate_dataset(req)
