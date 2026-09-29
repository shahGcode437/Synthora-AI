# DESIGN.md — Product, UI and System Design

## 1. Design Goal

Create one polished, modern, no-code workspace for understanding, generating, validating, visualizing, and exporting synthetic data.

The UI should look like a real developer/data product, not a hackathon form collection.

---

## 2. Information Architecture

Primary workspace sections:

- Create / Input
- AI Analysis
- Generation Plan
- Data Preview
- Relations
- Quality
- Outputs

These can exist as tabs/steps inside one workspace rather than separate websites/pages.

---

## 3. Main Layout

Suggested desktop structure:

```text
┌───────────────────────────────────────────────────────────────┐
│ Brand / Project                     AI Engine ● Ready         │
├───────────────┬───────────────────────────────┬───────────────┤
│               │                               │               │
│ Workflow      │          DATA CANVAS          │ CONFIG        │
│               │                               │               │
│ Create        │ Prompt / schema / table /     │ Target rows   │
│ AI Analysis   │ graph / charts / document     │ Locale        │
│ Plan          │                               │ Edge cases    │
│ Relations     │                               │ Privacy       │
│ Quality       │                               │ Advanced      │
│               │                               │               │
├───────────────┴───────────────────────────────┴───────────────┤
│ Status / Validation / Generate / Export                       │
└───────────────────────────────────────────────────────────────┘
```

---

## 4. Entry Experience

Provide two primary cards:

### Generate from Prompt

- multiline prompt
- target size
- locale
- edge cases
- privacy
- advanced settings

### Generate from Sample Data

- drag/drop file
- file summary
- target size
- edge cases
- privacy
- optional instruction prompt

Do not ask for Tabular / Relational / Documents here.

---

## 5. Input Controls

### Target size
- numeric input
- Auto / None where appropriate

### Locale
- Auto
- None / Global
- Pakistan
- other common options

### Edge cases
- None
- AI Recommended
- Low
- Medium
- High
- Custom

If Custom:
- null %
- outlier %
- rare-category %
- free-text special condition

### Privacy
- Auto / Safe Default
- None
- Custom

Custom source-data privacy actions:
- Synthesize
- Mask
- Hash
- Keep

### Advanced
Collapsed by default.

Includes:
- seed
- date range
- currency
- null behavior
- outlier behavior
- business constraints
- distribution overrides

---

## 6. AI Analysis Screen

After prompt/file submission show:

### Analysis summary
- inferred domain
- row/column summary
- table/entity count
- PII count
- candidate relationships
- detected distributions
- warnings

### Column cards/table

For each field:
- name
- primitive type
- semantic type
- PII status
- generator choice
- confidence

Example:

```text
email
Type: string
Meaning: email
PII: yes
Generator: derived synthetic email
Confidence: high
```

---

## 7. Generation Plan Screen

This is a key differentiator.

Show:

- domain
- entities/tables
- relationships
- field strategies
- PII actions
- edge cases
- target records
- business constraints
- warnings
- confidence

Actions:

- Edit Plan
- Generate

Use expandable sections rather than overwhelming the user.

---

## 8. Data Preview

Provide:

- paginated table
- search/filter if easy
- row count
- schema badges
- generated/validated status

For large data, preview only a subset.

Do not render thousands of rows directly in the browser.

---

## 9. Relationship View

For relational datasets show a simple graph:

```text
Customers
  │ 1:N
  ▼
Orders
  │ 1:N
  ▼
OrderItems
```

Table cards can display:

- PK
- FK
- row count
- entity name

Clicking a relation can show:

- source key
- target key
- cardinality
- validation status

---

## 10. Privacy View

Show detected PII:

```text
name        PII        Synthesize
email       PII        Synthesize
phone       PII        Mask
account_id  Sensitive  Replace
```

Make actions editable before final generation where practical.

Use clear labels; do not make unsupported compliance claims.

---

## 11. Edge-Case View

Show AI recommendations:

```text
Recommended for this e-commerce dataset

✓ failed payments
✓ high-value orders
✓ missing optional phone
✓ cancelled orders
```

Allow:
- accept all
- deselect
- custom intensity

Optional explanation:

> Added because payment systems should be tested beyond the normal successful-payment path.

---

## 12. Generation Progress

Show meaningful stages:

1. Understanding schema
2. Building generation plan
3. Generating synthetic records
4. Preserving relationships
5. Applying privacy rules
6. Injecting edge cases
7. Validating output

Do not show fake percentages unless based on real progress.

---

## 13. Quality Report

Cards:

- Schema compliance
- PK uniqueness
- FK integrity
- PII protection
- Target null rate
- Actual null rate
- Edge cases inserted
- Overall validation result

For source data:

### Histogram
Original vs Synthetic numeric distribution.

### Bar chart
Original vs Synthetic categorical share.

Optional:
- correlation comparison
- time trend
- quality/fidelity score

If a single overall score is shown, explain what contributes to it.

---

## 14. Final Output Area

After successful generation:

```text
Your synthetic dataset is ready

[ Tabular ]   [ Relational ]   [ Documents ]
```

### Tabular
- preview
- CSV
- JSON

### Relational
- entity list
- relationship graph
- multi-table export
- SQL/ZIP if implemented

### Documents
- invoice
- bank statement
- PDF preview/export

If a document type does not make sense for the current domain, show it as unavailable with a short reason.

---

## 15. Visual Style

Recommended direction:

- modern SaaS / developer-tool aesthetic
- clean typography
- restrained accent color
- strong spacing
- subtle gradients only if tasteful
- rounded but not overly playful
- clear status badges
- readable tables
- visually distinct AI / validation states
- dark mode optional, not required

Avoid:
- excessive glassmorphism
- too many neon colors
- giant hero sections
- marketing pages before the working tool
- animation that slows the demo

---

## 16. System Design

Suggested logical services:

```text
Frontend
   ↓
API Layer
   ↓
Input Parser / Profiler
   ↓
AI Intelligence Layer
   ↓
Generation Plan
   ↓
Execution Router
 ┌──────────┬────────────┬─────────────┐
 Faker      Statistics   AI Generator
 └──────────┴──────┬─────┴─────────────┘
                   ↓
       Relationship / Mapping Engine
                   ↓
              Privacy Engine
                   ↓
             Edge-Case Engine
                   ↓
             Validation Engine
                   ↓
       Quality / Visualization Layer
                   ↓
               Export Layer
```

---

## 17. Suggested Technical Stack

A pragmatic hackathon stack:

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui if familiar
- Recharts or Chart.js

### Backend
- FastAPI
- Pydantic
- pandas or Polars
- Faker
- NumPy
- SciPy / scikit-learn only if actually needed

### AI
- one reliable LLM provider
- structured JSON output
- strict schema validation
- concise prompts using compact profiles

### Documents
- HTML/CSS → PDF or ReportLab if simpler
- use generated relational data as source

---

## 18. AI Contract Design

AI should return structured data similar to:

```json
{
  "domain": "ecommerce",
  "entities": [],
  "relationships": [],
  "pii_fields": [],
  "edge_case_recommendations": [],
  "business_rules": [],
  "warnings": []
}
```

Every AI response must be validated before execution.

Do not let arbitrary LLM text directly control backend code.

---

## 19. Performance Principles

- profile files locally
- sample intelligently
- stream or paginate previews
- batch AI generation
- use Faker/statistical code for high-volume rows
- use AI for semantics, not every primitive
- cache the approved Generation Plan during a session
- avoid repeatedly re-sending the same context

---

## 20. Demo Design Principle

The best demo should show one coherent story:

**Input → AI understands → user sees plan → data generates → integrity survives → quality is proven → outputs are available.**

Everything in the UI should reinforce that story.
