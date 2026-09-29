"""Analyze service: turns an AnalyzeRequest into a normalized GenerationPlan."""
from __future__ import annotations

from app.ai.prompts import build_schema_analysis_request
from app.ai.router import LLMRouter
from app.models.api import AnalyzeRequest, AnalyzeResponse
from app.models.plan import GenerationPlan


class ModeNotSupportedError(Exception):
    pass


def apply_user_controls(plan: GenerationPlan, req: AnalyzeRequest) -> GenerationPlan:
    """User-chosen controls are authoritative and applied by code, not left to the LLM."""
    plan.source_mode = req.mode
    if req.locale:
        plan.locale = req.locale
    if req.seed is not None:
        plan.seed = req.seed
    if req.target_rows is not None:
        for table in plan.tables:
            # In multi-table plans, child tables keep AI-proposed row counts when given.
            if table.target_rows is None or not plan.relationships:
                table.target_rows = req.target_rows
    plan.edge_cases.mode = req.edge_case_mode
    if req.edge_case_mode == "none":
        plan.edge_cases.recommendations = []
    plan.privacy.mode = req.privacy_mode
    return plan


async def analyze(req: AnalyzeRequest, router: LLMRouter) -> AnalyzeResponse:
    if req.mode != "prompt":
        raise ModeNotSupportedError("Sample-data mode needs a file upload: use POST /api/v1/analyze/sample.")
    plan, meta = await router.complete_structured(build_schema_analysis_request(req), GenerationPlan)
    return AnalyzeResponse(plan=apply_user_controls(plan, req), ai=meta)
