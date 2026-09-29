# REQUIREMENTS.md — Frozen Requirements

## Status

**Frozen for hackathon implementation.**

Changes after this point should only be made if:
- a requirement from the official brief was missed,
- a blocker makes the current implementation impossible,
- or a clearly higher-value change replaces a lower-value feature.

The goal is to prevent scope creep.

---

## 1. Official Product Scope

The system is a **Synthetic Data Platform** capable of producing:

- tabular synthetic data,
- relational synthetic data,
- document-style synthetic data.

The core pipeline is:

**Input → Schema Understanding → Relationship Modeling → AI-Assisted Generation → Validation → Export**

---

## 2. Input Requirements

### 2.1 Prompt Mode

User provides a natural-language dataset description.

Main fields:

- Dataset description / prompt — **required**
- Target records — value or **Auto / None**
- Locale / region — value or **Auto / None**
- Edge cases — **None / AI Recommended / Low / Medium / High / Custom**
- Privacy preference — **Auto / Safe Default / None / Custom**

Advanced optional fields:

- random seed
- null rate
- outlier rate
- rare-category rate
- business rules
- date range
- currency
- distribution preferences
- other constraints

### 2.2 Sample / Existing Data Mode

User uploads:

- CSV — P0
- JSON — P0 if time permits
- Excel — P1
- SQL/schema definition — P1

Main fields:

- uploaded file — **required**
- target records — value or **Auto / None**
- edge cases — **None / AI Recommended / Low / Medium / High / Custom**
- privacy preference — **Auto / Safe Default / None / Custom**

Optional:

- instruction prompt
- locale override
- random seed
- fidelity level
- null handling
- outlier handling
- preserve/synthesize/mask/hash selections

---

## 3. Large-File Processing Requirement

The system must **not blindly send a large raw dataset to the LLM**.

Required local preprocessing:

- parse file
- count rows / columns
- infer primitive dtypes
- null percentages
- uniqueness percentages
- numeric statistics
- categorical frequencies
- date ranges
- candidate keys
- possible FK overlap
- representative samples
- obvious format patterns

Then send a compact structured summary to AI.

### Principle

> Machines calculate facts. AI interprets meaning.

---

## 4. AI Intelligence Requirements

AI should be used at high-value semantic points.

Required AI responsibilities:

- understand domain
- infer semantic column meaning
- infer or confirm schema
- detect ambiguous identifiers
- interpret PII/sensitive fields
- infer logical relationships
- understand business rules
- propose domain-specific edge cases
- create the Generation Plan
- decide which generator is appropriate per field
- generate semantic/free-text fields where required

AI should **not** be solely trusted for:

- PK uniqueness
- FK validity
- mapping consistency
- arithmetic reconciliation
- strict schema validation
- deterministic privacy transformations
- deterministic export logic

---

## 5. Generation Plan Requirement

A visible Generation Plan must be shown before final generation.

It should include:

- inferred domain
- tables / entities
- columns and semantic types
- candidate PK/FK
- relationships
- PII fields
- selected generator per field
- source distributions to preserve
- business rules
- edge-case strategy
- target record count
- privacy actions
- warnings / low-confidence assumptions

The user must be able to:

- accept
- edit
- correct
- continue

Low-confidence important assumptions should be surfaced.

---

## 6. Faker Requirements

Faker is allowed and encouraged for appropriate primitive values.

Good uses:

- names
- addresses
- phone numbers
- companies
- cities
- dates
- UUIDs
- simple locale-aware primitives

Faker must receive an interpreted schema/generation instruction first.

Faker must not independently create:

- foreign keys
- related-table logic
- business-rule relationships
- invoice totals
- running balances
- statistical distributions that should be learned from source
- complex semantic text

Where records must feel coherent, generation should be persona/context aware rather than independent per-column randomness.

---

## 7. Statistical Generation Requirements

For uploaded sample data, preserve useful characteristics where feasible:

- numeric distributions
- categorical proportions
- null behavior
- date patterns
- selected correlations

The user may override source behavior.

---

## 8. Relational / Mapping Requirements

Required:

- PK uniqueness
- FK validity
- no orphan rows
- configurable or inferred 1:1 / 1:N / N:N relationships
- deterministic generation order
- consistent mappings
- cross-table consistency

Example:

Customers → Orders → OrderItems

AI may discover relationships, but code must enforce them.

---

## 9. PII / Privacy Requirements

### Detection

Hybrid detection:

- deterministic patterns for obvious structures
- AI semantics for ambiguous fields

### Actions

For source-data mode:

- Synthesize / Replace
- Mask
- Hash
- Keep

Prompt-generated fake data normally does not require hashing of nonexistent real PII.

### Privacy rule

Never intentionally expose real source PII in generated outputs when a privacy action is enabled.

---

## 10. Edge-Case Requirements

Main options:

- None
- AI Recommended
- Low
- Medium
- High
- Custom

Custom may expose:

- null rate
- outlier rate
- rare-category rate
- domain-specific conditions

AI should recommend **plausible testing edge cases**, not random nonsense.

Impossible/invalid values should only be generated when the user explicitly wants invalid-input testing.

---

## 11. Null / Outlier Handling

Do not reduce the platform to “remove nulls.”

Preferred controls:

### Nulls
- Preserve source behavior
- AI Recommended
- Reduce
- Increase for testing
- None
- Custom %

### Outliers
- Preserve source behavior
- AI Recommended
- None
- Custom %

---

## 12. Validation Requirements

Generation is incomplete until validation finishes.

### Schema validation
- expected columns
- type compatibility
- required constraints

### Relational validation
- PK uniqueness
- valid FKs
- no orphan records
- expected cardinalities

### Business-rule validation
- order totals
- invoice totals
- transaction running balances
- logical dates
- allowed statuses where known

### Privacy validation
- requested masking / hashing / synthesis applied
- obvious source PII leakage check where feasible

### Statistical validation
- source vs synthetic distributions
- categorical ratios
- null-rate comparison
- selected correlations where feasible

### Edge-case validation
- requested edge-case level actually represented

---

## 13. Auto-Correction Requirement

Simple deterministic failures should be repairable automatically.

Examples:

- duplicate primary keys
- invalid foreign keys
- malformed derived emails
- incorrect arithmetic totals

AI may assist for semantic corrections, but deterministic issues should be fixed in code.

---

## 14. Quality & Visualization Requirements

After generation, show:

- generated row count
- schema compliance
- PK uniqueness
- FK integrity
- PII protection status
- null target vs actual
- edge cases injected
- validation result

For uploaded-source mode, include:

- numeric histogram
- categorical bar comparison
- original vs synthetic comparison
- similarity/fidelity indication

Optional P1:

- correlation comparison
- time trends
- downloadable chart image/report

---

## 15. Output Requirements — Frozen Decision

The user does **not** choose only one output type at the start.

At the end, the result area shows:

- **Tabular**
- **Relational**
- **Documents**

### Tabular export
- CSV
- JSON

### Relational export
- multiple related tables
- related CSV/JSON
- SQL dump if feasible
- ZIP bundle if useful

### Documents
- invoices
- bank statements
- PDF-style documents
- supporting structured data

Documents should reuse the same generated synthetic world where meaningful.

---

## 16. UI Requirements

One polished no-code workspace.

Core states:

- input
- analysis
- generation plan
- generation progress
- preview
- relationship/schema view
- quality report
- final output/export

Required UX qualities:

- minimal clutter
- strong hierarchy
- responsive
- clear AI activity
- clear validation state
- meaningful loading states
- editable plan
- useful errors
- no fake functionality

---

## 17. P0 — Must Work

1. Prompt input
2. CSV upload
3. Local CSV profiling
4. AI schema/semantic understanding
5. Generation Plan
6. Hybrid generation router
7. Faker-based primitive generation
8. Deterministic IDs / mappings
9. Tabular generation
10. Basic relational generation
11. Edge-case configuration
12. Privacy actions for source mode
13. Validation engine
14. Live preview
15. CSV / JSON export
16. Final Tabular / Relational / Documents result buttons
17. Polished single workspace

---

## 18. P1 — Strong Additions

1. JSON input
2. Excel input
3. SQL/schema upload
4. Invoice generation
5. Bank statement generation
6. Original-vs-synthetic charts
7. Relationship graph
8. Fidelity metrics
9. AI Recommended edge cases
10. Auto-correction loop
11. Locale-aware generation
12. better PII detection

---

## 19. WOW Features — Only After P0 Stability

1. Natural-language control over uploaded data
2. Visual Generation Plan
3. AI confidence/warnings
4. Schema relationship graph
5. Data quality score
6. Original-vs-synthetic histogram/bar comparisons
7. Cross-output consistency between relational data and documents
8. AI explanation: “Why this edge case was added”
9. downloadable quality report
10. regenerate only selected field/table instead of whole dataset

---

## 20. Explicit Non-Goals for Hackathon

Do not spend core time on:

- authentication
- complex RBAC
- enterprise database connectors
- MCP infrastructure
- production-scale distributed architecture
- billing
- full MLOps
- large admin dashboard
- excessive pages
- unsupported privacy claims
- fake “AI” badges without working behavior

---

## 21. Definition of Done

The project is demo-ready only if:

1. A user can enter a prompt OR upload a CSV.
2. The system understands the requirement/data.
3. A Generation Plan is shown.
4. Synthetic data is actually generated.
5. Core integrity checks pass.
6. The user can inspect the result.
7. A quality/validation summary is visible.
8. Tabular / Relational / Documents options are visible at the end.
9. At least CSV/JSON export works.
10. The demo can be completed end-to-end without manual code edits.
