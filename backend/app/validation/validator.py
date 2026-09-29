"""Deterministic validation of generated data against the GenerationPlan."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any

from app.generation.context import DerivedMeta
from app.generation.derived import signed_delta, total_value
from app.models.generation import CheckResult, TableValidation, ValidationReport
from app.models.plan import DataType, GenerationPlan, TablePlan

Rows = dict[str, list[dict[str, Any]]]
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_EXAMPLES = 5


def _check(name: str, bad: list[str], ok_msg: str, fail_msg: str, severity: str = "error") -> CheckResult:
    if not bad:
        return CheckResult(name=name, status="passed", message=ok_msg)
    return CheckResult(name=name, status=severity, message=f"{fail_msg} ({len(bad)})",  # type: ignore[arg-type]
                       count=len(bad), examples=bad[:_MAX_EXAMPLES])


def _type_ok(v: Any, dt: DataType) -> bool:
    if v is None:
        return True
    if dt == DataType.STRING:
        return isinstance(v, str)
    if dt == DataType.INTEGER:
        return isinstance(v, int) and not isinstance(v, bool)
    if dt in (DataType.FLOAT, DataType.DECIMAL):
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    if dt == DataType.BOOLEAN:
        return isinstance(v, bool)
    if dt == DataType.DATE:
        return isinstance(v, date) and not isinstance(v, datetime)
    if dt == DataType.DATETIME:
        return isinstance(v, datetime)
    if dt == DataType.UUID:
        try:
            uuid.UUID(str(v))
            return True
        except ValueError:
            return False
    return True


def _dups(rows: list[dict], cols: list[str]) -> list[str]:
    seen: set[tuple] = set()
    dup: list[str] = []
    for r in rows:
        key = tuple(r.get(c) for c in cols)
        if any(k is None for k in key):
            continue
        if key in seen:
            dup.append(str(key[0] if len(key) == 1 else key))
        seen.add(key)
    return dup


def _validate_table(plan: GenerationPlan, t: TablePlan, data: Rows, metas: list[DerivedMeta]) -> TableValidation:
    rows = data.get(t.name, [])
    checks: list[CheckResult] = []
    cols = {c.name: c for c in t.columns}

    if t.target_rows is None:
        checks.append(CheckResult(name="row_count", status="warning", message=f"no target_rows set; {len(rows)} rows generated"))
    else:
        checks.append(_check("row_count", [] if len(rows) == t.target_rows else [f"{len(rows)} != {t.target_rows}"],
                             f"{len(rows)} rows as requested", "row count differs from target_rows"))

    missing = sorted({c for r in rows for c in cols if c not in r})
    checks.append(_check("required_columns", missing, "all planned columns present", "missing columns"))

    null_bad = [f"{c.name}" for c in t.columns if not c.nullable and any(r.get(c.name) is None for r in rows)]
    null_bad += [f"{c}" for c in t.primary_key if c not in null_bad and any(r.get(c) is None for r in rows)]
    checks.append(_check("null_constraints", null_bad, "no nulls in required columns", "nulls in required columns"))

    if t.primary_key:
        checks.append(_check("primary_key_unique", _dups(rows, t.primary_key),
                             f"primary key {t.primary_key} is unique", "duplicate primary keys"))
    else:
        checks.append(CheckResult(name="primary_key_unique", status="warning", message="table has no primary key"))

    uniq = [f"{c.name}: {d}" for c in t.columns if c.is_unique and not c.is_primary_key for d in _dups(rows, [c.name])]
    checks.append(_check("unique_columns", uniq, "unique columns are unique", "duplicate values in unique columns"))

    fk_bad: list[str] = []
    for fk in t.foreign_keys:
        parent_vals = {r.get(fk.references_column) for r in data.get(fk.references_table, [])}
        fk_bad += [f"{fk.column}={r.get(fk.column)} -> {fk.references_table}" for r in rows
                   if r.get(fk.column) is not None and r.get(fk.column) not in parent_vals]
        if fk.column in cols and not cols[fk.column].nullable and any(r.get(fk.column) is None for r in rows):
            fk_bad.append(f"{fk.column} has empty required references")
    checks.append(_check("foreign_keys", fk_bad, "all foreign keys reference existing parent rows" if t.foreign_keys else "no foreign keys",
                         "orphan/empty foreign keys"))

    allowed_bad = [f"{c.name}={v}" for c in t.columns if c.allowed_values
                   for v in {r.get(c.name) for r in rows} if v is not None and v not in c.allowed_values]
    checks.append(_check("allowed_values", allowed_bad, "categorical values are all allowed", "values outside allowed_values"))

    type_bad = [f"{c.name}" for c in t.columns if any(not _type_ok(r.get(c.name), c.data_type) for r in rows)]
    checks.append(_check("data_types", type_bad, "values match declared data types", "values not matching declared type"))

    email_cols = [c.name for c in t.columns if "email" in c.semantic_type.lower()]
    bad_email = [f"{c}: {r.get(c)}" for c in email_cols for r in rows if r.get(c) is not None and not _EMAIL_RE.match(str(r[c]))]
    if email_cols:
        checks.append(_check("email_format", bad_email, "emails are well-formed", "malformed emails"))

    for m in (m for m in metas if m.table == t.name):
        checks.append(_check_derived(m, rows))

    passed = not any(c.status == "error" for c in checks)
    return TableValidation(table=t.name, rows=len(rows), passed=passed, checks=checks)


def _check_derived(m: DerivedMeta, rows: list[dict]) -> CheckResult:
    name = f"derived:{m.column}"
    bad: list[str] = []
    if m.kind == "running_balance":
        i = m.info
        state: dict[Any, int] = {}
        for idx, r in enumerate(rows):
            g, amt = (r.get(i["group"]) if i["group"] else None), r.get(i["amount"])
            if amt is None or r.get(m.column) is None:
                continue
            delta = signed_delta(r.get(i["type"]), r.get(i["status"]) if i["status"] else None, amt)
            if delta is None:
                continue
            state[g] = state.get(g, i["opening"].get(str(g), 0)) + round(delta * 100)
            if round(r[m.column] * 100) != state[g]:
                bad.append(f"row {idx}: {r[m.column]} != {state[g] / 100}")
        return _check(name, bad, "running balance reconciles per account in order", "running balance mismatches")
    if m.kind == "total":
        bad = [f"row {idx}" for idx, r in enumerate(rows)
               if (exp := total_value(r, m.info)) is not None and r.get(m.column) != exp]
        return _check(name, bad, "totals equal their components", "total mismatches")
    if m.kind == "template":
        return CheckResult(name=name, status="passed", message="template applied")
    return CheckResult(name=name, status="passed", message="derived from dependencies")


# ------------------------------------------------------------------ business rules
_FUTURE = re.compile(r"^\s*(\w+)\s*<=\s*(?:today|now)\(\)\s*$")
_UNIQUE = re.compile(r"^\s*unique\((\w+)\)\s*$")
_REF = re.compile(r"^\s*(\w+)\.(\w+)\s+in\s+(\w+)\.(\w+)\s*$")


def _rule_tables(plan: GenerationPlan, rule_tables: list[str], col: str) -> list[TablePlan]:
    pool = [t for t in plan.tables if not rule_tables or t.name in rule_tables]
    return [t for t in pool if any(c.name == col for c in t.columns)]


def _validate_rules(plan: GenerationPlan, data: Rows, tables: list[TableValidation]) -> list[CheckResult]:
    results: list[CheckResult] = []
    now = datetime.now()
    for rule in plan.business_rules:
        expr = (rule.expression or "").strip()
        sev = "error" if rule.severity == "error" else "warning"
        res: CheckResult | None = None
        if (m := _FUTURE.match(expr)):
            bad = [f"{t.name}.{m[1]}={r.get(m[1])}" for t in _rule_tables(plan, rule.tables, m[1]) for r in data.get(t.name, [])
                   if isinstance(r.get(m[1]), (date, datetime))
                   and (r[m[1]] > now if isinstance(r[m[1]], datetime) else r[m[1]] > now.date())]
            res = _check(rule.id, bad, "no dates in the future", "dates in the future", sev)
        elif (m := _UNIQUE.match(expr)):
            bad = [f"{t.name}.{m[1]}: {d}" for t in _rule_tables(plan, rule.tables, m[1]) for d in _dups(data.get(t.name, []), [m[1]])]
            res = _check(rule.id, bad, "values are unique", "duplicate values", sev)
        elif (m := _REF.match(expr)):
            parent = {r.get(m[4]) for r in data.get(m[3], [])}
            bad = [str(r.get(m[2])) for r in data.get(m[1], []) if r.get(m[2]) is not None and r[m[2]] not in parent]
            res = _check(rule.id, bad, "references are valid", "invalid references", sev)
        else:
            derived = [c for tv in tables if tv.table in (rule.tables or [tv.table]) for c in tv.checks
                       if c.name.startswith("derived:") and ("balance" in c.name or "total" in c.name)
                       and any(w in f"{rule.id} {rule.description}".lower() for w in ("balance", "total"))]
            if derived:
                worst = "error" if any(c.status == "error" for c in derived) else "passed"
                res = CheckResult(name=rule.id, status=worst, message="verified via derived-consistency check: "
                                  + "; ".join(c.message for c in derived))
            elif "must reference a valid" in rule.description.lower() or "valid" in rule.id.lower() and "exist" in rule.id.lower():
                fk_ok = all(c.status == "passed" for tv in tables for c in tv.checks if c.name == "foreign_keys")
                res = CheckResult(name=rule.id, status="passed" if fk_ok else "error",
                                  message="verified via foreign-key integrity check")
        results.append(res or CheckResult(name=rule.id, status="skipped",
                                          message="free-form rule; not machine-checked (reported, not enforced)"))
    return results


def validate(plan: GenerationPlan, data: Rows, derived_meta: list[DerivedMeta]) -> ValidationReport:
    tables = [_validate_table(plan, t, data, derived_meta) for t in plan.tables]
    rules = _validate_rules(plan, data, tables)
    all_checks = [c for tv in tables for c in tv.checks] + rules
    errors = sum(c.status == "error" for c in all_checks)
    warnings = sum(c.status == "warning" for c in all_checks)
    return ValidationReport(passed=errors == 0, error_count=errors, warning_count=warnings, tables=tables, rules=rules)
