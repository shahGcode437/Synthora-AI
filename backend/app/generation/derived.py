"""Derived-field handlers: values computed from other columns / related rows.

If a field cannot be computed safely we warn and leave it empty rather than invent data.
"""
from __future__ import annotations

import random
import re
import unicodedata
from collections import defaultdict
from typing import Any

from app.generation.context import DerivedMeta, GenContext
from app.models.plan import ColumnPlan, DataType, TablePlan

_TITLES = {"mr", "mrs", "ms", "miss", "dr", "prof", "sir", "md"}
_DEFAULT_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]
CREDIT_WORDS = ("credit", "deposit", "inflow", "income", "refund", "cr")
DEBIT_WORDS = ("debit", "withdraw", "outflow", "payment", "purchase", "transfer_out", "dr")
INEFFECTIVE_STATUS = ("fail", "declin", "reject", "error", "cancel", "revers", "pending", "void")


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ---------------------------------------------------------------- email
def _tokens(name: Any) -> list[str]:
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    return [t for t in re.split(r"[^a-z0-9]+", text) if t and t not in _TITLES]


def _email(ctx: GenContext, table: TablePlan, col: ColumnPlan, rows: list[dict]) -> None:
    deps = col.generator.depends_on
    if not deps:
        ctx.warn(f"{table.name}.{col.name}: derived email has no depends_on; used Faker email")
        for r in rows:
            r[col.name] = ctx.faker.email()
        return
    domains = col.generator.params.get("domains") or _DEFAULT_DOMAINS
    if isinstance(domains, str):
        domains = [domains]
    seen: set[str] = set()
    rng: random.Random = ctx.rng
    for i, r in enumerate(rows):
        toks = [t for d in deps if r.get(d) for t in _tokens(r[d])]
        if not toks:
            r[col.name] = None
            continue
        first, last = toks[0], toks[-1]
        style = rng.randrange(4)
        local = {0: f"{first}.{last}", 1: f"{first}{last}", 2: f"{first}_{last}", 3: f"{first[0]}{last}"}[style]
        if len(toks) == 1:
            local = first
        domain = rng.choice(domains)
        email, k = f"{local}@{domain}", 1
        while email in seen:
            k += 1
            email = f"{local}{k}@{domain}"
        seen.add(email)
        r[col.name] = email
    ctx.derived_meta.append(DerivedMeta(table.name, col.name, "email", {"depends_on": deps}))


# ---------------------------------------------------------------- template
def _template(ctx: GenContext, table: TablePlan, col: ColumnPlan, rows: list[dict]) -> None:
    tpl = str(col.generator.params["template"])
    for r in rows:
        try:
            r[col.name] = tpl.format_map(defaultdict(str, {k: v for k, v in r.items() if v is not None}))
        except (ValueError, IndexError, KeyError, AttributeError):
            r[col.name] = None
            ctx.warn(f"{table.name}.{col.name}: invalid template; left empty")
            return
    ctx.derived_meta.append(DerivedMeta(table.name, col.name, "template", {"template": tpl}))


# ---------------------------------------------------------------- totals
def total_value(row: dict, info: dict) -> float | None:
    def get(cols):
        return [row.get(c) for c in cols]

    parts = get(info["qty"]) + get(info["price"]) + get(info["add"]) + get(info["sub"])
    if not all(_is_num(v) for v in parts):
        return None
    q = 1.0
    for v in get(info["qty"]):
        q *= v
    total = q * sum(get(info["price"])) + sum(get(info["add"])) - sum(get(info["sub"]))
    return round(total, 2)


def _total(ctx: GenContext, table: TablePlan, col: ColumnPlan, rows: list[dict]) -> None:
    info: dict[str, list[str]] = {"qty": [], "price": [], "add": [], "sub": []}
    for d in col.generator.depends_on:
        low = d.lower()
        if "discount" in low:
            info["sub"].append(d)
        elif any(t in low for t in ("tax", "shipping", "fee")):
            info["add"].append(d)
        elif "qty" in low or "quantity" in low:
            info["qty"].append(d)
        else:
            info["price"].append(d)
    if not info["price"]:
        ctx.warn(f"{table.name}.{col.name}: total has no numeric components in depends_on; left empty")
        return
    for r in rows:
        r[col.name] = total_value(r, info)
    ctx.derived_meta.append(DerivedMeta(table.name, col.name, "total", info))


# ---------------------------------------------------------------- running balance
def _matches(t: str, words: tuple[str, ...]) -> bool:
    return any(w == t or (len(w) > 2 and t.startswith(w)) for w in words)


def signed_delta(txn_type: Any, status: Any, amount: float) -> float | None:
    """Effect of one transaction on a balance; None when the type is unrecognised."""
    if status is not None and any(w in str(status).lower() for w in INEFFECTIVE_STATUS):
        return 0.0
    t = str(txn_type).lower()
    if _matches(t, CREDIT_WORDS):
        return amount
    if _matches(t, DEBIT_WORDS):
        return -amount
    return None


def _find(table: TablePlan, deps: list[str], *tokens: str) -> str | None:
    pool = deps + [c.name for c in table.columns if c.name not in deps]
    cols = {c.name: c for c in table.columns}
    for d in pool:
        c = cols.get(d)
        if c and any(t in d.lower() or t in c.semantic_type.lower() for t in tokens):
            return d
    return None


def _running_balance(ctx: GenContext, table: TablePlan, col: ColumnPlan, rows: list[dict]) -> None:
    deps = col.generator.depends_on
    cols = {c.name: c for c in table.columns}
    amount = _find(table, deps, "amount")
    txn_type = _find(table, deps, "type", "direction")
    status = _find(table, deps, "status")
    fk_cols = ctx.fk_columns(table)
    group = next((d for d in deps if d in fk_cols), None) or next((c for c in fk_cols), None)
    order = next((d for d in deps if cols.get(d) and cols[d].data_type in (DataType.DATE, DataType.DATETIME)), None)
    order = order or next((c.name for c in table.columns if c.data_type in (DataType.DATE, DataType.DATETIME)), None)
    if not (amount and txn_type):
        ctx.warn(f"{table.name}.{col.name}: cannot identify amount/type columns for running balance; left empty")
        return
    if group is None:
        ctx.warn(f"{table.name}.{col.name}: no account/group column found; balance computed over the whole table")
    if order is None:
        ctx.warn(f"{table.name}.{col.name}: no timestamp column found; balance follows row order")

    opening: dict[Any, int] = {}
    target = ctx.resolve_fk(table, cols[group]) if group else None
    if target:
        pt, pc = target
        ptable = ctx.table(pt)
        bal = next((c.name for c in (ptable.columns if ptable else [])
                    if "balance" in c.name.lower() or "balance" in c.semantic_type.lower()), None)
        for pr in ctx.rows.get(pt, []):
            v = pr.get(bal) if bal else None
            opening[pr[pc]] = round(v * 100) if _is_num(v) else 0
        if not bal:
            ctx.warn(f"{table.name}.{col.name}: parent has no opening balance column; balances start at 0")
    else:
        ctx.warn(f"{table.name}.{col.name}: no opening balance source; balances start at 0")

    if order:
        rows.sort(key=lambda r: (r.get(order) is None, r.get(order)))
    running: dict[Any, int] = {}
    unknown = False
    for r in rows:
        g = r.get(group) if group else None
        amt = r.get(amount)
        if not _is_num(amt):
            r[col.name] = None
            continue
        delta = signed_delta(r.get(txn_type), r.get(status) if status else None, amt)
        if delta is None:
            r[col.name], unknown = None, True
            continue
        running[g] = running.get(g, opening.get(g, 0)) + round(delta * 100)
        r[col.name] = running[g] / 100
    if unknown:
        ctx.warn(f"{table.name}.{col.name}: some transaction types are not recognised as debit/credit; balance left empty")
    ctx.derived_meta.append(DerivedMeta(table.name, col.name, "running_balance", {
        "amount": amount, "type": txn_type, "status": status, "group": group, "order": order,
        "opening": {str(k): v for k, v in opening.items()},
    }))


# ---------------------------------------------------------------- router
def compute_derived(ctx: GenContext, table: TablePlan, col: ColumnPlan, rows: list[dict]) -> None:
    gen = (col.generator.generator or "").lower()
    sem = f"{col.semantic_type} {col.name}".lower()
    if "template" in col.generator.params or gen in ("template", "concat", "concatenate"):
        _template(ctx, table, col, rows)
    elif "email" in sem or gen == "email":
        _email(ctx, table, col, rows)
    elif "balance" in sem or gen in ("running_balance", "cumulative_sum"):
        _running_balance(ctx, table, col, rows)
    elif "total" in sem or gen in ("sum", "total", "multiply", "product"):
        _total(ctx, table, col, rows)
    else:
        ctx.warn(f"{table.name}.{col.name}: no safe derivation rule for this field; left empty")
        for r in rows:
            r.setdefault(col.name, None)
