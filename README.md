# Synthora AI

**From schema to trustworthy synthetic data.**

Synthora AI turns a plain-language description — or an uploaded CSV — into realistic, privacy-safe, internally consistent synthetic data, and then *proves* the result is trustworthy with deterministic validation and an original-vs-synthetic fidelity report.

> **AI understands the unknown. Specialized generators create realistic primitives. Deterministic code guarantees correctness.**

---

## Problem

Real data is sensitive, scarce and slow to get. Developers, testers and analysts need data that *behaves* like the real thing — realistic values, valid relationships, meaningful edge cases — without exposing real people. Random "fake data" tools break foreign keys, ignore business rules and say nothing about how good the result is. Asking an LLM to write thousands of rows is slow, expensive and unreliable.

## Solution

A hybrid pipeline where each part does what it is best at:

```
Input (prompt or CSV) → AI understanding → editable Generation Plan → hybrid generation
   → privacy / PII handling → edge-case injection → deterministic validation
   → quality & fidelity report → CSV / JSON / ZIP
```

- **AI (LLM)** interprets meaning: domain, tables, semantic types, PII, business rules, edge cases. It never writes rows.
- **Generators (Faker + statistics)** create realistic values in bulk, fast and reproducibly.
- **Deterministic code** guarantees primary-key uniqueness, foreign-key integrity, arithmetic (e.g. running balances) and validates everything afterwards.

## Core Features

- Two inputs: **natural-language prompt** or **CSV upload**.
- A visible, editable **Generation Plan** before any data is generated.
- **Multi-table relational** output with valid PK/FK relationships and no orphan rows.
- **PII detection** (local patterns + AI semantics) with planned privacy actions.
- **Edge-case injection** (nulls, outliers, rare categories, failed-status scenarios).
- **Deterministic validation** with a structured, per-table report.
- **Quality & Fidelity** dashboard comparing source vs synthetic (CSV mode).
- **Multi-model routing** with automatic failover (Gemini → Groq).
- **Export** to CSV, JSON, or ZIP (one CSV per table).
- Reproducible: same plan + same seed = same rows.

## Prompt Mode

Describe a dataset ("Generate synthetic hospital appointment data with patients, doctors and appointments…"). The AI proposes tables, columns, keys, relationships, generator strategy per field, PII classification, business rules and edge cases. Your controls (row count, locale, edge-case level, privacy mode, seed) always override the AI's assumptions.

## Sample CSV Mode

Upload a CSV. It is **profiled locally** (types, null rates, uniqueness, numeric statistics, category frequencies, date ranges, identifier formats, PII hints) — the file is never sent to the AI. Only a compact profile plus a few **shape-masked** sample rows (`Aaaaa Aaaa`, `aaaa.aaaa9@aaaaaaa.aaa`) reach the LLM, which interprets *meaning*. A deterministic **grounding** step then copies the facts back into the plan: exact category ratios, numeric ranges/statistics, date ranges, null rates and identifier formats. Uploaded data is processed in memory and never stored. Limits: 10 MB, 200,000 rows, 100 columns.

## GenerationPlan

One strongly typed Pydantic contract (`backend/app/models/plan.py`) that every provider normalizes into: domain, tables, columns, data/semantic types, generator strategy per field, primary/foreign keys, relationships, PII classification and privacy action, business rules, edge-case configuration, target rows, locale, confidence, warnings and assumptions. Structural integrity (columns exist, PK/FK references valid, no duplicates) is validated on every plan, whichever provider produced it.

## Hybrid Generation Engine

| Strategy | Used for | Guarantee |
|---|---|---|
| `deterministic_id` | primary keys, sequences, UUIDs | unique by construction |
| `faker` | names, cities, phones, dates… (locale-aware; curated Pakistani pools for `en_PK`) | realistic primitives |
| `categorical` | statuses, categories (weighted) | only allowed values, source ratios preserved |
| `statistical` | numeric measures (normal / lognormal / uniform…) | source ranges preserved |
| `foreign_key` | child → parent references | always references a real parent; parents generated first |
| `derived` | email from name, totals, **running balances** | computed by code, never random |
| `ai_text` | free text | placeholder text today (see limitations) |

## Privacy / PII

Hybrid detection: deterministic patterns and column names locally, plus AI semantic classification (direct identifier / quasi-identifier / sensitive). Locally detected PII the AI misses is upgraded automatically. Generated values are always newly synthesized — source values are never copied into the output, repeating identifiers become fresh synthetic pools, and PII columns are masked before anything reaches the AI or the charts. Honest scope note: `mask` / `hash` / `keep` actions are *planned and recorded* but the engine currently always synthesizes.

## Edge Cases

Modes: None, AI Recommended, Low, Medium, High, Custom. The AI proposes plausible, domain-aware cases (e.g. failed payments, cancelled appointments); code applies them: rare-category top-ups, outliers, null injection. Keys, foreign keys and columns other fields depend on are never damaged, and value edge cases run *before* derived fields so running balances stay consistent.

## Validation

A deterministic engine (no AI) checks: row count, required columns, null constraints, PK uniqueness, unique columns, FK integrity / no orphans, allowed categorical values, data types, email format, derived-field consistency (e.g. running balance reconciles per account in time order) and machine-checkable business rules (`date <= today()`, `unique(col)`, references). Free-form rules are reported as *skipped*, never faked as passed.

## Quality & Fidelity

For CSV mode, the UI compares **original vs synthetic** using real calculated figures only: category shares (grouped bars), numeric statistics and quantile strips, null rates, date ranges, schema match and type match — plus a validation summary. Prompt mode shows validation-focused quality only and does not invent comparisons. Personal-data columns are never charted.

## Multi-Model AI Routing

An `LLMRouter` tries providers in `LLM_PROVIDER_ORDER` (default **`gemini,groq`**). It retries once on transient errors, falls back on failure, and treats a response as successful only after it parses **and validates** against the shared `GenerationPlan`. A shared normalizer tolerates harmless LLM output quirks (enum spelling, `null` for defaults, percent vs fraction) without weakening structural validation, and notes every adjustment in the plan warnings. The response reports `provider`, `model`, `latency_ms` and `fallbacks`. Real failover (Gemini → Groq) has been demonstrated live. Adapters for OpenAI and Qwen also exist but are not part of the demo configuration.

## Export

CSV (single table), JSON (any), ZIP (one CSV per table + `data.json`). Built in memory; filenames are sanitized; nothing is stored.

## Architecture

```
Frontend (React + Vite)  ──HTTP──▶  FastAPI
                                      ├─ /api/v1/analyze         prompt → LLMRouter → GenerationPlan
                                      ├─ /api/v1/analyze/sample  CSV → parser → profiler → sampler → LLMRouter → grounding → GenerationPlan
                                      ├─ /api/v1/generate        plan → generation engine → validation
                                      └─ /api/v1/export          data → CSV / JSON / ZIP
LLMRouter: Gemini ─fail→ Groq        (same GenerationPlan contract for all providers)
```

```
backend/app/
  ai/          providers (Gemini, OpenAI-compatible: Groq/OpenAI/Qwen), router, prompts, normalizer
  models/      GenerationPlan, API + profile + generation + export contracts
  profiling/   CSV parser, profiler, representative sampler
  generation/  engine, generators, derived fields, edge cases, locale packs
  validation/  deterministic validator
  exports/     CSV / JSON / ZIP
  services/    analyze, sample, grounding, generate
frontend/src/  api client · state machine · sections (Input, Analyze, Plan, Generated, Validation, Quality, Export)
docs/          contract, examples, demo material
```

The exact HTTP contract is frozen in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

## Tech Stack

**Backend:** Python 3.12, FastAPI, Pydantic v2, Faker, NumPy, `google-genai`, OpenAI SDK (Groq / OpenAI / Qwen via OpenAI-compatible APIs), pytest.
**Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide icons; charts are plain CSS/SVG.

## Setup

Prerequisites: Python 3.12, Node.js 20.19+ (developed on Node 24).

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt     # Windows
# macOS/Linux: .venv/bin/python -m pip install -r requirements-dev.txt
copy .env.example .env        # then edit backend/.env (see below)   [cp on macOS/Linux]

# Frontend
cd ../frontend
npm install
```

## Environment Variables

`backend/.env` (never commit it — it is git-ignored):

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER_ORDER` | provider order, default `gemini,groq` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | primary provider |
| `GROQ_API_KEY`, `GROQ_MODEL` | fallback provider |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | optional adapter |
| `QWEN_API_KEY`, `QWEN_MODEL`, `QWEN_BASE_URL` | optional adapter (endpoint is region/workspace specific) |
| `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES_PER_PROVIDER` | tuning (defaults 25 / 1) |
| `CORS_ORIGINS` | allowed browser origins (defaults cover localhost:5173 and :3000) |

A provider is registered only when its key **and** model (and base URL for Qwen) are set. Generation, validation and export work with **no key at all**; only the two analyze endpoints need an LLM.

`frontend/.env` (optional): `VITE_API_BASE_URL=http://127.0.0.1:8000`

## Run Backend

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
Health: `http://127.0.0.1:8000/health` · Interactive API docs: `http://127.0.0.1:8000/docs`
Tests: `.venv\Scripts\python.exe -m pytest -q` (205 tests, no network or API key required).

## Run Frontend

```bash
cd frontend
npm run dev        # http://127.0.0.1:5173
npm run build      # type-check + production build
```

## Demo Flow

1. **Prompt mode:** click *Hospital appointments* → **Analyze with AI** → review the plan (3 tables, 2 relationships, PII, rules, edge cases) → **Generate** → preview each table → validation (all green) → **Export ZIP**.
2. **CSV mode:** upload `backend/tests/fixtures/samples/customers.csv`, ask for "500 new Pakistani customers, preserve city and status ratios, add a few suspended accounts" → review the source profile and grounded plan → **Generate** → **Quality & Fidelity** (original vs synthetic) → export CSV.

Full script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). Fallback plan: [`docs/BACKUP_DEMO.md`](docs/BACKUP_DEMO.md).

## Example Prompts

See [`docs/DEMO_PROMPTS.md`](docs/DEMO_PROMPTS.md) — e-commerce, healthcare and banking, with what each demonstrates. Example:

> Generate synthetic hospital appointment data with patients, doctors and appointments. Appointments must reference valid patients and doctors.

## Known Limitations

- `mask` / `hash` / `keep` privacy actions are recorded in the plan but not executed; the engine always synthesizes new values.
- CSV mode produces one table; multi-table relational data comes from prompt mode. No Excel, JSON, SQL or document (PDF) input/output yet.
- Columns are generated independently: correlations between columns (e.g. age vs status) are not modelled.
- Free-text (`ai_text`) fields currently use placeholder Faker text; batched LLM text generation is not implemented.
- Source histograms are not kept; numeric fidelity is shown through quantiles and summary statistics.
- Many-to-many and self-referencing relationships are not generated; max 100,000 rows per table.
- Plan editing in the UI is limited to per-table row counts and the seed.
- Relative dates (e.g. "last 2 years") shift with the calendar day even under a fixed seed.
- LLM free tiers rate-limit; that is what the fallback provider and the backup demo are for.

## Future Work

Execute mask / hash / keep privacy actions; multi-table CSV/SQL schema input; correlation-aware and model-based generation; batched LLM text fields; document generation (invoices, bank statements) from the same synthetic world; editable business rules and edge cases in the UI; source-vs-synthetic histograms; persisted projects and shareable reports.
