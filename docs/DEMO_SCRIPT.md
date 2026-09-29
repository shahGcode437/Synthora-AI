# DEMO_SCRIPT.md — 3–5 minute presentation

Target: **~4 minutes**. Speak naturally; the bold lines are the ones to land. Timings are guides.

**Before you start (2 min, off-stage):** backend and frontend running, page open at `http://127.0.0.1:5173`, header shows **API Online**, hospital chip ready. Have `backend/tests/fixtures/samples/customers.csv` on the desktop. Fallback plan is in `docs/BACKUP_DEMO.md`.

---

## 0:00 — Problem (~25 s)

> "Every team building software needs realistic data — but real data is sensitive, slow to get and full of privacy risk. The usual fix is random fake data, and that breaks the moment you have relationships: orphan foreign keys, balances that don't add up, no edge cases, and no way to know if it's any good. **Asking an LLM to write the rows doesn't scale either — it's slow, expensive and unreliable.**"

## 0:25 — Solution (~25 s)

> "Synthora AI splits the job three ways. **The AI understands the unknown** — it reads your description or your file and designs a plan. **Specialized generators create the values** — Faker and statistics, fast and reproducible. **And deterministic code guarantees correctness** — keys, relationships, arithmetic — and then proves it. You get data you can trust, and a report showing why."

## 0:50 — Live demo (~2 min 45 s)

**1. Prompt mode — (~90 s)**
- Click **Hospital appointments** → **Analyze with AI**. *While it runs (≈10 s):* "The AI is inferring the schema. It never writes rows."
- Plan appears. "It decided on **three tables** and two relationships by itself. Every field shows *how* it will be generated — Faker, categorical, derived — plus **PII classification**, business rules and **edge cases like cancelled appointments**."
- Expand a column row: "Full transparency — strategy, parameters, allowed values."
- Click **Generate Synthetic Data**. "About six thousand rows in a second or two."
- Scroll to **Validation**: "**Foreign-key integrity — no orphan appointments.** Primary keys unique. Checked by code, not by the AI."
- Flip the preview tabs. Point at PK/FK badges.
- Export: "CSV is disabled — it's a three-table dataset — so **ZIP**, one CSV per table."

**2. CSV mode — (~75 s)**
- Switch to **Analyze Sample CSV**, drop `customers.csv`, type: *"500 new Pakistani customers, preserve city and status ratios, add a few suspended accounts."* → **Analyze Sample**.
- "The file is **profiled locally**. The AI only sees a compact summary with **masked** samples — names show as shapes, never real values."
- Generate, then scroll to **Quality & Fidelity**: "Did we preserve the source? City shares — original in blue, synthetic in teal — nearly identical. Age statistics and date range match. **Suspended is flagged as new**, because you asked for it. Every number here is calculated from the real data — no made-up score."

## 3:45 — Architecture (~30 s)

> "Under the hood: a FastAPI backend, one strongly typed **Generation Plan** that everything depends on, and a **multi-model router** — Gemini first, Groq as automatic fallback. If a provider is rate-limited or returns something invalid, the router fails over, and we've demonstrated that live. The frontend is React; generation, validation and export need no LLM at all, so the core keeps working even if the AI is down."

## 4:15 — Closing (~20 s)

> "Synthora AI: **from schema to trustworthy synthetic data** — AI for understanding, code for correctness, and evidence for trust. Thank you — happy to take questions."

---

## Likely questions (short answers)

- **"Does the AI see my data?"** — No raw file. A local profile plus a few *masked* rows; PII is never sent or charted.
- **"How do you know relationships are valid?"** — Code generates parents first and samples real parent keys; a separate validator re-checks it.
- **"What if the AI is down?"** — Automatic failover to a second provider; and generation/validation/export are AI-free.
- **"What's not done?"** — Mask/hash actions are planned but the engine always synthesizes; CSV mode is single-table; no cross-column correlations yet. (See README *Known Limitations*.)

## If something goes wrong on stage

Say what happened, click **Retry** once; if it repeats, switch to the backup path (`docs/BACKUP_DEMO.md`) and *say clearly* that it uses a saved plan.
