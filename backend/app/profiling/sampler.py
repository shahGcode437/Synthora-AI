"""Compact representative sample for the AI context (random + nulls + rare + outliers)."""
from __future__ import annotations

import random

from app.models.profile import DatasetProfile
from app.profiling.csv_parser import ParsedCsv
from app.profiling.profiler import NULL_TOKENS, shape_mask

DEFAULT_ROWS = 12


def _is_null(v: str) -> bool:
    return v.strip().lower() in NULL_TOKENS


def build_sample(parsed: ParsedCsv, profile: DatasetProfile, k: int = DEFAULT_ROWS) -> list[dict]:
    rows = parsed.rows
    n = len(rows)
    rng = random.Random(0)  # fixed: same file -> same sample
    chosen: list[int] = []

    def take(candidates: list[int], limit: int) -> None:
        pool = [i for i in candidates if i not in chosen]
        rng.shuffle(pool)
        chosen.extend(pool[:limit])

    if n <= k:
        chosen = list(range(n))
    else:
        take([i for i, r in enumerate(rows) if any(_is_null(v) for v in r.values())], 2)

        rare: list[int] = []
        for c in profile.columns:
            if c.is_categorical and c.top_values:
                minority = {v.value for v in c.top_values if v.pct <= 10}
                rare += [i for i, r in enumerate(rows) if r[c.name].strip() in minority]
        take(rare, 2)

        outliers: list[int] = []
        for c in profile.columns:
            if c.is_numeric and c.min is not None:
                for i, r in enumerate(rows):
                    try:
                        x = float(r[c.name])
                    except ValueError:
                        continue
                    if x in (c.min, c.max):
                        outliers.append(i)
        take(outliers, 2)

        # useful unique examples: rows introducing values not yet seen in categorical columns
        take(list(range(n)), k - len(chosen))

    private = {c.name for c in profile.columns if c.pii_hint or c.is_identifier or c.id_repeat}
    out = []
    for i in sorted(chosen):
        out.append({
            h: (None if _is_null(v) else shape_mask(v.strip()) if h in private else v.strip())
            for h, v in rows[i].items()
        })
    return out
