# PLANNING.md — Hackathon Execution Plan

## Goal

Ship a stable, polished, end-to-end synthetic data platform within a one-day hackathon.

Team:

- **Adnan Shah**
- **Hussain**
- **Huzifa**

The project should be integrated early and often. Avoid three isolated mini-projects.

---

## 1. Development Strategy

We will build one vertical slice first:

**Input → AI Analysis → Generation Plan → Generate → Validate → Preview → Export**

Only after this works do we expand relational/documents/visualization.

---

## 2. Recommended Ownership

### Adnan Shah — Product / Frontend / Integration

Own:

- overall UX
- workspace
- prompt/upload flow
- Generation Plan UI
- preview tables
- quality UI
- output/export buttons
- integration with backend
- demo flow
- final product polish

### Hussain — Data Generation / Profiling / Validation

Own:

- CSV parser/profiler
- statistical summaries
- Faker execution
- deterministic ID generation
- null/outlier injection
- validation engine
- CSV/JSON export
- mapping utilities

### Huzifa — AI / Relationships / Documents

Own:

- LLM integration
- schema interpreter
- semantic-type inference
- PII interpretation
- relationship inference
- generation-plan schema
- AI edge-case recommendations
- relational generation support
- document generation if time permits

Ownership is practical, not rigid. Integration points must be agreed before coding.

---

## 3. Shared Contracts Before Parallel Work

Freeze these objects early.

### AnalysisRequest

- input_mode
- prompt
- file_profile
- user_preferences

### GenerationPlan

- domain
- entities
- columns
- semantic_types
- generators
- relationships
- pii_fields
- privacy_actions
- edge_cases
- distributions
- constraints
- warnings
- confidence

### GenerationRequest

- approved_plan
- target_rows
- seed
- locale
- edge_case_config
- privacy_config

### GenerationResult

- tabular_data
- relational_tables
- document_sources
- validation_report
- quality_metrics
- export_handles

This prevents frontend/backend drift.

---

## 4. Suggested Build Order

### Phase 0 — Setup

- create Git repository
- agree stack
- create branches
- create env files
- create shared API/schema models
- create starter UI shell

### Phase 1 — P0 Vertical Slice

- Prompt input
- CSV upload
- CSV profiling
- AI analysis
- Generation Plan JSON
- Plan UI
- generate one table
- validate one table
- preview
- CSV/JSON download

At the end of this phase, we already have a demo.

### Phase 2 — Stronger Generation

- context-aware Faker
- statistical distributions
- edge-case controls
- privacy actions
- better semantic mapping

### Phase 3 — Relational

- multiple entities
- deterministic PK/FK
- mapping
- parent-first generation
- relationship preview
- referential validation

### Phase 4 — Documents

Implement one strong document first:

- invoice OR bank statement

Then add the second only if time remains.

Documents must reuse generated relational data where possible.

### Phase 5 — Quality / Visuals

- validation cards
- original-vs-synthetic histogram
- categorical distribution comparison
- fidelity summary

### Phase 6 — Polish

- loading states
- errors
- animations
- empty states
- responsive layout
- final demo dataset
- export verification

---

## 5. Git Workflow

Suggested branches:

- `main`
- `feature/frontend`
- `feature/generation-engine`
- `feature/ai-relational`

Rules:

1. Never leave integration until the end.
2. Merge small working increments.
3. Pull before pushing.
4. Keep `.env` out of Git.
5. Commit working checkpoints.
6. If a feature threatens P0 stability, disable it rather than breaking main.

Suggested commit style:

- `feat: add csv profiling`
- `feat: add generation plan endpoint`
- `feat: add relational key mapping`
- `feat: add quality comparison charts`
- `fix: preserve foreign key integrity`

---

## 6. Risk Management

### Risk: LLM response is inconsistent

Mitigation:

- require structured JSON output
- validate against Pydantic/Zod schema
- retry/correct invalid JSON
- keep deterministic fallbacks

### Risk: CSV is huge

Mitigation:

- local profiling
- sample representative rows
- never send full large CSV to LLM

### Risk: Faker output feels random

Mitigation:

- AI-defined semantic plan
- context-aware persona generation
- derived related values
- statistical engine for distributions

### Risk: relationships break

Mitigation:

- deterministic mapping
- parent-first generation
- FK validation

### Risk: too many features

Mitigation:

- P0 first
- one excellent invoice before several weak document types
- disable unfinished UI

### Risk: demo depends on internet/API

Mitigation:

- cache one demo Generation Plan / dataset as fallback
- keep non-AI deterministic generation working
- prepare one tested demo input

---

## 7. Demo Scenario

Recommended demo:

### Input

Upload a small e-commerce sample CSV or provide:

> Generate Pakistani e-commerce customers with orders and payment behavior.

### Show

1. AI understands domain
2. schema + PII detection
3. Generation Plan
4. edge-case recommendation
5. generate
6. preview rows
7. relationship view
8. validation passes
9. original-vs-synthetic chart if source file used
10. click Tabular / Relational / Documents
11. export

This demonstrates the full product in a few minutes.

---

## 8. Pitch Structure

### Problem
Real data is sensitive, scarce, messy, and slow to access.

### Insight
Random fake data is not enough; test data must preserve meaning, relationships, and useful edge cases.

### Solution
AI understands the schema and intent, specialized generators create realistic values, deterministic code protects integrity, and validation proves quality.

### Demo
Show the complete workflow.

### Differentiation
- AI Generation Plan
- privacy-aware
- relational integrity
- edge-case intelligence
- quality report
- one workspace
- three output views

---

## 9. Stop Conditions

Stop adding features when:

- core flow is unstable
- exports are broken
- validation fails
- UI is unfinished
- demo path is not rehearsed

A stable smaller product beats a larger broken one.
