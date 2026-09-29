"""Tolerant normalization of LLM output BEFORE it is validated against the shared GenerationPlan.

Every provider goes through the same function; there is no provider-specific schema.

What it does (cosmetic / defaultable only):
  - unwrap {"plan": {...}} style envelopes
  - enum spelling and common aliases ("Faker", "one-to-many", "varchar", "PII" ...)
  - None -> the field's default for list/object/bool fields; scalar-where-list-expected -> [scalar]
  - numbers sent as strings; percentages (5, 95) sent where 0-1 fractions are required
  - allowed_values items coerced to strings
  - a bare string where a small object is expected (generator: "faker", pii: "direct_identifier")

What it NEVER does: invent tables, columns, keys, foreign keys, relationships, data types or generator
strategies, or repair references. Structural problems still fail validation exactly as before.
Every adjustment is counted and surfaced as a plan warning, so nothing is changed silently.
"""
from __future__ import annotations

import copy
import re
from collections import Counter
from typing import Any

from pydantic import ValidationError

_ENVELOPES = ("generation_plan", "generationPlan", "GenerationPlan", "plan", "result", "output", "data")


def _key(v: Any) -> str:
    return re.sub(r"[\s\-/]+", "_", str(v).strip().lower())


_STRATEGY = {
    "faker_provider": "faker", "fake": "faker", "faker_generator": "faker",
    "random": "statistical", "distribution": "statistical", "numeric": "statistical", "stat": "statistical", "stats": "statistical",
    "category": "categorical", "choice": "categorical", "enum": "categorical", "weighted_choice": "categorical", "weighted": "categorical",
    "id": "deterministic_id", "sequence": "deterministic_id", "uuid": "deterministic_id", "auto_increment": "deterministic_id",
    "deterministic": "deterministic_id", "sequential": "deterministic_id",
    "fk": "foreign_key", "reference": "foreign_key", "foreign": "foreign_key",
    "computed": "derived", "formula": "derived", "calculated": "derived", "derive": "derived",
    "ai": "ai_text", "llm": "ai_text", "text": "ai_text", "free_text": "ai_text",
    "static": "constant", "fixed": "constant",
}
_DATA_TYPE = {
    "text": "string", "varchar": "string", "char": "string", "str": "string", "nvarchar": "string", "email": "string",
    "int": "integer", "bigint": "integer", "smallint": "integer", "long": "integer", "int64": "integer", "number": "float",
    "numeric": "float", "double": "float", "real": "float", "float64": "float", "money": "decimal", "currency": "decimal",
    "bool": "boolean", "timestamp": "datetime", "timestamptz": "datetime", "date_time": "datetime", "guid": "uuid",
    "jsonb": "json", "object": "json",
}
_PII = {
    "pii": "direct_identifier", "personal": "direct_identifier", "identifier": "direct_identifier", "direct": "direct_identifier",
    "personally_identifiable": "direct_identifier", "high": "direct_identifier", "quasi": "quasi_identifier",
    "quasi_id": "quasi_identifier", "indirect_identifier": "quasi_identifier", "confidential": "sensitive",
    "no": "none", "false": "none", "not_pii": "none", "n/a": "none", "na": "none", "non_pii": "none",
}
_PRIVACY = {
    "replace": "synthesize", "fake": "synthesize", "generate": "synthesize", "synthetic": "synthesize", "synthesise": "synthesize",
    "redact": "mask", "masking": "mask", "anonymize": "mask", "anonymise": "mask", "hashing": "hash",
    "retain": "keep", "preserve": "keep", "no": "none", "n/a": "none", "na": "none", "no_action": "none",
}
_CARDINALITY = {
    "one_to_many": "1:N", "1_to_many": "1:N", "1:many": "1:N", "1:n": "1:N", "1:*": "1:N", "one_many": "1:N", "1_n": "1:N",
    "one_to_one": "1:1", "1_to_1": "1:1", "1_1": "1:1",
    "many_to_many": "N:N", "n:n": "N:N", "m:n": "N:N", "n_to_n": "N:N", "many_many": "N:N", "*:*": "N:N",
}
_EDGE_KIND = {
    "null": "null_injection", "nulls": "null_injection", "missing": "null_injection", "missing_values": "null_injection",
    "null_values": "null_injection", "outliers": "outlier", "extreme": "outlier", "high_value": "outlier",
    "rare": "rare_category", "rare_categories": "rare_category", "category": "rare_category",
    "boundary": "boundary_value", "boundary_case": "boundary_value", "boundary_values": "boundary_value",
    "status": "status_scenario", "failure": "status_scenario", "scenario": "status_scenario",
}
_SEVERITY = {"warn": "warning", "info": "warning", "low": "warning", "medium": "warning", "critical": "error", "high": "error", "fatal": "error"}
_FK_ALIASES = {
    "references_table": ("reference_table", "referenced_table", "ref_table", "parent_table"),
    "references_column": ("reference_column", "referenced_column", "ref_column", "parent_column"),
}


class _Notes:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()

    def add(self, what: str) -> None:
        self.counts[what] += 1

    def summary(self) -> str | None:
        if not self.counts:
            return None
        parts = ", ".join(f"{what} ×{n}" if n > 1 else what for what, n in self.counts.most_common())
        return f"Provider output was normalized before validation ({sum(self.counts.values())} adjustment(s): {parts})."


# ------------------------------------------------------------------ scalar helpers
def _enum(v: Any, notes: _Notes, aliases: dict[str, str], valid: set[str], what: str) -> Any:
    if not isinstance(v, str):
        return v
    if v in valid:
        return v
    k = _key(v)
    out = aliases.get(k, k if k in valid else v)
    if out != v:
        notes.add(what)
    return out


def _to_num(v: Any, notes: _Notes, as_int: bool = False) -> Any:
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, str):
        try:
            f = float(v.strip().rstrip("%"))
        except ValueError:
            return v
        notes.add("numeric strings")
        return int(f) if as_int and f == int(f) else f
    if as_int and isinstance(v, float) and v == int(v):
        return int(v)
    return v


def _fraction(v: Any, notes: _Notes) -> Any:
    """0-1 fraction fields: accept '0.9', 90 or '90%' (percent) and convert."""
    v = _to_num(v, notes)
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if 1 < v <= 100:
            notes.add("percent→fraction")
            return v / 100
        return min(max(v, 0.0), 1.0) if v < 0 or v > 100 else v
    return v


def _bool(v: Any, notes: _Notes) -> Any:
    if isinstance(v, str) and v.strip().lower() in ("true", "false", "yes", "no"):
        notes.add("boolean strings")
        return v.strip().lower() in ("true", "yes")
    return v


def _list_of_str(v: Any, notes: _Notes) -> Any:
    if v is None:
        return None
    if isinstance(v, (str, int, float, bool)):
        notes.add("scalar→list")
        v = [v]
    if isinstance(v, list):
        out = []
        for x in v:
            if isinstance(x, bool):
                out.append("true" if x else "false")
                notes.add("allowed_values coerced to text")
            elif isinstance(x, (int, float)):
                out.append(str(x))
                notes.add("allowed_values coerced to text")
            else:
                out.append(x)
        return out
    return v


def _drop_none(d: dict, keys: tuple[str, ...], notes: _Notes) -> None:
    for k in keys:
        if k in d and d[k] is None:
            del d[k]  # falls back to the model default
            notes.add("null→default")


def _empty_list(d: dict, key: str, notes: _Notes) -> None:
    if key in d:
        if d[key] is None:
            d[key] = []
            notes.add("null→default")
        elif isinstance(d[key], (str, dict)) and d[key] in ("", {}):
            d[key] = []


# ------------------------------------------------------------------ objects
def _generator(g: Any, notes: _Notes) -> Any:
    if isinstance(g, str):
        notes.add("bare strategy string→object")
        g = {"strategy": g}
    if not isinstance(g, dict):
        return g
    g = dict(g)
    strategies = {"faker", "statistical", "categorical", "deterministic_id", "foreign_key", "derived", "ai_text", "constant"}
    if "strategy" in g:
        g["strategy"] = _enum(g["strategy"], notes, _STRATEGY, strategies, "generator strategy spelling")
    for k in ("params",):
        if g.get(k) is None or g.get(k) == [] or g.get(k) == "":
            if k in g:
                notes.add("null→default")
            g[k] = {}
    if "depends_on" in g:
        g["depends_on"] = [] if g["depends_on"] is None else _list_of_str(g["depends_on"], notes)
    if g.get("generator") is not None and not isinstance(g["generator"], str):
        g.pop("generator")  # optional sub-name in a wrong shape
        notes.add("null→default")
    return g


def _pii(p: Any, notes: _Notes) -> Any:
    if p is None:
        return None
    if isinstance(p, bool):
        notes.add("pii flag→object")
        return {"classification": "direct_identifier" if p else "none"}
    if isinstance(p, str):
        notes.add("bare pii string→object")
        p = {"classification": p}
    if not isinstance(p, dict):
        return p
    p = dict(p)
    if isinstance(p.get("classification"), bool):
        p["classification"] = "direct_identifier" if p["classification"] else "none"
        notes.add("pii flag→object")
    if "classification" in p:
        p["classification"] = _enum(p["classification"], notes, _PII,
                                    {"none", "direct_identifier", "quasi_identifier", "sensitive"}, "pii enum spelling")
    if "privacy_action" in p:
        p["privacy_action"] = _enum(p["privacy_action"], notes, _PRIVACY,
                                    {"none", "synthesize", "mask", "hash", "keep"}, "privacy enum spelling")
    _drop_none(p, ("classification", "privacy_action"), notes)
    if p.get("reason") is not None and not isinstance(p["reason"], str):
        p["reason"] = str(p["reason"])
    return p


def _column(c: Any, notes: _Notes) -> Any:
    if not isinstance(c, dict):
        return c
    c = dict(c)
    for alias in ("type", "datatype", "dtype", "column_type"):
        if "data_type" not in c and alias in c:
            c["data_type"] = c.pop(alias)
            notes.add("field aliases")
    if "semantic_type" not in c:
        for alias in ("semantic", "meaning", "semantic_meaning"):
            if alias in c:
                c["semantic_type"] = c.pop(alias)
                notes.add("field aliases")
                break
        else:
            if isinstance(c.get("name"), str):
                c["semantic_type"] = c["name"]  # required text label: fall back to the column's own name
                notes.add("missing semantic_type")
    valid_types = {"string", "integer", "float", "decimal", "boolean", "date", "datetime", "time", "uuid", "json"}
    if "data_type" in c:
        c["data_type"] = _enum(c["data_type"], notes, _DATA_TYPE, valid_types, "data_type spelling")
    for b in ("nullable", "is_primary_key", "is_unique"):
        if b in c:
            c[b] = _bool(c[b], notes)
    _drop_none(c, ("nullable", "is_primary_key", "is_unique"), notes)
    if "confidence" in c:
        c["confidence"] = _fraction(c["confidence"], notes)
    if "allowed_values" in c:
        c["allowed_values"] = _list_of_str(c["allowed_values"], notes)
    if "generator" in c:
        c["generator"] = _generator(c["generator"], notes)
    if "pii" in c:
        pii = _pii(c["pii"], notes)
        if pii is None:
            del c["pii"]
        else:
            c["pii"] = pii
    return c


def _foreign_key(fk: Any, notes: _Notes) -> Any:
    if not isinstance(fk, dict):
        return fk
    fk = dict(fk)
    for canonical, aliases in _FK_ALIASES.items():
        if canonical not in fk:
            for a in aliases:
                if a in fk:
                    fk[canonical] = fk.pop(a)
                    notes.add("field aliases")
                    break
    if "column" not in fk and "child_column" in fk:
        fk["column"] = fk.pop("child_column")
        notes.add("field aliases")
    return fk


def _table(t: Any, notes: _Notes) -> Any:
    if not isinstance(t, dict):
        return t
    t = dict(t)
    if "target_rows" in t:
        t["target_rows"] = _to_num(t["target_rows"], notes, as_int=True)
    if isinstance(t.get("primary_key"), str):
        t["primary_key"] = [t["primary_key"]]
        notes.add("scalar→list")
    _empty_list(t, "primary_key", notes)
    _empty_list(t, "foreign_keys", notes)
    if isinstance(t.get("columns"), list):
        t["columns"] = [_column(c, notes) for c in t["columns"]]
    if isinstance(t.get("foreign_keys"), list):
        t["foreign_keys"] = [_foreign_key(f, notes) for f in t["foreign_keys"]]
    return t


def _relationship(r: Any, notes: _Notes) -> Any:
    if not isinstance(r, dict):
        return r
    r = dict(r)
    if "cardinality" in r:
        r["cardinality"] = _enum(r["cardinality"], notes, _CARDINALITY, {"1:1", "1:N", "N:N"}, "cardinality spelling")
    _drop_none(r, ("cardinality",), notes)
    if "confidence" in r:
        r["confidence"] = _fraction(r["confidence"], notes)
    return r


def _rule(r: Any, i: int, notes: _Notes) -> Any:
    if isinstance(r, str):
        notes.add("bare rule string→object")
        return {"id": f"rule_{i + 1}", "description": r}
    if not isinstance(r, dict):
        return r
    r = dict(r)
    if "description" not in r:
        for alias in ("rule", "text", "name", "statement"):
            if isinstance(r.get(alias), str):
                r["description"] = r[alias]
                notes.add("field aliases")
                break
    if "id" not in r and "description" in r:
        r["id"] = f"rule_{i + 1}"
        notes.add("missing rule id")
    if r.get("id") is not None and not isinstance(r["id"], str):
        r["id"] = str(r["id"])
    if isinstance(r.get("tables"), str):
        r["tables"] = [r["tables"]]
        notes.add("scalar→list")
    _drop_none(r, ("tables", "severity"), notes)
    if r.get("expression") is not None and not isinstance(r["expression"], str):
        r["expression"] = str(r["expression"])
    if "severity" in r:
        r["severity"] = _enum(r["severity"], notes, _SEVERITY, {"error", "warning"}, "severity spelling")
    return r


def _edge_rec(e: Any, notes: _Notes) -> Any:
    if not isinstance(e, dict):
        return e
    e = dict(e)
    if "kind" in e and isinstance(e["kind"], str):
        valid = {"null_injection", "outlier", "rare_category", "boundary_value", "status_scenario", "custom"}
        k = _enum(e["kind"], notes, _EDGE_KIND, valid, "edge-case kind spelling")
        if k not in valid:
            k = "custom"  # catch-all category; the engine reports custom cases as skipped
            notes.add("unknown edge-case kind→custom")
        e["kind"] = k
    _drop_none(e, ("kind",), notes)
    if "rate" in e:
        e["rate"] = _fraction(e["rate"], notes)
    if "description" not in e and isinstance(e.get("name"), str):
        e["description"] = e["name"]
        notes.add("missing edge-case description")
    if "name" not in e and isinstance(e.get("description"), str):
        e["name"] = e["description"][:60]
        notes.add("missing edge-case name")
    return e


def _edge_cases(ec: Any, notes: _Notes) -> Any:
    if isinstance(ec, list):
        notes.add("edge_cases list→object")
        ec = {"recommendations": ec}
    if not isinstance(ec, dict):
        return ec
    ec = dict(ec)
    if "mode" in ec:
        m = _key(ec["mode"]) if isinstance(ec["mode"], str) else ec["mode"]
        if m not in {"none", "ai_recommended", "low", "medium", "high", "custom"}:
            del ec["mode"]  # user's edge_case_mode overrides this field anyway
            notes.add("invalid mode dropped")
        else:
            ec["mode"] = m
    for k in ("null_rate", "outlier_rate", "rare_category_rate"):
        if k in ec:
            ec[k] = _fraction(ec[k], notes)
    _empty_list(ec, "recommendations", notes)
    if isinstance(ec.get("recommendations"), list):
        ec["recommendations"] = [_edge_rec(e, notes) for e in ec["recommendations"]]
    return ec


# ------------------------------------------------------------------ entry points
def normalize_plan_payload(data: Any) -> Any:
    """Return a normalized deep copy of an LLM GenerationPlan payload (input is never mutated)."""
    if not isinstance(data, dict):
        return data
    notes = _Notes()
    d = copy.deepcopy(data)

    for env in _ENVELOPES:  # {"plan": {...}} -> {...}
        inner = d.get(env)
        if len(d) == 1 and isinstance(inner, dict) and ("tables" in inner or "domain" in inner):
            d = inner
            notes.add("unwrapped response envelope")
            break

    _drop_none(d, ("plan_version",), notes)
    if d.get("plan_version") is not None and not isinstance(d["plan_version"], str):
        d["plan_version"] = str(d["plan_version"])
    if "source_mode" in d and d["source_mode"] not in ("prompt", "sample"):
        del d["source_mode"]  # set by the service from the request
        notes.add("invalid mode dropped")
    if d.get("seed") is not None:
        seed = _to_num(d["seed"], notes, as_int=True)
        if isinstance(seed, int) and not isinstance(seed, bool):
            d["seed"] = seed
        else:
            del d["seed"]  # user's seed overrides; an unusable AI seed is meaningless
            notes.add("invalid seed dropped")
    if "confidence" in d:
        d["confidence"] = _fraction(d["confidence"], notes)
    for k in ("warnings", "assumptions"):
        if k in d:
            if d[k] is None:
                d[k] = []
                notes.add("null→default")
            elif isinstance(d[k], str):
                d[k] = [d[k]]
                notes.add("scalar→list")
    for k in ("relationships", "business_rules"):
        _empty_list(d, k, notes)
    if isinstance(d.get("privacy"), str):
        d["privacy"] = {"mode": d["privacy"]}
        notes.add("bare privacy string→object")
    if isinstance(d.get("privacy"), dict) and "mode" in d["privacy"]:
        m = _key(d["privacy"]["mode"]) if isinstance(d["privacy"]["mode"], str) else d["privacy"]["mode"]
        if m in {"auto", "safe_default", "none", "custom"}:
            d["privacy"]["mode"] = m
        else:
            del d["privacy"]["mode"]  # overridden by the user's privacy_mode
            notes.add("invalid mode dropped")
    if d.get("privacy") is None and "privacy" in d:
        del d["privacy"]
    if d.get("edge_cases") is None and "edge_cases" in d:
        del d["edge_cases"]
    elif "edge_cases" in d:
        d["edge_cases"] = _edge_cases(d["edge_cases"], notes)

    if isinstance(d.get("tables"), list):
        d["tables"] = [_table(t, notes) for t in d["tables"]]
    if isinstance(d.get("relationships"), list):
        d["relationships"] = [_relationship(r, notes) for r in d["relationships"]]
    if isinstance(d.get("business_rules"), list):
        d["business_rules"] = [_rule(r, i, notes) for i, r in enumerate(d["business_rules"])]

    summary = notes.summary()
    if summary:
        warnings = d.get("warnings")
        d["warnings"] = [*(warnings if isinstance(warnings, list) else []), summary]
    return d


NORMALIZERS = {"GenerationPlan": normalize_plan_payload}


def normalize_for(model_name: str, data: Any) -> Any:
    fn = NORMALIZERS.get(model_name)
    return fn(data) if fn else data


def summarize_validation_error(exc: ValidationError, limit: int = 6) -> str:
    """Field paths and error types only: never the offending values (they may be sensitive or huge)."""
    items = []
    for e in exc.errors()[:limit]:
        loc = ".".join(str(p) for p in e["loc"]) or "(root)"
        items.append(f"{loc} [{e['type']}]")
    more = exc.error_count() - limit
    return "; ".join(items) + (f"; +{more} more" if more > 0 else "")
