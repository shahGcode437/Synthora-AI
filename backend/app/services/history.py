"""Record generation runs for signed-in users. Stores the plan and a validation summary, never the generated rows."""
from __future__ import annotations

import logging

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.db import GenerationRun, User
from app.models.generation import GenerateRequest, GenerateResponse

logger = logging.getLogger(__name__)


def record_generation(db: Session, user: User, req: GenerateRequest, res: GenerateResponse) -> None:
    """Best effort: a failure to record history must never fail the generation itself."""
    try:
        plan = req.plan
        v, m = res.validation, res.metadata
        db.add(GenerationRun(
            user_id=user.id, source_mode=plan.source_mode, domain=plan.domain[:120],
            data_type="relational" if m.tables_generated > 1 else "tabular",
            tables=m.tables_generated, rows=m.rows_generated, seed=m.seed, duration_ms=m.duration_ms,
            validation_passed=v.passed, error_count=v.error_count, warning_count=v.warning_count,
            settings={
                "target_rows": {t.name: t.target_rows for t in plan.tables},
                "locale": plan.locale, "faker_locale": m.faker_locale,
                "edge_case_mode": plan.edge_cases.mode, "privacy_mode": plan.privacy.mode,
                "seed_source": m.seed_source, "edge_cases_applied": len(m.edge_cases_applied),
            },
            plan=plan.model_dump(mode="json"),
        ))
        db.flush()
        cap = get_settings().max_history_per_user
        total = db.scalar(select(func.count()).select_from(GenerationRun).where(GenerationRun.user_id == user.id)) or 0
        if total > cap:  # keep the newest `cap` runs
            keep = select(GenerationRun.id).where(GenerationRun.user_id == user.id) \
                .order_by(GenerationRun.created_at.desc()).limit(cap)
            db.execute(delete(GenerationRun).where(GenerationRun.user_id == user.id, GenerationRun.id.not_in(keep)))
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("could not record generation history")
