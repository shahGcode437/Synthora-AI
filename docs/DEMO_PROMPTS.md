# DEMO_PROMPTS.md

Three prompts, all available as one-click chips in the **Generate from Prompt** tab (paste them exactly as written). Leave *Target rows* on **Auto** unless stated: the AI proposes sensible per-table counts, and any value you type always wins over the AI.

Numbers below are typical results from real runs; exact row counts and wording vary slightly per AI run, so talk about *what* to notice, not exact digits.

---

## A) E-commerce (fast, single table, very visual)

**Prompt**
```
Generate 200 Pakistani e-commerce customer records with names, emails, cities, signup dates and account status.
```

**What the judges should notice**
- **Locale realism:** Pakistani names and cities (Karachi, Lahore, Islamabad…) from a curated `en_PK` pool, not Western defaults.
- **Plan before data:** the plan shows *why* each field is generated the way it is: `name → Faker`, `email → Derived (from name)`, `city → Categorical (weighted)`, `signup_date → Faker date range`, `customer_id → Deterministic`.
- **PII is recognised:** name and email are flagged as direct identifiers with the *Synthesize* privacy action; city is a quasi-identifier.
- **Business rule + edge case:** "signup date must not be in the future" and a suspended-accounts edge case.
- **Validation:** unique IDs and emails, allowed statuses only, no future dates — all green.
- **Reproducibility:** rerun with the same seed → identical rows.

**Optional CSV follow-up (shows the second input mode):** upload `backend/tests/fixtures/samples/customers.csv` and use the instruction
```
Generate 500 new Pakistani customers, preserve city and status ratios, and add a few suspended accounts.
```
Notice the **source profile** (PII columns shown as *masked shapes*, never raw values), category ratios preserved exactly, `suspended` appearing as a **new** category in the Quality & Fidelity charts, and null rates preserved.

---

## B) Healthcare (the relational showpiece)

**Prompt**
```
Generate synthetic hospital appointment data with patients, doctors and appointments. Appointments must reference valid patients and doctors.
```

**What the judges should notice**
- **The AI split this into three tables** on its own: `patients`, `doctors`, `appointments`, with primary keys and two foreign keys.
- **Relationships are drawn as 1:N cards** and enforced by code: generation order is *patients → doctors → appointments* (parents first).
- **Integrity is proven, not claimed:** Validation shows Primary-key uniqueness, **Foreign-key integrity** (no orphan appointments) and Row count all green.
- **PII:** patient name, email, phone and date of birth are classified (direct / quasi-identifier) with *Synthesize*.
- **Edge cases that make sense for hospitals:** cancelled appointments, missing phone numbers.
- **Multi-table preview and export:** switch table tabs in the preview; the **CSV button is disabled** with an explanation and **ZIP is recommended** (one CSV per table + `data.json`).

---

## C) Banking (derived logic and edge cases)

**Prompt**
```
Generate banking transaction data with account IDs, merchants, debit/credit transactions, timestamps and running balances. Include a small number of failed transactions.
```

**What the judges should notice**
- **`running_balance` is Derived, not random:** the plan states the business rule ("balance updates by debit/credit; failed transactions don't change it"), and code computes it per account in timestamp order.
- **Validation re-checks the arithmetic:** the *Derived consistency* check recomputes every balance and passes — this is the "deterministic code guarantees correctness" idea made visible.
- **Two related tables:** `accounts → transactions`, with `account_id` as a valid foreign key.
- **Requested edge case honoured:** a `failed transactions` scenario appears in the plan and in the *Edge cases injected* card.
- **Sensitivity:** amounts and balances are classified as sensitive; merchant names are (correctly) not treated as personal data.
- **Statistical realism:** transaction amounts follow a right-skewed (lognormal) distribution.

---

### Tips for a smooth run
- Start each demo from a fresh page (or *New session*). Wait for the "AI analysis" step to complete (≈5–15 s); the timer shows it's working.
- If the AI is briefly busy the app shows a clear message with a **Retry** button — see `docs/BACKUP_DEMO.md`.
