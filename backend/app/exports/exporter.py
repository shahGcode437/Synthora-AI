"""In-memory CSV / JSON / ZIP export of generated tables. Nothing touches the filesystem."""
from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

MAX_TOTAL_ROWS = 500_000
DEFAULT_BASENAME = "synthora_export"

Data = dict[str, list[dict[str, Any]]]


class ExportError(Exception):
    """Invalid export input (maps to HTTP 422)."""


@dataclass
class ExportFile:
    content: bytes
    media_type: str
    filename: str


def safe_name(raw: str | None, default: str = DEFAULT_BASENAME) -> str:
    """Reduce arbitrary text to a safe file base name (no paths, no extension, ASCII only)."""
    name = (raw or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"\.(csv|json|zip)$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._-")
    return name[:64] or default


def _json_default(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return str(v)


def _cell(v: Any) -> Any:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, default=_json_default)
    return v


def _validate(data: Data) -> None:
    if not data:
        raise ExportError("No tables to export.")
    total = 0
    for name, rows in data.items():
        if not name.strip():
            raise ExportError("Table names must not be empty.")
        if not rows:
            raise ExportError(f"Table '{name}' has no rows.")
        total += len(rows)
    if total > MAX_TOTAL_ROWS:
        raise ExportError(f"Export too large: {total} rows exceeds the limit of {MAX_TOTAL_ROWS}.")


def _columns(rows: list[dict[str, Any]]) -> list[str]:
    """Column order: first row's order, then any columns first seen in later rows."""
    cols: dict[str, None] = {}
    for r in rows:
        for k in r:
            cols.setdefault(k, None)
    return list(cols)


def table_to_csv(rows: list[dict[str, Any]]) -> bytes:
    cols = _columns(rows)
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(cols)
    for r in rows:
        writer.writerow([_cell(r.get(c)) for c in cols])
    return buf.getvalue().encode("utf-8")


def data_to_json(data: Data) -> bytes:
    return json.dumps(data, ensure_ascii=False, indent=2, default=_json_default).encode("utf-8")


def _unique_names(tables: list[str]) -> dict[str, str]:
    """Map table -> safe, collision-free file base name."""
    used: set[str] = set()
    out: dict[str, str] = {}
    for t in tables:
        base = safe_name(t, "table")
        name, k = base, 2
        while name.lower() in used or name.lower() == "data":
            name, k = f"{base}_{k}", k + 1
        used.add(name.lower())
        out[t] = name
    return out


def export_data(data: Data, fmt: str, filename: str | None = None, include_json: bool = True) -> ExportFile:
    _validate(data)
    base = safe_name(filename)

    if fmt == "csv":
        if len(data) > 1:
            raise ExportError(
                f"CSV export supports a single table but {len(data)} were provided; use format 'zip' "
                "(one CSV per table) or 'json'."
            )
        (rows,) = data.values()
        return ExportFile(table_to_csv(rows), "text/csv; charset=utf-8", f"{base}.csv")

    if fmt == "json":
        return ExportFile(data_to_json(data), "application/json; charset=utf-8", f"{base}.json")

    if fmt == "zip":
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for table, name in _unique_names(list(data)).items():
                z.writestr(f"{name}.csv", table_to_csv(data[table]))
            if include_json:
                z.writestr("data.json", data_to_json(data))
        return ExportFile(buf.getvalue(), "application/zip", f"{base}.zip")

    raise ExportError(f"Unsupported export format '{fmt}'.")
