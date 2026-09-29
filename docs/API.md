# API.md — Multi-Model AI API & Fallback Architecture

## Purpose

The platform must not depend on a single LLM provider.

If one provider:
- times out,
- hits a rate limit,
- rejects the request,
- returns invalid structured output,
- or becomes temporarily unavailable,

the backend should automatically try the next configured provider.

The user should see one stable product experience regardless of which model answered.

---

## 1. Core Principle

> **One AI interface inside our application, multiple providers behind it.**

The frontend must never call OpenAI, Gemini, xAI, Qwen, or any other provider directly.

All AI requests go through the backend:

```text
Frontend
   ↓
FastAPI
   ↓
AI Service / LLM Router
   ↓
Primary Model
   ↓ failure
Fallback Model 1
   ↓ failure
Fallback Model 2
   ↓ failure
Fallback Model 3
```

---

## 2. Provider Strategy

Target provider families:

- OpenAI
- Google Gemini
- xAI Grok
- Alibaba Qwen
- Optional additional provider later

### Important Naming

**Grok** = xAI model family.

**Groq** = a separate inference/API company.

Do not confuse them in code, environment variables, or documentation.

---

## 3. Hackathon Recommendation

Do not integrate four completely separate provider SDKs into the business logic.

Use a unified provider abstraction.

Preferred implementation for the hackathon:

### Option A — LiteLLM SDK

Use LiteLLM inside the FastAPI backend.

Advantages:

- one Python interface
- supports many providers
- normalized responses
- retries
- fallbacks
- timeouts
- easier provider switching

Our application should still wrap LiteLLM in our own `LLMRouter` service so that LiteLLM can be replaced later.

### Option B — Custom Provider Adapters

If LiteLLM causes compatibility issues, create:

```text
BaseLLMProvider
├── OpenAIProvider
├── GeminiProvider
├── GrokProvider
└── QwenProvider
```

Every adapter must expose the same internal method.

For a one-day hackathon, Option A is preferred unless a provider requires behavior LiteLLM cannot support.

---

## 4. Recommended Model Tiers

Do not use the most expensive model for every call.

Create logical tiers rather than hard-coding provider names throughout the app.

### `fast`

Used for:

- column classification
- simple PII interpretation
- minor schema cleanup
- short summaries
- simple edge-case suggestions

### `smart`

Used for:

- unknown schema understanding
- business-rule interpretation
- relationship inference
- Generation Plan creation
- semantic consistency reasoning

### `fallback`

Used when the preferred provider fails.

The application calls a **logical task/tier**, not a provider-specific model directly.

Example:

```text
analyze_schema(...)
→ router.complete(task="schema_analysis", tier="smart")
```

---

## 5. Initial Provider Order

Provider order must be configurable through environment/configuration rather than buried in code.

Example hackathon configuration:

```text
SMART_MODEL_ORDER:
1. Gemini
2. OpenAI
3. Qwen
4. Grok

FAST_MODEL_ORDER:
1. Gemini
2. Qwen
3. OpenAI
4. Grok
```

This is only an initial operational configuration, not a permanent ranking of model quality.

The team may change the order based on:

- available API credits
- response speed
- structured-output reliability
- rate limits
- API availability during the hackathon

---

## 6. Current Candidate Models

Keep model IDs in environment/config files because providers change model catalogs.

Possible current candidates:

### OpenAI
- cost-efficient/high-volume model for routine calls
- stronger reasoning model for complex Generation Plan calls

### Google Gemini
- Gemini 3.8 Flash is a strong current candidate for fast + capable structured analysis.

### xAI
- Grok current language models can be configured as a fallback provider.

### Qwen / Alibaba Model Studio
- Qwen 3.8 Flash / Plus / Max family can be configured depending on available API access and cost.

Do not couple application logic to these exact names.

Example:

```env
OPENAI_MODEL=gpt-6-luna
GEMINI_MODEL=gemini-3.8-flash
XAI_MODEL=grok-4.7
QWEN_MODEL=qwen3.8-flash
```

If an account does not have access to a particular model, change only configuration.

---

## 7. Required Environment Variables

Example:

```env
OPENAI_API_KEY=
GEMINI_API_KEY=
XAI_API_KEY=
DASHSCOPE_API_KEY=

OPENAI_MODEL=
GEMINI_MODEL=
XAI_MODEL=
QWEN_MODEL=

LLM_PRIMARY_PROVIDER=gemini
LLM_TIMEOUT_SECONDS=25
LLM_MAX_RETRIES_PER_PROVIDER=1
```

Rules:

- never commit `.env`
- provide `.env.example`
- never expose provider keys to the browser
- all calls must be server-side

---

## 8. Internal LLM Request Contract

Every AI task should use one shared internal request shape.

Example:

```json
{
  "task": "schema_analysis",
  "system_instruction": "...",
  "input": {},
  "response_schema": "GenerationPlan",
  "temperature": 0.1
}
```

The application should not send arbitrary prompts from random files directly to providers.

Each task should have a prompt template and expected response schema.

---

## 9. Structured Output Is Mandatory

For machine-critical AI operations, plain conversational text is not enough.

AI responses must become validated objects.

Core schemas:

- `SchemaAnalysis`
- `GenerationPlan`
- `PIIAnalysis`
- `RelationshipAnalysis`
- `EdgeCaseRecommendations`

Example:

```json
{
  "domain": "ecommerce",
  "entities": [
    {
      "name": "customers",
      "columns": []
    }
  ],
  "relationships": [],
  "pii_fields": [],
  "edge_cases": [],
  "warnings": []
}
```

Use Pydantic on the backend.

If the provider returns malformed output:

1. attempt parse/repair if safe,
2. retry the current provider once,
3. otherwise move to the next provider.

---

## 10. Fallback Policy

A fallback should happen for reasons such as:

- connection error
- timeout
- HTTP 429 / rate limit
- provider 5xx error
- unavailable model
- invalid/empty response
- invalid structured output after retry

Suggested flow:

```text
Request
   ↓
Gemini
   │
   ├─ success → validate → return
   │
   └─ failure
        ↓
OpenAI
   │
   ├─ success → validate → return
   │
   └─ failure
        ↓
Qwen
   │
   ├─ success → validate → return
   │
   └─ failure
        ↓
Grok
   │
   ├─ success → validate → return
   │
   └─ failure
        ↓
Graceful error / deterministic fallback
```

Do not keep retrying indefinitely.

---

## 11. What Counts as “Success”

An HTTP 200 response is not enough.

For structured tasks, success means:

- provider returned content
- JSON/schema parsed successfully
- required fields are present
- values pass basic validation
- the response is safe to execute

If schema validation fails, treat the call as unsuccessful.

---

## 12. Provider-Agnostic Generation Plan

All providers must produce the same internal structure.

Therefore:

```text
Gemini response ─┐
OpenAI response ─┼→ GenerationPlan (Pydantic)
Qwen response ───┤
Grok response ───┘
```

Everything after the AI layer must depend on `GenerationPlan`, not on provider-specific output.

This is the key to clean fallback behavior.

---

## 13. AI Tasks in This Project

### Task A — Prompt Interpretation

Input:
- natural-language dataset request
- user controls

Output:
- domain
- proposed schema
- relationships
- constraints
- generator strategy
- edge cases
- privacy considerations

### Task B — Sample Dataset Interpretation

Input:
- compact local profile
- representative records
- optional user instruction

Output:
- semantic types
- PII
- relationships
- business rules
- generator assignments
- warnings

### Task C — PII Analysis

AI handles ambiguous semantics.

Deterministic checks may provide hints.

### Task D — Edge-Case Recommendations

AI suggests domain-aware testing cases.

Actual injection is performed by code where possible.

### Task E — Semantic Content Generation

AI may generate:

- notes
- descriptions
- realistic free text
- domain-specific text

High-volume primitive fields should not normally be generated row-by-row by the LLM.

---

## 14. File Token Strategy

The AI router must not receive a complete large CSV by default.

Pipeline:

```text
Upload
   ↓
Parser
   ↓
Profiler
   ↓
Representative Sampler
   ↓
Compact Context
   ↓
LLM Router
```

Compact context can include:

- rows/columns
- names
- dtypes
- null percentages
- uniqueness
- min/max/mean/median/quantiles
- category frequencies
- date ranges
- candidate keys
- value overlap
- selected correlations
- representative rows
- rare/null/outlier examples

This reduces:

- token usage
- API cost
- latency
- unnecessary exposure of source data

---

## 15. Privacy & Provider Calls

Uploaded source data may contain PII.

Therefore:

- perform local profiling first
- send the minimum information necessary
- avoid sending the entire source dataset
- minimize raw PII included in sample rows
- redact/mask obvious sensitive values before semantic analysis when practical

The AI should usually analyze **structure and semantics**, not ingest all production records.

---

## 16. Generation Router vs LLM Router

These are different systems.

### LLM Router

Chooses which AI provider/model handles an AI request.

```text
Gemini → OpenAI → Qwen → Grok
```

### Generation Router

Chooses how a field should actually be generated.

```text
name          → Faker
balance       → Statistical Engine
customer_id   → Deterministic Generator
notes         → AI
email         → Derived/Context-aware Generator
```

Do not mix these responsibilities.

---

## 17. Reliability Rules

### Timeout
Use a short provider timeout appropriate for hackathon UX.

### Retry
At most a small number of retries per provider.

### Fallback
Move to another provider after retryable failure.

### Validation
Validate every critical structured response.

### Logging
Record:

- task name
- provider used
- model
- latency
- success/failure
- fallback count

Never log API keys.

Avoid logging raw sensitive datasets.

---

## 18. Optional UI Indicator

The normal user does not need to choose a provider.

The UI may show:

```text
AI Engine: Ready
```

For debugging/demo settings, an optional developer panel can show:

```text
Provider used: Gemini
Fallbacks: 0
Latency: 1.8s
```

Do not clutter the primary product UI with model-provider controls.

---

## 19. Failure Without Any AI Provider

If every AI provider fails:

### Prompt Mode
Show a clear error because schema understanding may require AI.

### Sample Mode
If local profiling can continue:

- show deterministic profile
- preserve uploaded schema facts
- allow limited rule-based generation where safe
- clearly label AI analysis as unavailable

Never invent AI-generated analysis when no model answered.

---

## 20. Implementation Structure

Suggested backend:

```text
backend/
└── app/
    ├── ai/
    │   ├── router.py
    │   ├── prompts.py
    │   ├── schemas.py
    │   └── tasks/
    │       ├── schema_analysis.py
    │       ├── pii_analysis.py
    │       ├── relationships.py
    │       └── edge_cases.py
    │
    ├── generation/
    │   ├── router.py
    │   ├── faker_engine.py
    │   ├── statistical_engine.py
    │   └── ai_content_engine.py
    │
    └── ...
```

---

## 21. Hackathon Scope Rule

Multiple-provider resilience is valuable, but it must not consume the entire hackathon.

Recommended implementation order:

1. one provider working end-to-end,
2. shared structured-output contract,
3. add second provider,
4. test automatic fallback,
5. add third/fourth only after the core pipeline remains stable.

**Two working providers with real failover are better than four broken integrations.**

The architecture should support all providers even if not all are activated during the final demo.

---

## 22. Final Architecture

```text
USER INPUT
    ↓
LOCAL PARSER / PROFILER
    ↓
AI TASK
    ↓
LLM ROUTER
 ┌──────┬────────┬──────┬──────┐
Gemini OpenAI   Qwen   Grok
 └──────┴────┬───┴──────┴──────┘
             ↓
      Validated AI Schema
             ↓
       Generation Plan
             ↓
      GENERATION ROUTER
 ┌────────┬───────────┬────────┐
 Faker   Statistics   AI Text
 └────────┴─────┬─────┴────────┘
                ↓
       Mapping / Relations
                ↓
         Privacy Engine
                ↓
        Edge-Case Engine
                ↓
        Validation Engine
                ↓
        Quality + Outputs
```

## Final Rule

> **Provider failover protects availability. Structured schemas protect consistency. Deterministic validation protects correctness.**
