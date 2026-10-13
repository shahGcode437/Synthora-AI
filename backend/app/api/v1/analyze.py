from fastapi import APIRouter, Depends

from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.models.api import AnalyzeRequest, AnalyzeResponse, ErrorResponse
from app.services.analyze import analyze

router = APIRouter(prefix="/api/v1", tags=["analyze"])


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={
        422: {"model": ErrorResponse, "description": "Invalid request"},
        501: {"model": ErrorResponse, "description": "Mode not implemented yet"},
        502: {"model": ErrorResponse, "description": "All AI providers failed"},
        503: {"model": ErrorResponse, "description": "No AI provider configured"},
    },
)
async def analyze_endpoint(req: AnalyzeRequest, llm: LLMRouter = Depends(get_llm_router)) -> AnalyzeResponse:
    """Understand the input and return an editable Generation Plan."""
    return await analyze(req, llm)
