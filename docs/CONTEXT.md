# CONTEXT.md — Project Context for Coding Agents

## Read This First

This file gives the permanent context for any coding agent working on this hackathon project.

Do not redesign the product from scratch. Follow the frozen requirements and existing architecture.

---

## Project

A one-day hackathon project for a **Synthetic Data Platform**.

Team:

- Adnan Shah
- Hussain
- Huzifa

The platform generates realistic, privacy-safe synthetic data from:

1. natural-language prompts
2. uploaded sample data / schemas

The system supports three final output views:

- Tabular
- Relational
- Documents

The user does **not** choose only one of these at the beginning.

---

## Product Philosophy

> AI understands the unknown. Specialized generators create the data. Deterministic code guarantees correctness.

Avoid two bad extremes:

### Do not make it LLM-only
An LLM should not be responsible for thousands of rows, PK/FK guarantees, arithmetic, or every primitive value.

### Do not make it rule-only
Unknown column names, domains, business meanings, and semantic relationships need AI interpretation.

The product is intentionally hybrid.

---

## Main Workflow

### Prompt Path

Prompt
→ AI interpretation
→ Generation Plan
→ user confirmation
→ generation router
→ relational/privacy/edge-case processing
→ validation
→ quality
→ Tabular / Relational / Documents

### Sample Data Path

Upload
→ local parsing/profiling
→ compact profile + representative samples
→ AI interpretation
→ Generation Plan
→ user confirmation
→ generation
→ privacy/mapping/edge cases
→ validation
→ quality
→ Tabular / Relational / Documents

---

## Important Decisions Already Made

### Output selection
Do not ask the user to choose only Tabular, Relational, or Documents at the start. Show all meaningful output buttons at the end.

### Mandatory fields
Keep the main form minimal and allow `Auto`, `None`, or `AI Recommended` where appropriate.

### Large files
Never automatically send the full large file to the LLM.

### Faker
Faker is an execution tool, not the schema brain.

### AI
AI is central to semantic understanding, unknown inputs, PII interpretation, relationships, business rules, and edge-case reasoning.

### Integrity
AI may infer relationships. Deterministic code must enforce them.

### Mapping
Mapping dictionaries/tables are maintained by code.

### Privacy
Privacy actions matter primarily for uploaded/source data. Prompt-generated fake data does not need pointless hashing of nonexistent real values.

### Edge cases
AI recommends meaningful domain-aware cases. User controls intensity.

### Nulls
Do not treat null handling as simple data cleaning. Nulls can be useful testing conditions.

### Documents
Invoices/bank statements should reuse the same synthetic world when possible.

### Quality
Generated data must be validated and the quality should be visible.

---

## Vocabulary

Use these terms consistently:

- **Generate from Prompt**
- **Generate from Sample Data**
- **Generation Plan**
- **AI Intelligence Layer**
- **Execution Router**
- **Relationship / Mapping Engine**
- **Privacy Engine**
- **Edge-Case Engine**
- **Validation Engine**
- **Quality Report**
- **Tabular**
- **Relational**
- **Documents**

Avoid describing the product as merely a “CSV editor.”

---

## Functional Priorities

### P0
- Prompt input
- CSV input
- local profiler
- AI interpretation
- Generation Plan
- hybrid generation
- tabular data
- basic relational consistency
- edge-case controls
- privacy controls
- validation
- preview
- exports
- polished workspace

### P1
- documents
- charts
- relationship graph
- fidelity metrics
- better formats
- auto-correction

### Later / only if time
- additional integrations
- advanced enterprise features
- large admin/auth systems

---

## Behavior Rules for the Coding Agent

1. Do not invent unrelated features.
2. Do not remove AI from critical semantic points.
3. Do not send large raw files directly to an LLM.
4. Do not use Faker for relational integrity.
5. Do not trust AI output without schema validation.
6. Prefer structured JSON between AI and backend.
7. Keep interfaces modular.
8. Keep demo-critical paths working after every major change.
9. Never fake a completed feature in the UI.
10. If a feature cannot be implemented safely in time, degrade gracefully.

---

## Expected User Experience

The system should feel like a premium data studio:

- clear upload/prompt area
- visible AI analysis
- editable Generation Plan
- fast generated preview
- relationship visibility
- quality/validation feedback
- final output options
- clear export actions

The user should understand **why** the system generated the data the way it did.
