"""Sample-data (CSV) analysis: parse -> profile -> sample -> AI -> ground -> plan."""
from __future__ import annotations

from app.ai.prompts import build_sample_analysis_request
from app.ai.router import LLMRouter
from app.models.api import AnalyzeRequest, SampleAnalyzeResponse
from app.models.plan import GenerationPlan
from app.profiling.csv_parser import parse_csv
from app.profiling.profiler import profile_dataset
from app.profiling.sampler import build_sample
from app.services.analyze import apply_user_controls
from app.services.grounding import apply_privacy_mode, ground_plan


async def analyze_sample(
    data: bytes, filename: str | None, instruction: str | None, req: AnalyzeRequest, router: LLMRouter
) -> SampleAnalyzeResponse:
    parsed = parse_csv(data, filename)          # raises SampleInputError; source bytes are not stored
    profile = profile_dataset(parsed)
    sample = build_sample(parsed, profile)

    plan, meta = await router.complete_structured(
        build_sample_analysis_request(profile, sample, instruction, req), GenerationPlan)

    target = req.target_rows or profile.total_rows       # explicit control wins; else follow the source
    plan, warnings = ground_plan(plan, profile, instruction, target)
    plan = apply_user_controls(plan, req)                # locale, seed, edge/privacy modes, target_rows
    warnings += apply_privacy_mode(plan, req.privacy_mode)
    plan.warnings = list(dict.fromkeys(plan.warnings + warnings))
    return SampleAnalyzeResponse(plan=plan, ai=meta, profile=profile, sample_rows=sample, warnings=profile.warnings)
