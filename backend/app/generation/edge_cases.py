"""Edge-case injection driven by plan.edge_cases.

Value edge cases (rare categories, outliers) run BEFORE derived fields so derived
values (e.g. running balances) stay consistent. Null injection runs AFTER, and
never touches keys, foreign keys, unique columns or columns other fields depend on.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Any

from app.generation.context import GenContext
from app.generation.generators import categorical_weights
from app.models.generation import EdgeCaseApplied
from app.models.plan import (
    ColumnPlan, DataType, EdgeCaseKind, EdgeCaseRecommendation, GeneratorStrategy, TablePlan,
)

_LEVEL_RATE = {"low": 0.02, "medium": 0.05, "high": 0.10}


@dataclass
class Target:
    table: str
    column: str
    rate: float
    rec: EdgeCaseRecommendation | None = None


@dataclass
class EdgePlan:
    nulls: list[Target]
    rare: list[Target]
    outliers: list[Target]


def _count(rate: float, n: int) -> int:
    return 0 if rate <= 0 or n == 0 else max(1, round(rate * n))


def _is_derived(c: ColumnPlan) -> bool:
    return c.generator.strategy == GeneratorStrategy.DERIVED


def _dependency_columns(table: TablePlan) -> set[str]:
    return {d for c in table.columns for d in c.generator.depends_on}


def _key_columns(ctx: GenContext, table: TablePlan) -> set[str]:
    return set(table.primary_key) | ctx.fk_columns(table) | {
        c.name for c in table.columns
        if c.is_primary_key or c.is_unique or c.generator.strategy in (
            GeneratorStrategy.DETERMINISTIC_ID, GeneratorStrategy.FOREIGN_KEY)
    }


def build_edge_plan(ctx: GenContext) -> EdgePlan:
    cfg = ctx.plan.edge_cases
    plan = EdgePlan([], [], [])
    if cfg.mode == "none":
        return plan
    level = _LEVEL_RATE.get(cfg.mode)
    g_null = level if level else (cfg.null_rate or 0.0)
    g_out = level if level else (cfg.outlier_rate or 0.0)
    g_rare = level if level else (cfg.rare_category_rate or 0.0)
    single = ctx.plan.tables[0].name if len(ctx.plan.tables) == 1 else None

    explicit: set[tuple[str, str, str]] = set()
    for rec in cfg.recommendations:
        tname = rec.table or single
        table = ctx.table(tname) if tname else None
        col = next((c for c in table.columns if c.name == rec.column), None) if table and rec.column else None
        if table is None or col is None:
            ctx.warn(f"edge case '{rec.name}': target table/column not found; skipped")
            continue
        if rec.kind == EdgeCaseKind.NULL_INJECTION:
            kind, bucket, default = "null", plan.nulls, g_null
        elif rec.kind in (EdgeCaseKind.RARE_CATEGORY, EdgeCaseKind.STATUS_SCENARIO):
            kind, bucket, default = "rare", plan.rare, g_rare
        elif rec.kind == EdgeCaseKind.OUTLIER:
            kind, bucket, default = "outlier", plan.outliers, g_out
        else:
            ctx.warn(f"edge case '{rec.name}' ({rec.kind.value}) is not implemented yet; skipped")
            continue
        rate = rec.rate if rec.rate is not None else default
        bucket.append(Target(table.name, col.name, rate, rec))
        explicit.add((kind, table.name, col.name))

    has_rare = any(k == "rare" for k, _, _ in explicit)
    has_out = any(k == "outlier" for k, _, _ in explicit)
    for table in ctx.plan.tables:
        for c in table.columns:
            if g_null > 0 and ("null", table.name, c.name) not in explicit:
                plan.nulls.append(Target(table.name, c.name, g_null))
            if (g_rare > 0 and not has_rare and c.generator.strategy == GeneratorStrategy.CATEGORICAL
                    and c.name not in _key_columns(ctx, table)):
                plan.rare.append(Target(table.name, c.name, g_rare))
            if (g_out > 0 and not has_out and c.generator.strategy == GeneratorStrategy.STATISTICAL
                    and c.name not in _key_columns(ctx, table)):
                plan.outliers.append(Target(table.name, c.name, g_out))
    return plan


def _log(ctx: GenContext, t: Target, kind: str, n: int, detail: str | None = None) -> None:
    ctx.edge_log.append(EdgeCaseApplied(table=t.table, column=t.column, kind=kind, rows_affected=n, detail=detail))


def apply_value_edge_cases(ctx: GenContext, edge: EdgePlan, table: TablePlan, rows: list[dict]) -> None:
    n = len(rows)
    cols = {c.name: c for c in table.columns}
    protected = _key_columns(ctx, table)

    for t in (x for x in edge.rare if x.table == table.name):
        col = cols[t.column]
        if t.column in protected or _is_derived(col):
            ctx.warn(f"edge case on key/derived column {table.name}.{t.column} skipped")
            continue
        values, weights, _ = categorical_weights(col)
        if len(values) < 2:
            continue
        text = " ".join(x for x in (t.rec.name, t.rec.description, t.rec.rationale) if x).lower() if t.rec else ""
        hits = [v for v in values if str(v).lower() in text]
        target = max(hits, key=lambda v: len(str(v))) if hits else values[weights.index(min(weights))]
        want = math.ceil(t.rate * n) if t.rate > 0 else 0
        have = sum(1 for r in rows if r[t.column] == target)
        candidates = [r for r in rows if r[t.column] != target]
        ctx.rng.shuffle(candidates)
        added = max(0, min(want - have, len(candidates)))
        for r in candidates[:added]:
            r[t.column] = target
        _log(ctx, t, "rare_category", added, f"ensured >= {want} rows of '{target}'")

    for t in (x for x in edge.outliers if x.table == table.name):
        col = cols[t.column]
        vals = [r[t.column] for r in rows if isinstance(r[t.column], (int, float))]
        if t.column in protected or _is_derived(col) or len(vals) < 2:
            continue
        sd = statistics.pstdev(vals)
        top = max(vals)
        if sd == 0:
            continue
        idx = ctx.rng.sample(range(n), min(_count(t.rate, n), n))
        for i in idx:
            v = top + (3 + 3 * ctx.rng.random()) * sd
            rows[i][t.column] = int(round(v)) if col.data_type == DataType.INTEGER else round(v, 2)
        _log(ctx, t, "outlier", len(idx), "values pushed 3-6 std above the current maximum")


def apply_null_injection(ctx: GenContext, edge: EdgePlan, table: TablePlan, rows: list[dict]) -> None:
    n = len(rows)
    cols = {c.name: c for c in table.columns}
    protected = _key_columns(ctx, table) | _dependency_columns(table)
    for t in (x for x in edge.nulls if x.table == table.name):
        col = cols[t.column]
        if not col.nullable:
            if t.rec:
                ctx.warn(f"null injection skipped: {table.name}.{t.column} is not nullable")
            continue
        if t.column in protected or _is_derived(col):
            if t.rec:
                ctx.warn(f"null injection skipped: {table.name}.{t.column} is a key or dependency")
            continue
        idx = ctx.rng.sample(range(n), min(_count(t.rate, n), n))
        for i in idx:
            rows[i][t.column] = None
        _log(ctx, t, "null_injection", len(idx))
