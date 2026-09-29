from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import ValidationError

from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.models.api import MAX_TARGET_ROWS, AnalyzeRequest, ErrorResponse, SampleAnalyzeResponse
from app.profiling.csv_parser import MAX_BYTES, SampleInputError
from app.services.sample import analyze_sample

router = APIRouter(prefix="/api/v1", tags=["analyze"])


@router.post(
    "/analyze/sample",
    response_model=SampleAnalyzeResponse,
    responses={
        413: {"model": ErrorResponse, "description": "File too large"},
        422: {"model": ErrorResponse, "description": "Invalid file or controls"},
        502: {"model": ErrorResponse, "description": "All AI providers failed"},
        503: {"model": ErrorResponse, "description": "No AI provider configured"},
    },
)
async def analyze_sample_endpoint(
    file: UploadFile = File(..., description="CSV file (UTF-8)"),
    instruction: str | None = Form(default=None, max_length=8000),
    target_rows: int | None = Form(default=None, ge=1, le=MAX_TARGET_ROWS),
    locale: str | None = Form(default=None),
    edge_case_mode: Literal["none", "ai_recommended", "low", "medium", "high", "custom"] = Form(default="ai_recommended"),
    privacy_mode: Literal["auto", "safe_default", "none", "custom"] = Form(default="auto"),
    seed: int | None = Form(default=None),
    llm: LLMRouter = Depends(get_llm_router),
) -> SampleAnalyzeResponse:
    """Profile an uploaded CSV locally, then have the AI interpret it into a Generation Plan."""
    try:
        req = AnalyzeRequest(mode="sample", prompt=instruction, target_rows=target_rows,
                             locale=locale or None, edge_case_mode=edge_case_mode,
                             privacy_mode=privacy_mode, seed=seed)
    except ValidationError as exc:
        raise SampleInputError("; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())) from None
    data = await file.read(MAX_BYTES + 1)  # bounded read: never buffer an unbounded upload
    return await analyze_sample(data, file.filename, instruction, req, llm)
