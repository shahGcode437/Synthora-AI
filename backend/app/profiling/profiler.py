"""Deterministic column/dataset profiler. Machines calculate facts; AI interprets meaning."""
from __future__ import annotations

import math
import re
import statistics
from collections import Counter
from datetime import datetime

import numpy as np

from app.models.profile import ColumnProfile, DatasetProfile, ValueFreq
from app.profiling.csv_parser import ParsedCsv

NULL_TOKENS = {"", "null", "none", "na", "n/a", "nan", "nil", "-", "--"}
_BOOL_WORDS = {"true", "false", "yes", "no", "y", "n", "t", "f"}
_INT_RE = re.compile(r"^-?(0|[1-9]\d*)$")
_FLOAT_RE = re.compile(r"^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y"]
_DATETIME_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%SZ", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
]
_PATTERNS = {
    "email": re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
    "uuid": re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
    "cnic": re.compile(r"^\d{5}-?\d{7}-?\d$"),
    "url": re.compile(r"^https?://", re.IGNORECASE),
    "ip": re.compile(r"^\d{1,3}(\.\d{1,3}){3}$"),
}
_PHONE_RE = re.compile(r"^\+?\d[\d\s\-()]{7,18}\d$")
_ID_TOKENS = {"id", "uuid", "guid", "key", "ref", "reference", "number", "num"}
_PII_NAME_TOKENS = {"name", "firstname", "lastname", "surname", "fullname", "email", "phone", "mobile", "cell",
                    "address", "cnic", "ssn", "passport", "dob", "birthdate", "birthday", "iban", "card"}
_NOT_PERSON = {"merchant", "company", "product", "business", "brand", "store", "shop", "category", "file",
               "city", "country", "item", "bank", "plan", "team", "department", "org", "organization"}
_PII_PATTERNS = {"email", "cnic", "phone"}


def name_tokens(name: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    return re.findall(r"[a-z]+|\d+", spaced.lower())


def shape_mask(value: str) -> str:
    """Keep the format of a value but not its content: A=upper, a=lower, 9=digit."""
    return "".join("A" if c.isupper() else "a" if c.islower() else "9" if c.isdigit() else c for c in value)[:40]


def _pii_from_name(name: str) -> str | None:
    toks = name_tokens(name)
    joined = {"".join(toks[i:i + 2]) for i in range(len(toks))}
    hit = (set(toks) | joined) & _PII_NAME_TOKENS
    if not hit:
        return None
    if hit <= {"name"} and set(toks) & _NOT_PERSON:
        return None
    return f"column name suggests {sorted(hit)[0]}"


def _parse_dates(values: list[str]) -> tuple[str, str, list[datetime]] | None:
    """Return (dtype, format, parsed) when every value parses with one format."""
    probe = values[:2000]
    for dtype, formats in (("datetime", _DATETIME_FORMATS), ("date", _DATE_FORMATS)):
        for fmt in formats:
            try:
                for v in probe:
                    datetime.strptime(v, fmt)
            except ValueError:
                continue
            out = []
            for v in values:
                try:
                    out.append(datetime.strptime(v, fmt))
                except ValueError:
                    return None
            return dtype, fmt, out
    return None


def _infer(values: list[str]) -> tuple[str, str | None, list]:
    """(dtype, date_format, parsed values) from non-null strings."""
    if {v.lower() for v in values} <= _BOOL_WORDS:
        return "boolean", None, []
    if any(re.match(r"^-?0\d", v) for v in values):
        numeric_ok = False  # leading zeros (phone numbers, ZIP codes) are identifiers, not numbers
    else:
        numeric_ok = True
    if numeric_ok and all(_INT_RE.match(v) for v in values) and not (len({len(v) for v in values}) == 1 and len(values[0]) >= 10):
        return "integer", None, [float(v) for v in values]
    if numeric_ok and all(_FLOAT_RE.match(v) for v in values):
        return "float", None, [float(v) for v in values]
    dates = _parse_dates(values)
    if dates:
        return dates[0], dates[1], dates[2]
    return "string", None, []


def _id_pattern(uniques: list[str], dtype: str, lo: float | None) -> dict | None:
    if dtype == "integer":
        return {"kind": "integer", "start": int(lo or 1)}
    if uniques and sum(bool(_PATTERNS["uuid"].match(v)) for v in uniques) / len(uniques) >= 0.95:
        return {"kind": "uuid"}
    matches = [re.match(r"^(.*?)(\d+)$", v) for v in uniques]
    if uniques and all(matches):
        prefixes = {m.group(1) for m in matches}
        widths = {len(m.group(2)) for m in matches}
        if len(prefixes) == 1 and len(widths) == 1:
            return {"kind": "prefixed", "prefix": prefixes.pop(), "width": widths.pop(),
                    "start": min(int(m.group(2)) for m in matches)}
    return None


def _profile_column(name: str, raw: list[str]) -> ColumnProfile:
    n = len(raw)
    vals = [v.strip() for v in raw]
    nonnull = [v for v in vals if v.lower() not in NULL_TOKENS]
    nulls = n - len(nonnull)
    base = dict(name=name, row_count=n, null_count=nulls, null_pct=round(100 * nulls / n, 2))
    if not nonnull:
        return ColumnProfile(dtype="string", unique_count=0, unique_ratio=0.0, **base)

    dtype, fmt, parsed = _infer(nonnull)
    counts = Counter(nonnull)
    unique = len(counts)
    ratio = round(unique / len(nonnull), 4)
    p = ColumnProfile(dtype=dtype, unique_count=unique, unique_ratio=ratio, date_format=fmt, **base)

    # ---- deterministic PII hints (AI makes the final call)
    hints: list[str] = []
    if dtype == "string":
        sample = nonnull[:500]
        for label, rx in _PATTERNS.items():
            if sum(bool(rx.match(v)) for v in sample) / len(sample) >= 0.8:
                hints.append(label)
        if sum(bool(_PHONE_RE.match(v)) and 9 <= sum(c.isdigit() for c in v) <= 15 for v in sample) / len(sample) >= 0.8:
            hints.append("phone")
    p.pattern_hints = hints
    pii_reason = _pii_from_name(name)
    if pii_reason is None and set(hints) & _PII_PATTERNS:
        pii_reason = f"values look like {sorted(set(hints) & _PII_PATTERNS)[0]}"
    p.pii_hint = pii_reason

    p.id_like_name = bool(set(name_tokens(name)) & _ID_TOKENS) or name.lower().endswith("id")
    sequential = False

    if dtype in ("integer", "float"):
        arr = np.array(parsed, dtype=float)
        p.is_numeric = True
        p.min, p.max = float(arr.min()), float(arr.max())
        p.mean, p.median = float(arr.mean()), float(np.median(arr))
        p.std = float(arr.std(ddof=1)) if len(arr) > 1 else 0.0
        p.quantiles = {f"p{q}": float(np.percentile(arr, q)) for q in (5, 25, 50, 75, 95)}
        if (arr > 0).all():
            logs = np.log(arr)
            p.log_mean = float(logs.mean())
            p.log_std = float(logs.std(ddof=1)) if len(arr) > 1 else 0.0
        sequential = dtype == "integer" and unique == len(nonnull) and (p.max - p.min + 1) == unique
    elif dtype in ("date", "datetime"):
        p.is_date = True
        lo, hi = min(parsed), max(parsed)
        f = "%Y-%m-%d" if dtype == "date" else "%Y-%m-%dT%H:%M:%S"
        p.date_min, p.date_max = lo.strftime(f), hi.strftime(f)
    else:
        lens = [len(v) for v in nonnull]
        p.str_len = {"min": min(lens), "max": max(lens), "mean": round(statistics.fmean(lens), 1)}

    # ---- keys / identifiers
    p.candidate_primary_key = nulls == 0 and unique == n
    p.is_identifier = p.candidate_primary_key and (p.id_like_name or sequential or "uuid" in hints)
    if p.id_like_name or p.is_identifier:
        p.id_pattern = _id_pattern(list(counts), dtype, p.min)
        if not p.is_identifier and unique < len(nonnull):
            p.id_repeat = {"unique": unique, "avg_rows_per_id": round(len(nonnull) / unique, 2),
                           "max_rows_per_id": max(counts.values())}
            p.rank_counts = sorted(counts.values(), reverse=True)[:1000]

    # ---- categorical
    identifier_like = p.is_identifier or bool(p.id_repeat)
    small = (unique <= 20 and ratio <= 0.5) or (unique <= 50 and ratio <= 0.2)
    p.is_categorical = (dtype == "boolean" or (dtype == "string" and small)) and not identifier_like and not p.pii_hint

    # ---- privacy-safe values for the AI context and API response
    private = bool(p.pii_hint) or identifier_like
    if p.is_categorical or (not private and dtype == "string" and unique <= 10):
        p.top_values = [ValueFreq(value=v, count=c, pct=round(100 * c / len(nonnull), 2))
                        for v, c in counts.most_common(50 if p.is_categorical else 10)]
    if p.is_categorical and not private:
        p.rank_counts = sorted(counts.values(), reverse=True)
    distinct = list(counts)[:5]
    p.sample_values = [shape_mask(v) for v in distinct] if private else distinct
    return p


def profile_dataset(parsed: ParsedCsv) -> DatasetProfile:
    cols = [_profile_column(h, [r[h] for r in parsed.rows]) for h in parsed.headers]
    warnings = list(parsed.warnings)
    for c in cols:
        if c.null_count == c.row_count:
            warnings.append(f"Column '{c.name}' is entirely empty.")
    return DatasetProfile(
        table_name=parsed.table_name, total_rows=len(parsed.rows), total_columns=len(cols),
        delimiter=parsed.delimiter, columns=cols,
        likely_identifiers=[c.name for c in cols if c.is_identifier or c.id_repeat],
        likely_categorical=[c.name for c in cols if c.is_categorical],
        likely_numeric=[c.name for c in cols if c.is_numeric],
        likely_date=[c.name for c in cols if c.is_date],
        likely_pii=[c.name for c in cols if c.pii_hint],
        warnings=warnings,
    )
