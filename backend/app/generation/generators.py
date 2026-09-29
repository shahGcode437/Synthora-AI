"""Generation Router: one handler per non-derived strategy.

Handlers only produce values for a single column. Keys, FK integrity and
uniqueness are guaranteed here by code, never by Faker or an LLM.
"""
from __future__ import annotations

import math
import re
import uuid
from collections.abc import Callable
from datetime import date, datetime
from typing import Any

from app.generation.context import GenContext
from app.models.plan import ColumnPlan, DataType, GeneratorStrategy, TablePlan

# semantic_type / column name token -> Faker provider
_SEMANTIC_PROVIDERS: list[tuple[str, str]] = [
    ("email", "email"), ("first_name", "first_name"), ("last_name", "last_name"),
    ("person_name", "name"), ("full_name", "name"), ("username", "user_name"),
    ("phone", "phone_number"), ("mobile", "phone_number"), ("birth", "date_of_birth"),
    ("address", "address"), ("city", "city"), ("country", "country"), ("company", "company"),
    ("merchant", "company"), ("business", "company"), ("uuid", "uuid4"), ("url", "url"),
    ("postal", "postcode"), ("zip", "postcode"), ("job", "job"), ("description", "sentence"),
    ("note", "sentence"), ("name", "name"),
]


def semantic_provider(col: ColumnPlan) -> str | None:
    keys = [col.semantic_type.lower(), col.name.lower()]
    for key in keys:
        for token, provider in _SEMANTIC_PROVIDERS:
            if token in key:
                return provider
    if col.data_type == DataType.DATE:
        return "date_between"
    if col.data_type == DataType.DATETIME:
        return "date_time_between"
    return None


def _num(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


# ---------------------------------------------------------------- deterministic ids
def _ids(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    p = col.generator.params
    gen = (col.generator.generator or "").lower()
    if col.data_type == DataType.UUID or gen in ("uuid", "uuid4"):
        return [str(uuid.UUID(int=ctx.rng.getrandbits(128), version=4)) for _ in range(n)]
    if col.data_type == DataType.INTEGER:
        start = int(_num(p.get("start")) or 1)
        return list(range(start, start + n))
    prefix = str(p.get("prefix", f"{col.name.upper()[:4]}-"))
    width = max(len(str(n)), int(_num(p.get("width")) or 6))
    return [f"{prefix}{i:0{width}d}" for i in range(1, n + 1)]


# ---------------------------------------------------------------- categorical
def categorical_weights(col: ColumnPlan) -> tuple[list[Any], list[float], list[str]]:
    """Return (values, normalized weights, problems). Bad weights never crash."""
    problems: list[str] = []
    values = list(col.allowed_values or [])
    raw = col.generator.params.get("weights")
    weights: list[float] = []
    if isinstance(raw, dict):
        if not values:
            values = [str(k) for k in raw]
        for v in values:
            w = _num(raw.get(v, raw.get(str(v))))
            if w is None or w < 0:
                problems.append(f"'{v}' has a missing/invalid weight")
                w = 0.0
            weights.append(w)
    elif isinstance(raw, list) and len(raw) == len(values):
        weights = [max(_num(w) or 0.0, 0.0) for w in raw]
    elif raw is not None:
        problems.append("weights must be an object or a list matching allowed_values")
    if not weights or sum(weights) <= 0:
        if raw is not None:
            problems.append("weights sum to zero; using uniform distribution")
        weights = [1.0] * len(values)
    total = sum(weights) or 1.0
    return values, [w / total for w in weights], problems


def _categorical(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    values, weights, problems = categorical_weights(col)
    for pr in problems:
        ctx.warn(f"{table.name}.{col.name}: {pr}")
    if not values:
        ctx.warn(f"{table.name}.{col.name}: categorical column has no allowed_values; left empty")
        return [None] * n
    return ctx.rng.choices(values, weights=weights, k=n)


# ---------------------------------------------------------------- statistical
def _statistical(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    p = col.generator.params
    gen = (col.generator.generator or "").lower()
    lo = _num(p.get("min", p.get("low")))
    hi = _num(p.get("max", p.get("high")))
    mean = _num(p.get("mean", p.get("mu")))
    std = _num(p.get("std", p.get("sigma", p.get("stddev"))))
    rng = ctx.np_rng

    if gen in ("lognormal", "log_normal"):
        vals = rng.lognormal(mean if mean is not None else 3.0, std if std and std > 0 else 1.0, n)
    elif gen in ("normal", "gaussian") or (not gen and mean is not None):
        if mean is None:
            mean = (lo + hi) / 2 if lo is not None and hi is not None else 0.0
        if not std or std <= 0:
            std = (hi - lo) / 6 if lo is not None and hi is not None and hi > lo else 1.0
        vals = rng.normal(mean, std, n)
    elif gen == "poisson":
        vals = rng.poisson(_num(p.get("lam", p.get("lambda", mean))) or 5.0, n)
    elif gen in ("exponential", "exp"):
        vals = rng.exponential(_num(p.get("scale", mean)) or 1.0, n)
    elif gen in ("uniform", "integer", "int", "randint", "range", "") and lo is not None and hi is not None:
        vals = rng.uniform(lo, hi, n)
    else:
        ctx.warn(f"{table.name}.{col.name}: could not infer distribution from params; used uniform(0, 100)")
        vals = rng.uniform(0, 100, n)

    out: list[Any] = []
    for v in vals:
        v = float(v)
        if lo is not None:
            v = max(v, lo)
        if hi is not None:
            v = min(v, hi)
        out.append(int(round(v)) if col.data_type == DataType.INTEGER else round(v, 2))
    return out


# ---------------------------------------------------------------- foreign keys
def _fk(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    target = ctx.resolve_fk(table, col)
    if target is None:
        ctx.warn(f"{table.name}.{col.name}: foreign_key strategy but no referenced table/column; left empty")
        return [None] * n
    parent, parent_col = target
    parent_rows = ctx.rows.get(parent)
    if not parent_rows:
        ctx.warn(f"{table.name}.{col.name}: parent {parent} has no generated rows (self-reference or cycle?); left empty")
        return [None] * n
    pool = [r[parent_col] for r in parent_rows]
    if n >= len(pool):  # every parent gets at least one child, remainder random
        vals = pool + ctx.rng.choices(pool, k=n - len(pool))
        ctx.rng.shuffle(vals)
        return vals
    return ctx.rng.sample(pool, n)


# ---------------------------------------------------------------- faker
def _coerce(v: Any, dt: DataType) -> Any:
    if v is None:
        return v
    if dt == DataType.DATE:
        return v.date() if isinstance(v, datetime) else v
    if dt == DataType.DATETIME:
        return datetime.combine(v, datetime.min.time()) if isinstance(v, date) and not isinstance(v, datetime) else v
    if dt == DataType.STRING:
        return re.sub(r"\s*\n\s*", ", ", v) if isinstance(v, str) else str(v)
    if dt == DataType.INTEGER:
        return int(v)
    if dt in (DataType.FLOAT, DataType.DECIMAL):
        return float(v)
    if dt == DataType.UUID:
        return str(v)
    return v


def _clean_date_param(v: Any) -> Any:
    # Faker reads a lowercase 'm' as minutes; LLMs mean months.
    if isinstance(v, str) and re.fullmatch(r"[+-]?\d+\s*m", v.strip()):
        return v.strip()[:-1] + "M"
    return v


def faker_call(ctx: GenContext, table: TablePlan, col: ColumnPlan) -> Callable[[], Any]:
    gen = (col.generator.generator or "").strip()
    fk = ctx.faker
    name = gen if gen and not gen.startswith("_") and callable(getattr(fk, gen, None)) else None
    if name is None:
        name = semantic_provider(col)
        if gen:
            ctx.warn(f"{table.name}.{col.name}: unknown Faker provider '{gen}'; used '{name or 'word'}'")
        elif name is None:
            ctx.warn(f"{table.name}.{col.name}: no Faker provider inferred; used 'word'")
        name = name or "word"
    if name == "date_between" and col.data_type == DataType.DATETIME:
        name = "date_time_between"

    if ctx.pack and name in ctx.pack:
        provider = ctx.pack[name]
        return lambda: provider(ctx.rng)

    fn = getattr(fk, name)
    params = {k: _clean_date_param(v) for k, v in col.generator.params.items()}
    try:
        fn(**params)  # probe once so bad LLM params degrade instead of crashing
    except Exception:
        ctx.warn(f"{table.name}.{col.name}: invalid params for Faker '{name}'; used defaults")
        params = {}
    return lambda: fn(**params)


def _faker(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    call = faker_call(ctx, table, col)
    unique = col.is_unique or col.is_primary_key
    seen: set[Any] = set()
    out: list[Any] = []
    for _ in range(n):
        v = _coerce(call(), col.data_type)
        if unique:
            tries = 0
            while v in seen and tries < 50:
                v = _coerce(call(), col.data_type)
                tries += 1
            if v in seen and isinstance(v, str):
                k = 2
                while f"{v} {k}" in seen:
                    k += 1
                v = f"{v} {k}"
            seen.add(v)
        out.append(v)
    return out


# ---------------------------------------------------------------- ai / constant
def _ai_text(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    ctx.warn(
        f"{table.name}.{col.name}: ai_text uses placeholder Faker sentences; "
        "batched LLM text generation is not implemented yet"
    )
    return [ctx.faker.sentence(nb_words=8) for _ in range(n)]


def _constant(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    return [col.generator.params.get("value")] * n


_HANDLERS = {
    GeneratorStrategy.DETERMINISTIC_ID: _ids,
    GeneratorStrategy.FAKER: _faker,
    GeneratorStrategy.CATEGORICAL: _categorical,
    GeneratorStrategy.STATISTICAL: _statistical,
    GeneratorStrategy.FOREIGN_KEY: _fk,
    GeneratorStrategy.AI_TEXT: _ai_text,
    GeneratorStrategy.CONSTANT: _constant,
}


def generate_column(ctx: GenContext, table: TablePlan, col: ColumnPlan, n: int) -> list[Any]:
    return _HANDLERS[col.generator.strategy](ctx, table, col, n)
