# IDEA.md — Synthetic Data Studio

## Product Idea

Build a **schema-aware AI synthetic data platform** that can generate realistic, privacy-safe, logically consistent synthetic data from either:

1. a natural-language prompt, or
2. an uploaded sample dataset / schema.

The platform should not behave like a random fake-data generator. It should first **understand the data**, create a generation plan, then use the right combination of AI, Faker, statistical generation, mapping, privacy transformations, edge-case injection, and deterministic validation.

## Core Problem

Real production data is often:

- private or sensitive,
- hard to share,
- incomplete or skewed,
- missing useful edge cases,
- slow to obtain for development and testing.

Developers therefore need realistic synthetic data that behaves like real data without exposing real people or production records.

## Core Promise

> **From schema to trustworthy synthetic data.**

Alternative demo line:

> **Understand it. Generate it. Protect it. Validate it.**

## Two Input Paths

### 1. Generate from Prompt

The user describes the dataset they want.

Example:

> Generate 5,000 Pakistani e-commerce customers with realistic orders, order items, payment behavior, and some failed-payment edge cases.

AI interprets the requirement and creates the schema and generation plan.

### 2. Generate from Existing Data / Schema

The user uploads:

- CSV
- JSON
- Excel if feasible
- SQL/schema definition if feasible

The file is parsed locally first. The AI does **not** receive the entire raw file when it is large. Instead it receives a compact profile, representative samples, detected patterns, candidate keys, distributions, null rates, and other useful facts.

The user may also add an optional instruction such as:

> Preserve category ratios but create more failed-payment examples and use Pakistani identities.

## Core Intelligence Model

> **AI understands the unknown. Specialized generators create the data. Deterministic code guarantees correctness.**

### AI should handle

- domain understanding
- schema semantics
- ambiguous column meaning
- PII interpretation
- business-rule understanding
- relationship inference
- edge-case reasoning
- generation-plan creation
- semantic/free-text generation
- deciding which generator is suitable for each field

### Faker should handle

Only fields where it is appropriate and only after AI has defined what the field means.

Examples:

- person names
- addresses
- companies
- phone numbers
- dates
- cities
- UUIDs
- simple primitive values

Faker must never independently control relationships, PK/FK logic, business constraints, financial reconciliation, or statistical fidelity.

### Statistical generation should handle

- numeric distributions
- categorical proportions
- date patterns
- source null rates
- selected correlations where feasible

### Deterministic code should guarantee

- primary-key uniqueness
- valid foreign keys
- 1:1, 1:N, N:N consistency
- mappings
- order / invoice reconciliation
- running balances
- schema constraints
- validation checks

## Generation Plan

Before actual generation, the system produces an editable **Generation Plan**.

Example:

- Domain: E-commerce
- Tables: Customers, Orders, OrderItems
- Relationships: Customers 1:N Orders, Orders 1:N OrderItems
- PII: name, email, phone
- Name → Faker
- Email → derived/context-aware
- Balance → statistical generator
- Notes → AI
- IDs → deterministic generator
- Edge cases → failed payments, large orders, optional missing phones

The user can confirm or correct the plan before generation.

## Privacy Model

For uploaded/sample data, the system detects PII and sensitive fields using:

- deterministic pattern checks where useful
- AI semantic interpretation for unknown or ambiguous fields

Possible actions:

- Synthesize / Replace
- Mask
- Hash
- Keep

Synthetic replacement should generally be preferred when realistic testing values are useful.

## Edge Cases

Edge cases are useful test scenarios such as:

- missing values
- rare categories
- unusual but plausible values
- failed payments
- cancelled transactions
- high-value orders
- boundary dates

User control:

- None
- AI Recommended
- Low
- Medium
- High
- Custom

AI proposes domain-aware cases; deterministic generation applies the chosen settings.

## Output Philosophy

The user does **not** choose only one output mode at the beginning.

After data generation and validation, the UI shows:

- **Tabular**
- **Relational**
- **Documents**

These are data/output views, not initial input constraints.

Possible exports:

- Tabular → CSV / JSON
- Relational → related CSV/JSON tables, SQL dump, ZIP if feasible
- Documents → PDF-style invoices, bank statements, supporting JSON/CSV

Where a document is not meaningful for the current dataset, the system should explain that instead of generating nonsense.

## Quality Layer

Every generation should end with a quality report showing, where applicable:

- schema compliance
- PK uniqueness
- FK integrity
- PII protection
- target vs actual null rate
- edge cases injected
- statistical similarity
- original-vs-synthetic charts
- validation status

## Differentiators / Plus Points

1. **AI-generated Generation Plan** before data creation.
2. **Hybrid AI + Faker + statistics + deterministic validation** instead of LLM-only generation.
3. **Large-file token optimization** through local profiling and representative sampling.
4. **PII detection + privacy actions** for source data.
5. **Original vs Synthetic visual comparison** using histograms / bar charts.
6. **Schema / relationship graph** for relational data.
7. **AI Recommended edge cases** instead of random outliers.
8. **Validation + auto-correction loop** for deterministic issues.
9. **Cross-output consistency**: documents reuse the same synthetic customers/orders/accounts.
10. **One polished no-code workspace** instead of disconnected pages.

## Product Principle

The platform should feel intelligent, but never careless.

AI is allowed to reason about unfamiliar input, but critical integrity is verified through code.

The product should not merely produce data that *looks* realistic. It should produce data that is **useful, explainable, privacy-aware, and internally consistent**.
