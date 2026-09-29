"""Safe local CSV parsing. Uploaded data is processed in memory only and never persisted."""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 200_000
MAX_COLUMNS = 100
_DELIMITERS = [",", ";", "\t", "|"]
_MISMATCH_TOLERANCE = 0.05


class SampleInputError(Exception):
    """The uploaded file cannot be used (maps to HTTP 422; oversized -> 413)."""

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


@dataclass
class ParsedCsv:
    table_name: str
    headers: list[str]
    rows: list[dict[str, str]]
    delimiter: str
    warnings: list[str] = field(default_factory=list)


def table_name_from(filename: str | None) -> str:
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", (filename or "").replace("\\", "/").split("/")[-1])
    name = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    if not name:
        return "dataset"
    return f"t_{name}" if name[0].isdigit() else name


def _detect_delimiter(text: str) -> str:
    lines = [ln for ln in text.splitlines()[:6] if ln.strip()]
    best, best_score = ",", (0, 0)
    for d in _DELIMITERS:
        try:
            counts = [len(r) for r in csv.reader(lines, delimiter=d)]
        except csv.Error:
            continue
        if not counts or counts[0] < 2:
            continue
        consistent = sum(1 for c in counts if c == counts[0])
        score = (consistent, counts[0])
        if score > best_score:
            best, best_score = d, score
    return best


def parse_csv(data: bytes, filename: str | None = None) -> ParsedCsv:
    if len(data) > MAX_BYTES:
        raise SampleInputError(f"File is too large ({len(data)} bytes); the limit is {MAX_BYTES // (1024 * 1024)} MB.", 413)
    if not data or not data.strip():
        raise SampleInputError("The uploaded file is empty.")
    if b"\x00" in data:
        raise SampleInputError("The file looks binary, not a CSV text file.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise SampleInputError("The file must be UTF-8 encoded text.") from None

    delim = _detect_delimiter(text)
    warnings: list[str] = []
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=delim, strict=True)
        raw = [r for r in reader if any(c.strip() for c in r)]
    except csv.Error as exc:
        raise SampleInputError(f"Malformed CSV: {exc}") from None
    if not raw:
        raise SampleInputError("The CSV contains no data.")

    header = [h.strip() for h in raw[0]]
    if not header or all(not h for h in header):
        raise SampleInputError("The CSV has no header columns.")
    if len(header) > MAX_COLUMNS:
        raise SampleInputError(f"Too many columns ({len(header)}); the limit is {MAX_COLUMNS}.")
    body = raw[1:]
    if not body:
        raise SampleInputError("The CSV has a header but no data rows.")
    if len(body) > MAX_ROWS:
        raise SampleInputError(f"Too many rows ({len(body)}); the limit is {MAX_ROWS}.")

    seen: dict[str, int] = {}
    names: list[str] = []
    for i, h in enumerate(header, 1):
        base = h or f"column_{i}"
        seen[base] = seen.get(base, 0) + 1
        names.append(base if seen[base] == 1 else f"{base}_{seen[base]}")
    if names != header:
        warnings.append("Blank or duplicate column names were renamed.")

    bad = [i for i, r in enumerate(body, 2) if len(r) != len(names)]
    if len(bad) > max(0, len(body) * _MISMATCH_TOLERANCE):
        raise SampleInputError(
            f"Malformed CSV: {len(bad)} of {len(body)} rows do not have {len(names)} fields (first at line {bad[0]})."
        )
    if bad:
        warnings.append(f"{len(bad)} rows had the wrong number of fields and were padded/truncated.")

    rows = []
    for r in body:
        r = (r + [""] * len(names))[: len(names)]
        rows.append(dict(zip(names, r)))
    return ParsedCsv(table_name_from(filename), names, rows, delim, warnings)
