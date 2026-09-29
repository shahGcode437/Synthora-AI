"""Prompt templates per AI task. Providers never receive ad-hoc prompts."""
from __future__ import annotations

from app.ai.base import LLMRequest
from app.models.api import AnalyzeRequest
from app.models.plan import GenerationPlan
from app.models.profile import DatasetProfile

SCHEMA_ANALYSIS_SYSTEM = """You are the schema-understanding engine of a synthetic data platform. Architecture principle:
AI understands the unknown; Faker/specialized generators create realistic primitives; deterministic
code guarantees correctness. You produce the Generation Plan only - you never produce data rows.

Turn the user's natural-language dataset request into ONE JSON object (no prose, no markdown).
The "input" you receive holds the prompt plus user controls. Treat controls that are non-null as
fixed user decisions: use locale as the plan locale, target_rows as the row count, and respect
edge_case_mode / privacy_mode. If a control is null ("auto"), choose sensibly and record it in
"assumptions".

Plan content:
- domain: short label (e.g. "ecommerce", "healthcare", "banking").
- tables: only what the request needs, plus obvious supporting keys. Use snake_case names.
  Multiple entities named in the request (e.g. patients, doctors, appointments) are SEPARATE tables.
  Every table has a primary key column (is_primary_key=true, primary_key list filled).
- For any table that references another, add a column plus foreign_keys entry AND a matching
  relationships entry (parent_table/parent_column/child_table/child_column, cardinality "1:1"|"1:N"|"N:N").
  Use only table/column names that exist in the plan. Give sensible target_rows per table
  (children usually larger than parents) unless the user fixed target_rows.
- columns: name, data_type (string|integer|float|decimal|boolean|date|datetime|time|uuid|json),
  semantic_type (a short snake_case label of what THIS column means in THIS table; describe
  the column itself, never reuse a label from a different concept, e.g. a transaction's status is
  transaction_status and its time is transaction_timestamp), description, nullable, allowed_values (for enumerations, incl.
  the requested status values), confidence 0-1.
- generator {strategy, generator, params, depends_on} with strategy exactly one of:
  * "faker": realistic primitives. generator = a Faker provider name (name, city, phone_number,
    date_between, company, address...). Set params such as {"start_date":"-2y","end_date":"today"}.
  * "statistical": numeric/date distributions (generator e.g. "lognormal","normal","uniform",
    "poisson"; params with plausible parameters).
  * "categorical": weighted choice over allowed_values; params {"weights":{...}} when useful.
  * "deterministic_id": primary keys/sequences/uuids (uniqueness is enforced by code).
  * "foreign_key": values sampled from the parent key by code. params {"table","column"}.
  * "derived": computed from other columns of the same row/table (depends_on lists them),
    e.g. email from name, totals, and running balances.
  * "ai_text": only for genuinely free-text semantic content (notes, descriptions).
  Never use faker or ai_text for keys, relationships or arithmetic. Running balances, totals and
  similar calculations are "derived" with depends_on, AND must be stated in business_rules.
  For cumulative/ordered calculations (running balance) depends_on must include the ordering column
  (e.g. the timestamp), the grouping column (e.g. the account id) and every input column, and the
  rule expression must say the order and grouping ("ordered by timestamp within account_id").
  State the opening value source (e.g. an initial/opening balance on the parent table).
- pii per column: classification none|direct_identifier|quasi_identifier|sensitive and
  privacy_action none|synthesize|mask|hash|keep, with a short reason. Names, emails, phones,
  national IDs, addresses are direct identifiers; city/DOB/postal are quasi; health and financial
  details are sensitive. For prompt-generated data the values are fake, so use "synthesize" for
  PII fields and "none" otherwise.
- business_rules: concrete, checkable constraints (id, description, tables, optional expression,
  severity), e.g. "appointment.patient_id must exist in patients", "balance_after = balance_before
  +/- amount by direction", "signup_date not in the future", "failed transactions do not change balance".
- edge_cases.recommendations: plausible, domain-aware test cases with kind
  (null_injection|outlier|rare_category|boundary_value|status_scenario|custom), table, column,
  a small realistic rate 0-1, and rationale. Never propose impossible/invalid data. If the user
  requests specific edge cases in the prompt (e.g. "a small number of failed transactions"),
  include them first. Return an empty list when edge_case_mode is "none".
- locale: the given locale, else a sensible one implied by the request (e.g. en_PK for Pakistan, en_US default).
- confidence (0-1) for the whole plan, and per column where unsure. Put ambiguity in "assumptions",
  and risks/unsupported parts in "warnings". Do not invent requirements beyond the request.

Output keys at top level: plan_version, source_mode, domain, summary, locale, tables, relationships,
business_rules, edge_cases, privacy, confidence, warnings, assumptions.
"""


def build_schema_analysis_request(req: AnalyzeRequest) -> LLMRequest:
    return LLMRequest(
        task="schema_analysis",
        system_instruction=SCHEMA_ANALYSIS_SYSTEM,
        input={
            "mode": req.mode,
            "prompt": req.prompt,
            "target_rows": req.target_rows,
            "locale": req.locale,
            "edge_case_mode": req.edge_case_mode,
            "privacy_mode": req.privacy_mode,
        },
        response_schema_name="GenerationPlan",
        response_json_schema=GenerationPlan.model_json_schema(),
        tier="smart",
        temperature=0.1,
    )


SAMPLE_ANALYSIS_ADDENDUM = """

SAMPLE-DATA MODE (overrides the prompt-mode instructions above where they conflict)
The "input" now describes an UPLOADED CSV that was profiled locally by code:
- table_name: the ONLY table name to use.
- profile: deterministic facts computed by code (dtypes, null %, uniqueness, numeric stats, category
  frequencies, date ranges, identifier signals, local PII hints). These facts are authoritative;
  never recompute or contradict them.
- sample_rows: a small representative sample. Values of PII/identifier columns are shape masks
  (A=uppercase, a=lowercase, 9=digit), not real data.
- instruction: the user's optional request (e.g. more rows, extra categories, locale, edge cases).
- controls: fixed user decisions (target_rows, locale, seed, edge_case_mode, privacy_mode).

Produce a plan with EXACTLY ONE table named table_name containing EXACTLY the source columns
(same names, same order). Do not add, drop or rename columns; do not create relationships or foreign keys.
Your job is MEANING; code fills in numeric/categorical/date parameters from the profile afterwards, so
you need not copy statistics into params. Provide:
- domain, summary, and per column: semantic_type, description, pii (classification + privacy_action + reason).
  Use the local pii_hint as evidence but decide semantically (names, emails, phones, addresses, national
  IDs are direct identifiers; city/age/date of birth are quasi identifiers; amounts/balances/health data
  are sensitive when they describe a person).
- generator strategy per column: "deterministic_id" for unique identifiers, "faker" (with a Faker provider
  name in generator) for PII text such as names/phones/addresses, "categorical" for low-cardinality
  labels, "statistical" for numeric measures, "faker" date_between/date_time_between for dates,
  "derived" only for values truly computable from other columns of the same row (e.g. email from a
  name column, list the name column in depends_on). Repeated id-like columns (e.g. account_id) are
  identifiers that repeat; mark them "categorical".
- business_rules that the data evidently follows (e.g. amounts are positive, status values, date order),
  as concrete checkable statements.
- edge_cases.recommendations reflecting the instruction and the domain (e.g. if the user asks for failed
  payments, add a status_scenario on the status column whose name/description contains the exact value,
  such as "failed", and include that value in the column's allowed_values even if the source lacks it).
- Honour the instruction (locale, new categories, extra cases). If a control is set, use it.
- target_rows: use controls.target_rows if set, otherwise the source row count.
- warnings/assumptions for anything uncertain.
"""


def _ai_profile(profile: DatasetProfile) -> dict:
    """Compact, privacy-aware profile for the LLM (no internal fields, capped lists)."""
    data = profile.model_dump(exclude_none=True)
    for col in data["columns"]:
        col["top_values"] = col.get("top_values", [])[:12]
        for k in ("row_count",):
            col.pop(k, None)
    return data


def build_sample_analysis_request(
    profile: DatasetProfile, sample_rows: list[dict], instruction: str | None, req: AnalyzeRequest
) -> LLMRequest:
    return LLMRequest(
        task="sample_analysis",
        system_instruction=SCHEMA_ANALYSIS_SYSTEM + SAMPLE_ANALYSIS_ADDENDUM,
        input={
            "mode": "sample",
            "table_name": profile.table_name,
            "instruction": instruction,
            "controls": {
                "target_rows": req.target_rows,
                "locale": req.locale,
                "seed": req.seed,
                "edge_case_mode": req.edge_case_mode,
                "privacy_mode": req.privacy_mode,
            },
            "source_row_count": profile.total_rows,
            "profile": _ai_profile(profile),
            "sample_rows": sample_rows,
        },
        response_schema_name="GenerationPlan",
        response_json_schema=GenerationPlan.model_json_schema(),
        tier="smart",
        temperature=0.1,
    )
