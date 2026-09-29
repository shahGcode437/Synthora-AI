"""Generation engine: GenerationPlan -> rows.

Order per table: base columns -> value edge cases -> derived columns -> null injection.
Tables are generated parents-first so foreign keys sample real parent keys.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.generation.context import DerivedMeta, GenContext, GenerationError, make_faker
from app.generation.derived import compute_derived
from app.generation.edge_cases import apply_null_injection, apply_value_edge_cases, build_edge_plan
from app.generation.generators import generate_column
from app.models.generation import EdgeCaseApplied
from app.models.plan import GenerationPlan, GeneratorStrategy, TablePlan

DEFAULT_ROWS = 100
MAX_ROWS_PER_TABLE = 100_000


@dataclass
class GenerationOutput:
    data: dict[str, list[dict[str, Any]]]
    warnings: list[str]
    seed: int
    seed_source: str
    faker_locale: str
    order: list[str]
    edge_log: list[EdgeCaseApplied]
    derived_meta: list[DerivedMeta]


def table_order(plan: GenerationPlan, ctx: GenContext) -> list[str]:
    """Parents before children (Kahn's algorithm, plan order preserved for ties)."""
    names = [t.name for t in plan.tables]
    deps: dict[str, set[str]] = {n: set() for n in names}
    for t in plan.tables:
        for fk in t.foreign_keys:
            deps[t.name].add(fk.references_table)
        for c in t.columns:
            target = ctx.resolve_fk(t, c) if c.generator.strategy == GeneratorStrategy.FOREIGN_KEY else None
            if target:
                deps[t.name].add(target[0])
    for r in plan.relationships:
        deps[r.child_table].add(r.parent_table)
    for n in names:
        deps[n] &= set(names)
        deps[n].discard(n)  # self-references cannot order tables

    order: list[str] = []
    while len(order) < len(names):
        ready = [n for n in names if n not in order and deps[n] <= set(order)]
        if not ready:
            rest = [n for n in names if n not in order]
            ctx.warn(f"circular table dependencies among {rest}; generated in plan order")
            order.extend(rest)
            break
        order.append(ready[0])
    return order


def _derived_order(table: TablePlan, ctx: GenContext) -> list:
    """Derived columns sorted so each is computed after the derived columns it depends on."""
    pending = [c for c in table.columns if c.generator.strategy == GeneratorStrategy.DERIVED]
    ordered: list = []
    while pending:
        waiting = {c.name for c in pending}
        nxt = next((c for c in pending if not (set(c.generator.depends_on) & waiting) - {c.name}), None)
        if nxt is None:
            ctx.warn(f"{table.name}: circular derived dependencies; computed in plan order")
            ordered.extend(pending)
            break
        ordered.append(nxt)
        pending.remove(nxt)
    return ordered


def generate(plan: GenerationPlan, seed: int | None = None, default_rows: int | None = None) -> GenerationOutput:
    if seed is not None:
        used, source = seed, "request"
    elif plan.seed is not None:
        used, source = plan.seed, "plan"
    else:
        used, source = random.SystemRandom().randrange(2**31), "random"

    faker, faker_locale, pack, warning = make_faker(plan.locale, used)
    ctx = GenContext(
        plan=plan, seed=used, rng=random.Random(used), np_rng=np.random.default_rng(used),
        faker=faker, faker_locale=faker_locale, pack=pack,
    )
    if warning:
        ctx.warn(warning)

    order = table_order(plan, ctx)
    edge = build_edge_plan(ctx)
    for name in order:
        table = ctx.table(name)
        n = table.target_rows or default_rows
        if not n:
            n = DEFAULT_ROWS
            ctx.warn(f"{name}: no target_rows; defaulted to {DEFAULT_ROWS}")
        if n > MAX_ROWS_PER_TABLE:
            raise GenerationError(f"{name}: {n} rows exceeds the limit of {MAX_ROWS_PER_TABLE} per table")

        rows: list[dict[str, Any]] = [{} for _ in range(n)]
        for col in table.columns:
            if col.generator.strategy == GeneratorStrategy.DERIVED:
                continue
            for r, v in zip(rows, generate_column(ctx, table, col, n)):
                r[col.name] = v
        apply_value_edge_cases(ctx, edge, table, rows)
        for col in _derived_order(table, ctx):
            compute_derived(ctx, table, col, rows)
        apply_null_injection(ctx, edge, table, rows)
        ctx.rows[name] = [{c.name: r.get(c.name) for c in table.columns} for r in rows]

    return GenerationOutput(
        data=ctx.rows, warnings=ctx.warnings, seed=used, seed_source=source, faker_locale=faker_locale,
        order=order, edge_log=ctx.edge_log, derived_meta=ctx.derived_meta,
    )
