# API_CONTRACT.md — Frontend ↔ Backend Contract

**Status: frozen.** Describes the **current backend code** (branch `backend-ai`). Field names are exact.
This file governs the HTTP API. `docs/API.md` describes the internal LLM-router architecture only.

- Interactive reference: `GET /docs` (Swagger) and `GET /openapi.json`.
- Example payloads (real, saved): `docs/examples/*.json` (listed in section 10).
- Typed interfaces for every request/response: section 9 (generated from the backend Pydantic models).

---

## 0. Conventions

| Topic | Rule |
|---|---|
| Base URL | `VITE_API_BASE_URL=http://127.0.0.1:8000` (no trailing slash) |
| Body format | JSON (`Content-Type: application/json`) except `/analyze/sample` (multipart) and `/export` (returns a file) |
| Errors | Always `{ "error": { "code", "message", "details" } }` (section 6). Only unknown routes/methods return FastAPI's `{ "detail": "Not Found" \| "Method Not Allowed" }` (404/405) |
| Dates in row data | ISO strings. Date: `"2025-11-19"`. Datetime: `"2025-11-19T03:03:35"` (naive, no timezone). UUIDs are strings. Money/decimals are JSON numbers |
| Nulls | JSON `null` |
| Auth | None |
| Optional fields | In **responses** every field is present (defaults are serialized). In section 9, `?` means "may be omitted **in requests**" |
| Empty form fields | For `/analyze/sample`, an empty string is treated as "not provided" |

### CORS / dev origins
Allowed origins (default): `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`, `http://127.0.0.1:3000`.
Credentials allowed, all methods/headers allowed. `Content-Disposition` is exposed on `/export` so the browser can read the filename.
Another origin (e.g. a different Vite port) → set `CORS_ORIGINS=http://localhost:5174,...` (comma-separated) in `backend/.env` and restart.

### Timeouts (set client timeouts accordingly)
| Endpoint | Typical | Client timeout to use |
|---|---|---|
| `/analyze`, `/analyze/sample` | 5–15 s (one LLM call; up to ~60 s worst case with retries) | **90 s** |
| `/generate` | < 1 s for ≤ 5k rows; a few s for 100k | 60 s |
| `/export` | < 1 s | 30 s |

---

## 1. `GET /health`

Response `200`:
```json
{ "status": "ok", "service": "Synthora AI", "version": "0.1.0" }
```
Use it for the "AI Engine / Backend: Ready" indicator. It does **not** check LLM availability (that surfaces as `503`/`502` from analyze).
`GET /` also exists: `{ "name": "Synthora AI", "message": "From schema to trustworthy synthetic data." }`.

---

## 2. `POST /api/v1/analyze` — prompt mode

Understands a natural-language request and returns an editable **GenerationPlan**.

### Request (JSON) — `AnalyzeRequest`
| Field | Type | Required | Default | Rules |
|---|---|---|---|---|
| `mode` | `"prompt"` \| `"sample"` | **yes** | — | Use `"prompt"` here. `"sample"` returns `501 mode_not_supported` (use `/analyze/sample`) |
| `prompt` | string | **yes when mode=prompt** | `null` | trimmed; ≤ 8000 chars; blank → 422 |
| `target_rows` | integer \| null | no | `null` (= Auto, AI chooses) | 1 … 1 000 000 |
| `locale` | string \| null | no | `null` (= Auto) | ≤ 16 chars, e.g. `"en_PK"` |
| `edge_case_mode` | `"none"`\|`"ai_recommended"`\|`"low"`\|`"medium"`\|`"high"`\|`"custom"` | no | `"ai_recommended"` | |
| `privacy_mode` | `"auto"`\|`"safe_default"`\|`"none"`\|`"custom"` | no | `"auto"` | |
| `seed` | integer \| null | no | `null` | copied into `plan.seed` |

### Response `200` — `AnalyzeResponse`
```json
{ "plan": { /* GenerationPlan */ }, "ai": { "provider": "gemini", "model": "gemini-3.5-flash-lite", "latency_ms": 5887, "fallbacks": 0 } }
```
**User controls always win over the AI** (applied by code after the AI answers):
`locale`, `seed` → `plan.locale`, `plan.seed`; `target_rows` → `tables[*].target_rows` (single table, or tables without AI-proposed counts); `edge_case_mode` → `plan.edge_cases.mode` (`"none"` also empties `recommendations`); `privacy_mode` → `plan.privacy.mode`. When a control is `null`, the AI's choice is kept and explained in `plan.assumptions`.
`plan.source_mode` is `"prompt"`.

### Example
Request (`docs/examples/analyze_prompt_request.json`):
```json
{ "mode": "prompt",
  "prompt": "Generate 20 Pakistani e-commerce customer records with name, email, city, signup date and account status.",
  "target_rows": 20, "locale": "en_PK", "edge_case_mode": "ai_recommended", "privacy_mode": "auto" }
```
Response (abridged; full: `docs/examples/analyze_prompt_response.json`):
```json
{
  "plan": {
    "plan_version": "1.0", "source_mode": "prompt", "domain": "ecommerce", "locale": "en_PK", "seed": null,
    "summary": "Generation plan for 20 Pakistani e-commerce customer records ...",
    "tables": [{
      "name": "customers", "target_rows": 20, "primary_key": ["customer_id"], "foreign_keys": [],
      "columns": [
        { "name": "customer_id", "data_type": "uuid", "semantic_type": "identifier", "is_primary_key": true, "is_unique": true, "nullable": false,
          "generator": { "strategy": "deterministic_id", "generator": "uuid4", "params": {}, "depends_on": [] },
          "pii": { "classification": "none", "privacy_action": "none", "reason": "System identifier" }, "confidence": 1.0 },
        { "name": "email", "data_type": "string", "semantic_type": "email", "is_unique": true,
          "generator": { "strategy": "derived", "generator": null, "params": {}, "depends_on": ["name"] },
          "pii": { "classification": "direct_identifier", "privacy_action": "synthesize", "reason": "Customer email address" } },
        { "name": "city", "data_type": "string", "semantic_type": "city",
          "allowed_values": ["Karachi", "Lahore", "Islamabad"],
          "generator": { "strategy": "categorical", "params": { "weights": { "Karachi": 0.3, "Lahore": 0.3, "Islamabad": 0.15 } } },
          "pii": { "classification": "quasi_identifier", "privacy_action": "synthesize" } }
      ] }],
    "relationships": [],
    "business_rules": [{ "id": "br_signup_date_not_future", "description": "Customer signup date must not be in the future.", "tables": ["customers"], "expression": "signup_date <= today()", "severity": "error" }],
    "edge_cases": { "mode": "ai_recommended", "null_rate": 0.0, "outlier_rate": 0.05, "rare_category_rate": 0.05,
      "recommendations": [{ "name": "suspended_account", "kind": "rare_category", "description": "Include a small number of suspended accounts.", "table": "customers", "column": "account_status", "rate": 0.05, "rationale": "..." }] },
    "privacy": { "mode": "auto" }, "confidence": 1.0, "warnings": [], "assumptions": ["Target row count is fixed at exactly 20 records per user prompt."]
  },
  "ai": { "provider": "gemini", "model": "gemini-3.5-flash-lite", "latency_ms": 5887, "fallbacks": 0 }
}
```

### GenerationPlan — what the UI should know
- `tables[]` → `columns[]` each with `data_type`, `semantic_type`, `description`, `nullable`, `is_primary_key`, `is_unique`, `allowed_values`, `generator`, `pii`, `confidence`.
- `generator.strategy` ∈ `faker | statistical | categorical | deterministic_id | foreign_key | derived | ai_text | constant`. `generator.generator` is a sub-name (Faker provider like `name`, distribution like `lognormal`, `uuid4`…). `generator.params` is a free-form object; **common keys**: `weights` (object value→probability), `mean`/`std`/`min`/`max`/`sigma`, `start_date`/`end_date`, `null_rate` (0–1), `prefix`/`width`/`start`, `synthetic_pool` (object). `generator.depends_on` = same-table columns a `derived` field uses.
- `pii.classification` ∈ `none | direct_identifier | quasi_identifier | sensitive`; `pii.privacy_action` ∈ `none | synthesize | mask | hash | keep`. **Note:** the engine currently always synthesizes new values; `mask/hash/keep` are recorded but not executed (the plan carries a warning).
- `relationships[]`: `parent_table, parent_column, child_table, child_column, cardinality (1:1|1:N|N:N), confidence`. Foreign keys also appear in `tables[].foreign_keys[]`.
- `business_rules[]`: `id, description, tables, expression, severity (error|warning)`. `expression` is free text; only a few forms are machine-checked (see `/generate` → `validation.rules`).
- `edge_cases`: `mode`, global `null_rate/outlier_rate/rare_category_rate` (nullable), and `recommendations[]` (`name, kind, description, table, column, rate, rationale`; `kind` ∈ `null_injection | outlier | rare_category | boundary_value | status_scenario | custom`).
- `warnings[]` (problems) and `assumptions[]` (AI/code choices) — show both; `confidence` is 0–1 or `null`.

### Editing the plan
The UI may edit the plan and send the whole object to `/generate`. Safe edits: `target_rows`, `locale`, `seed`, `edge_cases.*`, `allowed_values`, `generator.params` (weights, ranges, rates), `pii.privacy_action`, `description`, adding/removing recommendations. The plan is re-validated on `/generate`; structural mistakes come back as `422 validation_error` with a `details[].field` path (e.g. `plan.tables.0.columns.0.data_type`, or `plan` for cross-reference errors such as a foreign key pointing at an unknown table).

---

## 3. `POST /api/v1/analyze/sample` — CSV sample mode

The CSV is parsed and profiled **locally**; only a compact profile and ≤ 12 masked sample rows go to the AI. Nothing is stored.

### Request — `multipart/form-data`
| Field | Type | Required | Default | Rules |
|---|---|---|---|---|
| `file` | file | **yes** | — | UTF-8 delimited text (`,` `;` tab `\|` auto-detected). Extension/MIME are **not** checked; `.csv` expected. **Max 10 MB, 200 000 rows, 100 columns** |
| `instruction` | string | no | none | ≤ 8000 chars, e.g. "Generate 5000 new records, preserve category ratios, add failed-payment cases, use Pakistani names." |
| `target_rows` | integer | no | **source row count** | 1 … 1 000 000 |
| `locale` | string | no | AI decides | e.g. `en_PK` |
| `edge_case_mode` | same enum as §2 | no | `ai_recommended` | |
| `privacy_mode` | same enum as §2 | no | `auto` | |
| `seed` | integer | no | none | |

Do **not** set `Content-Type` manually when using `FormData` (the browser adds the boundary).

```ts
const fd = new FormData();
fd.append("file", file);                       // File from <input type="file">
fd.append("instruction", "Preserve city ratios and add suspended accounts");
fd.append("target_rows", "500");               // numbers as strings
fd.append("locale", "en_PK");
const res = await fetch(`${API}/api/v1/analyze/sample`, { method: "POST", body: fd });
```
```bash
curl -X POST http://127.0.0.1:8000/api/v1/analyze/sample \
  -F "file=@customers.csv;type=text/csv" -F "instruction=Generate 100 new Pakistani customers" \
  -F "target_rows=100" -F "locale=en_PK"
```

### Response `200` — `SampleAnalyzeResponse`
```json
{ "plan": { /* GenerationPlan, source_mode = "sample" */ },
  "ai": { "provider": "gemini", "model": "...", "latency_ms": 5887, "fallbacks": 0 },
  "profile": { /* DatasetProfile */ },
  "sample_rows": [ { "name": "Aaaaa Aaaa", "email": "aaaaa.aaaa9@aaaaaaa.aaa", "city": "Lahore", "age": "35", "signup_date": "2024-03-30", "account_status": "active" } ],
  "warnings": [] }
```
Real example: `docs/examples/analyze_sample_response.json` (from `customers.csv`, real Gemini output).

**`plan`** — the same model as §2, grounded in the profile: exactly one table named after the file (`customers.csv` → `customers`) with exactly the CSV's columns in order; `relationships` is `[]`; category weights, numeric `mean/std/min/max`, date `start_date/end_date`, and `null_rate` come from the file; repeated id columns become synthetic pools; `target_rows` = your `target_rows` else the source row count. Extra notes are in `plan.assumptions` / `plan.warnings` (e.g. "No unique identifier column found; the table has no primary key.").

**`profile`** — `DatasetProfile`: `table_name, total_rows, total_columns, delimiter, columns[], likely_identifiers, likely_categorical, likely_numeric, likely_date, likely_pii, warnings`. Each `columns[]` item is a `ColumnProfile`:
- always: `name, dtype (string|integer|float|boolean|date|datetime), row_count, null_count, null_pct (0–100), unique_count, unique_ratio (0–1), sample_values`
- numeric: `min, max, mean, median, std, quantiles {p5,p25,p50,p75,p95}, log_mean, log_std` (else `null`)
- categorical: `top_values[] {value, count, pct (0–100)}`, `is_categorical`
- dates: `date_min, date_max` (ISO), `date_format` (strptime format)
- strings: `str_len {min,max,mean}`
- signals: `is_numeric, is_date, is_identifier, id_like_name, candidate_primary_key, id_pattern, id_repeat, pattern_hints, pii_hint`

**Privacy of the response:** for PII/identifier columns, `sample_values` and `sample_rows` hold **shape masks** (`A`=upper, `a`=lower, `9`=digit), never real values, and `top_values` is empty. `sample_rows` values are strings (or `null`) — they are a preview of the source *shape*, not typed data. `warnings` here are profile warnings (renamed headers, padded rows, empty columns).

---

## 4. `POST /api/v1/generate`

Generates rows from a plan and validates them. CPU-bound, synchronous; no LLM call.

### Request — the plan is **wrapped**, not sent bare
```json
{ "plan": { /* GenerationPlan — exactly as returned/edited from analyze */ },
  "seed": 42,
  "default_rows": null }
```
| Field | Type | Required | Notes |
|---|---|---|---|
| `plan` | GenerationPlan | **yes** | Send the whole object (`response.plan`) |
| `seed` | integer \| null | no | **Seed priority:** `request.seed` → `plan.seed` → random. Same plan + same seed ⇒ same rows (relative dates like `-2y..today` shift with the calendar day) |
| `default_rows` | integer \| null (1…1 000 000) | no | Used only for tables whose `target_rows` is `null`; otherwise the engine defaults to 100 and warns |

Row limit: **100 000 rows per table** (larger → `422 generation_error`).

### Response `200` — `GenerateResponse`
```json
{
  "data": { "customers": [ { "customer_id": "bdd640fb-…", "name": "Fatima Siddiqui", "email": "fatima_siddiqui@outlook.com",
                              "city": "Rawalpindi", "signup_date": "2024-12-24", "account_status": "active" } ] },
  "validation": { "passed": true, "error_count": 0, "warning_count": 0,
    "tables": [ { "table": "customers", "rows": 20, "passed": true,
      "checks": [ { "name": "row_count", "status": "passed", "message": "20 rows as requested", "count": null, "examples": [] } ] } ],
    "rules": [ { "name": "br_signup_date_not_future", "status": "passed", "message": "no dates in the future", "count": null, "examples": [] } ] },
  "warnings": [],
  "metadata": { "tables_generated": 1, "rows_generated": 20, "rows_per_table": { "customers": 20 },
    "generation_order": ["customers"], "seed": 42, "seed_source": "request", "locale": "en_PK", "faker_locale": "en_PK",
    "edge_cases_applied": [ { "table": "customers", "column": "account_status", "kind": "rare_category", "rows_affected": 1, "detail": "ensured >= 1 rows of 'suspended'" } ],
    "duration_ms": 172 }
}
```
Full example: `docs/examples/generate_request.json` → `docs/examples/generate_response.json` (plan A, seed 42).

- **`data`**: object keyed by table name → array of row objects. Key order inside a row = plan column order. Object keys follow generation order (parents first, see `metadata.generation_order`); to display in plan order iterate `plan.tables`. Pass `data` **unchanged** to `/export`.
- **`validation`** (`ValidationReport`): `passed` is `true` iff `error_count == 0`. Per table, `checks[]` names: `row_count, required_columns, null_constraints, primary_key_unique, unique_columns, foreign_keys, allowed_values, data_types`, plus `email_format` (when an email column exists) and `derived:<column>` per derived field. `status` ∈ `passed | warning | error | skipped`; failing checks carry `count` and up to 5 `examples`. `rules[]` = one entry per `business_rules` item: machine-checked forms (`col <= today()`, `unique(col)`, `t.c in p.c`, references/foreign-key rules, running-balance/total rules via derived checks) or `status: "skipped"` with "free-form rule; not machine-checked".
- **`warnings`**: engine notes (locale fallback, Faker parameter fallbacks, unsupported derivations left empty, `ai_text` placeholder text, edge cases skipped…). Show them; they are not errors.
- **`metadata.seed`** is always the seed actually used — show/store it so a run can be reproduced. `seed_source` ∈ `request | plan | random`. `faker_locale` may differ from `locale` when Faker lacks it.
- `validation.passed === false` still returns `200` with data — render the failures; do not treat as an HTTP error.

---

## 5. `POST /api/v1/export`

Turns already-generated data into a downloadable file (built in memory; no regeneration).

### Request — `ExportRequest`
```json
{ "data": { "customers": [ { … } ] }, "format": "zip", "filename": "synthora_export", "include_json": true }
```
| Field | Type | Required | Default | Rules |
|---|---|---|---|---|
| `data` | `Record<table, row[]>` | **yes** | — | Use `generateResponse.data` verbatim. Every table needs ≥ 1 row; ≤ 500 000 rows total |
| `format` | `"csv"` \| `"json"` \| `"zip"` | **yes** | — | anything else → 422 |
| `filename` | string | no | `synthora_export` | ≤ 120 chars in; sanitized to `[A-Za-z0-9._-]` (≤ 64), paths and extension stripped; correct extension added |
| `include_json` | boolean | no | `true` | zip only: also include `data.json` |

### Behaviour
| format | Content | `Content-Type` | Filename |
|---|---|---|---|
| `csv` | **exactly one table** (with several tables → `422 export_error` telling you to use `zip`/`json`). UTF-8, CRLF, header row; column order = first row then later-seen keys; `null` → empty cell, booleans → `true`/`false`, nested values → JSON text | `text/csv; charset=utf-8` | `<name>.csv` |
| `json` | `{ "<table>": [rows] }` for one or many tables, indented UTF-8 | `application/json; charset=utf-8` | `<name>.json` |
| `zip` | `<table>.csv` per table (+ `data.json` if `include_json`); table names sanitized and de-duplicated (`data` is reserved) | `application/zip` | `<name>.zip` |

Response headers: `Content-Disposition: attachment; filename="<name>.<ext>"`, `Content-Length`, and `Access-Control-Expose-Headers: Content-Disposition`. The body is the file (**not JSON**) on success; errors are the JSON envelope (`422`).

### Browser handling
```ts
async function exportFile(data: GenerateResponse["data"], format: "csv"|"json"|"zip", filename?: string) {
  const res = await fetch(`${API}/api/v1/export`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, format, filename }),
  });
  if (!res.ok) throw await parseApiError(res);                 // JSON envelope
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `synthora_export.${format}`;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
```
UI rule: single table → offer **CSV** and **JSON**; multiple tables → offer **ZIP** and **JSON** (do not offer CSV).

---

## 6. Error contract

Every handled error: `Content-Type: application/json`
```json
{ "error": { "code": "<string>", "message": "<human readable>", "details": null } }
```
`details` is `null` unless stated. Show `message`; branch on `code`.

| HTTP | `code` | Raised by | `details` | Example `message` |
|---|---|---|---|---|
| 422 | `validation_error` | any endpoint: body/form/plan validation | `[{ "field": string, "message": string }]` (`field` is a dotted path such as `target_rows`, `plan.tables.0.columns.0.data_type`, `file`, `format`; `"body"` for whole-body rules like a missing prompt) | `Request validation failed.` |
| 501 | `mode_not_supported` | `/analyze` with `mode:"sample"` | null | `Sample-data mode needs a file upload: use POST /api/v1/analyze/sample.` |
| 503 | `ai_provider_not_configured` | `/analyze`, `/analyze/sample` (no LLM key/model) | null | `No AI provider is configured. Set an API key and model in backend/.env (see .env.example).` |
| 502 | `ai_providers_failed` | `/analyze`, `/analyze/sample` (all providers failed/timeouts/invalid output/quota) | `string[]` attempts, e.g. `["gemini: call failed (Gemini API error 503: UNAVAILABLE)"]` | `All configured AI providers failed.` |
| 422 | `invalid_sample` | `/analyze/sample` unusable file | null | `The uploaded file is empty.` / `The file must be UTF-8 encoded text.` / `Malformed CSV: 12 of 40 rows do not have 6 fields (first at line 5).` / `The CSV has a header but no data rows.` / `Too many rows (…); the limit is 200000.` |
| 413 | `file_too_large` | `/analyze/sample` > 10 MB | null | `File is too large (… bytes); the limit is 10 MB.` |
| 422 | `generation_error` | `/generate` | null | `customers: 10000000 rows exceeds the limit of 100000 per table` |
| 422 | `export_error` | `/export` | null | `No tables to export.` / `Table 'x' has no rows.` / `CSV export supports a single table but 2 were provided; use format 'zip' (one CSV per table) or 'json'.` / `Export too large: …` |
| 500 | `internal_error` | anything unexpected | null | `Unexpected server error.` |

Examples:
```json
{ "error": { "code": "validation_error", "message": "Request validation failed.",
  "details": [ { "field": "edge_case_mode", "message": "Input should be 'none', 'ai_recommended', 'low', 'medium', 'high' or 'custom'" } ] } }
{ "error": { "code": "ai_providers_failed", "message": "All configured AI providers failed.",
  "details": [ "gemini: call failed (Gemini API error 429: RESOURCE_EXHAUSTED)" ] } }
{ "error": { "code": "invalid_sample", "message": "The uploaded file is empty.", "details": null } }
```
Suggested UX: `502` → "AI is busy, try again" with a Retry button (transient quota/overload is common on free tiers); `503` → "AI engine not configured" (developer problem); `422 validation_error` → highlight `details[].field`; `413/invalid_sample` → show under the upload box.

Helper:
```ts
export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public details: unknown = null) { super(message); } }
export async function parseApiError(res: Response): Promise<ApiError> {
  try { const j = await res.json(); if (j?.error) return new ApiError(res.status, j.error.code, j.error.message, j.error.details);
        return new ApiError(res.status, "http_error", j?.detail ?? res.statusText); }
  catch { return new ApiError(res.status, "http_error", res.statusText); }
}
```

---

## 7. Frontend flow

**Prompt flow**
1. Prompt form (prompt, `target_rows` or Auto, `locale` or Auto, edge cases, privacy) → `POST /api/v1/analyze` (spinner "AI is analysing…", 90 s timeout). Auto ⇒ send `null`/omit.
2. Render `response.plan` (tables, columns, generators, PII, relationships, rules, edge cases, `warnings`, `assumptions`, `confidence`) and `response.ai` for the optional dev badge (`provider`, `latency_ms`, `fallbacks`). Let the user edit the plan.
3. "Generate" → `POST /api/v1/generate` with `{ plan, seed? }`.
4. Render preview tables from `data`, the validation summary (`validation.passed`, per-table `checks`, `rules`), `warnings`, `metadata` (rows, seed, edge cases applied).
5. Export → `POST /api/v1/export` with `data` from step 3. Single table: CSV/JSON. Multiple tables: ZIP/JSON.

**Sample flow**
1. CSV upload + controls (instruction, target rows, locale, edge cases, privacy) → `POST /api/v1/analyze/sample` (multipart).
2. Render `profile` (row/column counts, per-column dtype, null %, uniqueness, top values, ranges, PII hints) and `plan` (as above); `profile.warnings` + `plan.warnings`.
3–5. Identical to steps 3–5 of the prompt flow.

Keep in state: `plan` (editable), `lastGenerate` (`data`, `validation`, `metadata`). Re-generating with a different seed = same plan, new `seed`. Do not re-call `/analyze` to regenerate.

```ts
const API = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) throw await parseApiError(res);
  return res.json();
}
export const analyzePrompt = (b: AnalyzeRequest) => post<AnalyzeResponse>("/api/v1/analyze", b);
export const generate = (plan: GenerationPlan, seed?: number) => post<GenerateResponse>("/api/v1/generate", { plan, seed });
```

---

## 8. Environment

Frontend `.env` (Vite):
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```
Run backend from `backend/`: `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` (add `--reload` for dev). Backend needs `backend/.env` with `GEMINI_API_KEY` and `GEMINI_MODEL` for the analyze endpoints; `/generate` and `/export` work without any key.

---

## 9. TypeScript types (generated from the backend models)

`?` = optional in requests only; responses always contain every field. `AnalyzeRequest` and `ExportRequest` are defined at the end. `ColumnProfile.rank_counts` is internal and never serialized.

```ts
interface AIRunMeta {
  provider: string;
  model?: string | null;
  latency_ms: number;
  fallbacks?: number;
}

interface AnalyzeResponse {
  plan: GenerationPlan;
  ai: AIRunMeta;
}

interface BusinessRule {
  id: string;
  description: string;
  tables?: string[];
  expression?: string | null;
  severity?: "error" | "warning";
}

type Cardinality = "1:1" | "1:N" | "N:N";

interface CheckResult {
  name: string;
  status: "passed" | "warning" | "error" | "skipped";
  message: string;
  count?: number | null;
  examples?: string[];
}

interface ColumnPlan {
  name: string;
  data_type: DataType;
  semantic_type: string;
  description?: string | null;
  nullable?: boolean;
  is_primary_key?: boolean;
  is_unique?: boolean;
  allowed_values?: string[] | null;
  generator: GeneratorSpec;
  pii?: PIIInfo;
  confidence?: number | null;
}

interface ColumnProfile {
  name: string;
  dtype: "string" | "integer" | "float" | "boolean" | "date" | "datetime";
  row_count: number;
  null_count: number;
  null_pct: number;
  unique_count: number;
  unique_ratio: number;
  sample_values?: string[];
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  quantiles?: Record<string, number> | null;
  log_mean?: number | null;
  log_std?: number | null;
  top_values?: ValueFreq[];
  date_min?: string | null;
  date_max?: string | null;
  date_format?: string | null;
  str_len?: Record<string, number> | null;
  is_categorical?: boolean;
  is_numeric?: boolean;
  is_date?: boolean;
  is_identifier?: boolean;
  id_like_name?: boolean;
  candidate_primary_key?: boolean;
  id_pattern?: Record<string, unknown> | null;
  id_repeat?: Record<string, number> | null;
  pattern_hints?: string[];
  pii_hint?: string | null;
}

type DataType = "string" | "integer" | "float" | "decimal" | "boolean" | "date" | "datetime" | "time" | "uuid" | "json";

interface DatasetProfile {
  table_name: string;
  total_rows: number;
  total_columns: number;
  delimiter: string;
  columns: ColumnProfile[];
  likely_identifiers?: string[];
  likely_categorical?: string[];
  likely_numeric?: string[];
  likely_date?: string[];
  likely_pii?: string[];
  warnings?: string[];
}

interface EdgeCaseApplied {
  table: string;
  column: string;
  kind: string;
  rows_affected: number;
  detail?: string | null;
}

interface EdgeCaseConfig {
  mode?: "none" | "ai_recommended" | "low" | "medium" | "high" | "custom";
  null_rate?: number | null;
  outlier_rate?: number | null;
  rare_category_rate?: number | null;
  recommendations?: EdgeCaseRecommendation[];
}

type EdgeCaseKind = "null_injection" | "outlier" | "rare_category" | "boundary_value" | "status_scenario" | "custom";

interface EdgeCaseRecommendation {
  name: string;
  kind?: EdgeCaseKind;
  description: string;
  table?: string | null;
  column?: string | null;
  rate?: number | null;
  rationale?: string | null;
}

interface ForeignKey {
  column: string;
  references_table: string;
  references_column: string;
}

interface GenerateRequest {
  plan: GenerationPlan;
  seed?: number | null;
  default_rows?: number | null;
}

interface GenerateResponse {
  data: Record<string, Record<string, unknown>[]>;
  validation: ValidationReport;
  warnings: string[];
  metadata: GenerationMetadata;
}

interface GenerationMetadata {
  tables_generated: number;
  rows_generated: number;
  rows_per_table: Record<string, number>;
  generation_order: string[];
  seed: number;
  seed_source: "request" | "plan" | "random";
  locale: string | null;
  faker_locale: string;
  edge_cases_applied?: EdgeCaseApplied[];
  duration_ms: number;
}

interface GenerationPlan {
  plan_version?: string;
  source_mode?: "prompt" | "sample";
  domain: string;
  summary?: string | null;
  locale?: string | null;
  seed?: number | null;
  tables: TablePlan[];
  relationships?: Relationship[];
  business_rules?: BusinessRule[];
  edge_cases?: EdgeCaseConfig;
  privacy?: PrivacyConfig;
  confidence?: number | null;
  warnings?: string[];
  assumptions?: string[];
}

interface GeneratorSpec {
  strategy: GeneratorStrategy;
  generator?: string | null;
  params?: Record<string, unknown>;
  depends_on?: string[];
}

type GeneratorStrategy = "faker" | "statistical" | "categorical" | "deterministic_id" | "foreign_key" | "derived" | "ai_text" | "constant";

type PIIClass = "none" | "direct_identifier" | "quasi_identifier" | "sensitive";

interface PIIInfo {
  classification?: PIIClass;
  privacy_action?: PrivacyAction;
  reason?: string | null;
}

type PrivacyAction = "none" | "synthesize" | "mask" | "hash" | "keep";

interface PrivacyConfig {
  mode?: "auto" | "safe_default" | "none" | "custom";
}

interface Relationship {
  parent_table: string;
  parent_column: string;
  child_table: string;
  child_column: string;
  cardinality?: Cardinality;
  confidence?: number | null;
}

interface SampleAnalyzeResponse {
  plan: GenerationPlan;
  ai: AIRunMeta;
  profile: DatasetProfile;
  sample_rows?: Record<string, unknown>[];
  warnings?: string[];
}

interface TablePlan {
  name: string;
  description?: string | null;
  target_rows?: number | null;
  columns: ColumnPlan[];
  primary_key?: string[];
  foreign_keys?: ForeignKey[];
}

interface TableValidation {
  table: string;
  rows: number;
  passed: boolean;
  checks: CheckResult[];
}

interface ValidationReport {
  passed: boolean;
  error_count: number;
  warning_count: number;
  tables: TableValidation[];
  rules?: CheckResult[];
}

interface ValueFreq {
  value: string;
  count: number;
  pct: number;
}

// ---- request bodies (JSON) ----
interface AnalyzeRequest {
  mode: "prompt" | "sample";
  prompt?: string | null;                      // required when mode === "prompt"
  target_rows?: number | null;                 // 1..1_000_000
  locale?: string | null;
  edge_case_mode?: "none" | "ai_recommended" | "low" | "medium" | "high" | "custom";   // default "ai_recommended"
  privacy_mode?: "auto" | "safe_default" | "none" | "custom";                          // default "auto"
  seed?: number | null;
}
interface ExportRequest {
  data: Record<string, Record<string, unknown>[]>;
  format: "csv" | "json" | "zip";
  filename?: string | null;
  include_json?: boolean;                      // default true (zip only)
}
interface ErrorResponse { error: { code: string; message: string; details: unknown } }
```

## 10. Example files

| File | What |
|---|---|
| `docs/examples/analyze_prompt_request.json` | `/analyze` request |
| `docs/examples/analyze_prompt_response.json` | real Gemini response (plan A) |
| `docs/examples/analyze_sample_response.json` | real Gemini response for `tests/fixtures/samples/customers.csv` (no raw source data: PII columns are shape-masked) |
| `docs/examples/generate_request.json` | `/generate` request (plan A, seed 42) |
| `docs/examples/generate_response.json` | `/generate` response (20 rows, validation passed) |
| `docs/examples/export_request.json` | `/export` request (`format: "csv"`) |
