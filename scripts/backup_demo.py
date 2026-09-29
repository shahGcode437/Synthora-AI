#!/usr/bin/env python3
"""Backup demo: run a SAVED Generation Plan through the live /generate and /export endpoints.

Use this when the LLM (Gemini/Groq) is unavailable. It needs only the backend running: generation,
validation and export never call an LLM. The plans were produced earlier by a real LLM and saved;
this script does NOT analyze anything, so present the output as "generated from a saved plan".

    python scripts/backup_demo.py hospital
    python scripts/backup_demo.py ecommerce --seed 7
    python scripts/backup_demo.py banking
    python scripts/backup_demo.py csv-customers --rows 500
    python scripts/backup_demo.py path/to/any_plan.json

Standard library only. Output goes to ./demo_output/ (git-ignored).
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAVED = {
    "ecommerce": ROOT / "backend/tests/fixtures/plan_a.json",
    "hospital": ROOT / "backend/tests/fixtures/plan_b_hospital.json",
    "banking": ROOT / "backend/tests/fixtures/plan_c_banking.json",
    "csv-customers": ROOT / "docs/examples/analyze_sample_response.json",
}


def post(api: str, path: str, body: dict) -> tuple[bytes, dict]:
    req = urllib.request.Request(api + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        sys.exit(f"API error {e.code} on {path}: {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"Cannot reach the backend at {api} ({e.reason}). Start it first:\n"
                 "  cd backend && .venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8000")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan", help=f"one of {', '.join(SAVED)} or a path to a plan/analyze-response JSON file")
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--seed", type=int, default=42, help="fixed seed so reruns give identical rows (default 42)")
    ap.add_argument("--rows", type=int, help="override target_rows on every table")
    ap.add_argument("--out", default=str(ROOT / "demo_output"))
    a = ap.parse_args()

    path = SAVED.get(a.plan) or Path(a.plan)
    if not path.exists():
        sys.exit(f"Plan file not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    plan = data.get("plan", data)  # accept a bare plan or an /analyze response
    if a.rows:
        for t in plan["tables"]:
            t["target_rows"] = a.rows

    print(f"== BACKUP DEMO: saved plan '{path.name}' (domain: {plan['domain']}) - NOT a live AI analysis ==")
    body, _ = post(a.api, "/api/v1/generate", {"plan": plan, "seed": a.seed})
    res = json.loads(body)
    m, v = res["metadata"], res["validation"]
    print(f"generated {m['rows_generated']:,} rows in {m['duration_ms']} ms | seed {m['seed']} | order {' -> '.join(m['generation_order'])}")
    for t, n in m["rows_per_table"].items():
        print(f"  {t}: {n:,} rows")
    print(f"validation: {'PASSED' if v['passed'] else 'FAILED'} | {v['error_count']} errors | {v['warning_count']} warnings")
    for tv in v["tables"]:
        for c in tv["checks"]:
            if c["status"] != "passed":
                print(f"  [{c['status']}] {tv['table']}.{c['name']}: {c['message']}")
    for w in res["warnings"]:
        print(f"  note: {w}")

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tables = res["data"]
    fmt = "csv" if len(tables) == 1 else "zip"  # CSV is single-table only
    name = f"synthora_backup_{a.plan if a.plan in SAVED else path.stem}"
    for f in (fmt, "json"):
        blob, headers = post(a.api, "/api/v1/export", {"data": tables, "format": f, "filename": name})
        dest = out / f"{name}.{f}"
        dest.write_bytes(blob)
        print(f"exported {f.upper():4} -> {dest} ({len(blob):,} bytes)")
    print("Done. Explain honestly: the plan was saved from an earlier live AI run; generation, validation and export just ran live.")


if __name__ == "__main__":
    main()
