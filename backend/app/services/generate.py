"""Generate service: plan -> rows -> validation."""
from __future__ import annotations

import time

from app.generation.engine import generate
from app.models.generation import GenerateRequest, GenerateResponse, GenerationMetadata
from app.validation.validator import validate


def generate_dataset(req: GenerateRequest) -> GenerateResponse:
    start = time.perf_counter()
    out = generate(req.plan, seed=req.seed, default_rows=req.default_rows)
    report = validate(req.plan, out.data, out.derived_meta)
    per_table = {name: len(rows) for name, rows in out.data.items()}
    return GenerateResponse(
        data=out.data,
        validation=report,
        warnings=out.warnings,
        metadata=GenerationMetadata(
            tables_generated=len(per_table),
            rows_generated=sum(per_table.values()),
            rows_per_table=per_table,
            generation_order=out.order,
            seed=out.seed,
            seed_source=out.seed_source,  # type: ignore[arg-type]
            locale=req.plan.locale,
            faker_locale=out.faker_locale,
            edge_cases_applied=out.edge_log,
            duration_ms=int((time.perf_counter() - start) * 1000),
        ),
    )
