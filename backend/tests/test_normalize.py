"""Regression tests for LLM-output normalization (shared by every provider) - no live API.

The exact four Groq errors were never captured (the router only logged an error COUNT), so these tests
reproduce the failure CLASSES that Llama-family JSON output typically hits against our schema. Each test
first proves the raw payload FAILS the unchanged GenerationPlan, then that normalization repairs it.
"""
import copy
import json

import pytest
from pydantic import ValidationError

from app.ai.base import BaseLLMProvider
from app.ai.errors import AllProvidersFailedError
from app.ai.normalize import normalize_plan_payload, summarize_validation_error
from app.ai.prompts import build_schema_analysis_request
from app.ai.router import LLMRouter, parse_json_output
from app.models.api import AnalyzeRequest
from app.models.plan import GenerationPlan


def col(name, dt="string", strategy="faker", **kw):
    return {"name": name, "data_type": dt, "semantic_type": kw.pop("sem", name),
            "generator": {"strategy": strategy, "generator": kw.pop("gen", None), "params": {}, "depends_on": []}, **kw}


def base() -> dict:
    """A structurally valid two-table plan (what a well-behaved provider returns)."""
    return {
        "domain": "shop", "summary": "s", "locale": "en_US",
        "tables": [
            {"name": "customers", "target_rows": 10, "primary_key": ["id"], "foreign_keys": [],
             "columns": [col("id", "integer", "deterministic_id", is_primary_key=True), col("email", sem="email", gen="email")]},
            {"name": "orders", "target_rows": 30, "primary_key": ["id"],
             "foreign_keys": [{"column": "customer_id", "references_table": "customers", "references_column": "id"}],
             "columns": [col("id", "integer", "deterministic_id", is_primary_key=True),
                         col("customer_id", "integer", "foreign_key"),
                         col("status", strategy="categorical", allowed_values=["new", "paid"])]},
        ],
        "relationships": [{"parent_table": "customers", "parent_column": "id", "child_table": "orders",
                           "child_column": "customer_id", "cardinality": "1:N"}],
        "business_rules": [{"id": "r1", "description": "orders reference customers", "tables": ["orders"]}],
        "edge_cases": {"mode": "ai_recommended", "recommendations": []},
        "warnings": [], "assumptions": [],
    }


def rejects(payload: dict) -> ValidationError:
    with pytest.raises(ValidationError) as ei:
        GenerationPlan.model_validate(payload)
    return ei.value


def repaired(payload: dict) -> GenerationPlan:
    return GenerationPlan.model_validate(normalize_plan_payload(payload))


def has_note(plan: GenerationPlan) -> bool:
    return any("normalized before validation" in w for w in plan.warnings)


def _real_plans():
    from pathlib import Path
    root = Path(__file__).parent
    docs = root.parent.parent / "docs" / "examples"
    out = [json.loads((root / "fixtures" / n).read_text(encoding="utf-8")) for n in ("plan_a.json", "plan_b_hospital.json")]
    for n in ("analyze_prompt_response.json", "analyze_sample_response.json"):
        if (docs / n).exists():
            out.append(json.loads((docs / n).read_text(encoding="utf-8"))["plan"])
    return out


@pytest.mark.parametrize("plan", _real_plans(), ids=lambda p: p["domain"])
def test_real_gemini_plans_pass_through_completely_unchanged(plan):
    """Explicit nulls on optional fields, None expressions/reasons etc. must not be touched or noted."""
    assert normalize_plan_payload(plan) == plan
    GenerationPlan.model_validate(plan)


def test_none_values_are_never_stringified():
    p = base()
    p["business_rules"][0]["expression"] = None
    p["tables"][0]["columns"][1]["pii"] = {"classification": "direct_identifier", "privacy_action": "synthesize", "reason": None}
    out = normalize_plan_payload(p)
    assert out["business_rules"][0]["expression"] is None
    assert out["tables"][0]["columns"][1]["pii"]["reason"] is None
    assert out == p


# ------------------------------------------------------------------ the failure classes
def test_baseline_valid_payload_is_untouched():
    p = base()
    assert normalize_plan_payload(p) == p                       # no changes, no warning added
    assert not has_note(GenerationPlan.model_validate(p))


def test_class1_enum_spelling_and_aliases():
    p = base()
    p["tables"][0]["columns"][0]["generator"]["strategy"] = "Deterministic ID"
    p["tables"][0]["columns"][1]["generator"]["strategy"] = "FAKER"
    p["tables"][1]["columns"][1]["generator"]["strategy"] = "Foreign-Key"
    p["tables"][0]["columns"][1]["data_type"] = "VARCHAR"
    p["tables"][0]["columns"][0]["data_type"] = "int"
    p["tables"][0]["columns"][1]["pii"] = {"classification": "PII", "privacy_action": "Replace"}
    p["relationships"][0]["cardinality"] = "one-to-many"
    p["business_rules"][0]["severity"] = "Critical"
    p["edge_cases"]["recommendations"] = [{"name": "n", "kind": "Missing Values", "description": "d", "rate": 0.05}]
    assert len(rejects(p).errors()) >= 5
    plan = repaired(p)
    t0, t1 = plan.tables
    assert t0.columns[0].generator.strategy.value == "deterministic_id" and t0.columns[1].generator.strategy.value == "faker"
    assert t1.columns[1].generator.strategy.value == "foreign_key"
    assert t0.columns[1].data_type.value == "string" and t0.columns[0].data_type.value == "integer"
    assert t0.columns[1].pii.classification.value == "direct_identifier" and t0.columns[1].pii.privacy_action.value == "synthesize"
    assert plan.relationships[0].cardinality.value == "1:N" and plan.business_rules[0].severity == "error"
    assert plan.edge_cases.recommendations[0].kind.value == "null_injection"
    assert has_note(plan)


def test_class2_nulls_where_defaults_are_expected():
    p = base()
    p["tables"][0]["columns"][1]["generator"]["params"] = None
    p["tables"][0]["columns"][1]["generator"]["depends_on"] = None
    p["tables"][0]["foreign_keys"] = None
    p["tables"][0]["primary_key"] = None
    p["tables"][0]["columns"][1]["nullable"] = None
    p["tables"][0]["columns"][1]["pii"] = None
    p["warnings"] = None
    p["relationships"] = p["relationships"]
    p["business_rules"][0]["tables"] = None
    assert len(rejects(p).errors()) >= 4
    plan = repaired(p)
    assert plan.tables[0].columns[1].generator.params == {} and plan.tables[0].foreign_keys == []
    assert plan.tables[0].primary_key == ["id"]           # re-derived from the column flag, as before
    assert plan.tables[0].columns[1].nullable is True and plan.tables[0].columns[1].pii.classification.value == "none"


def test_class3_numbers_percentages_and_allowed_value_types():
    p = base()
    p["tables"][0]["target_rows"] = "100"
    p["tables"][1]["target_rows"] = 250.0
    p["confidence"] = 95                                        # percent instead of 0-1
    p["tables"][0]["columns"][1]["confidence"] = "0.9"
    p["edge_cases"]["null_rate"] = 5
    p["edge_cases"]["recommendations"] = [{"name": "n", "kind": "outlier", "description": "d", "rate": "12%"}]
    p["tables"][1]["columns"][2]["allowed_values"] = [1, 2, True]
    p["tables"][0]["columns"][0]["is_unique"] = "true"
    p["seed"] = "42"
    assert len(rejects(p).errors()) >= 5
    plan = repaired(p)
    assert plan.tables[0].target_rows == 100 and plan.tables[1].target_rows == 250
    assert plan.confidence == pytest.approx(0.95) and plan.tables[0].columns[1].confidence == pytest.approx(0.9)
    assert plan.edge_cases.null_rate == pytest.approx(0.05) and plan.edge_cases.recommendations[0].rate == pytest.approx(0.12)
    assert plan.tables[1].columns[2].allowed_values == ["1", "2", "true"]
    assert plan.tables[0].columns[0].is_unique is True and plan.seed == 42


def test_class4_wrong_shapes_and_envelopes():
    p = base()
    p["tables"][0]["columns"][1]["generator"] = "faker"                         # bare string
    p["tables"][0]["columns"][1]["pii"] = "direct_identifier"                   # bare string
    p["business_rules"] = ["Every order must reference a valid customer", {"description": "x"}]
    p["edge_cases"] = [{"name": "peak", "kind": "unknown thing", "description": "d"}]   # list instead of object
    p["privacy"] = "auto"
    p["warnings"] = "just one warning"
    assert len(rejects(p).errors()) >= 4
    plan = repaired(p)
    assert plan.tables[0].columns[1].generator.strategy.value == "faker"
    assert plan.tables[0].columns[1].pii.classification.value == "direct_identifier"
    assert [r.id for r in plan.business_rules] == ["rule_1", "rule_2"]
    assert plan.edge_cases.recommendations[0].kind.value == "custom" and plan.privacy.mode == "auto"
    assert plan.warnings[0] == "just one warning" and has_note(plan)
    # response envelope
    wrapped = {"plan": base()}
    assert rejects(wrapped)
    assert repaired(wrapped).domain == "shop"


def test_invalid_modes_and_bad_ai_seed_are_dropped_because_user_controls_override_them():
    p = base()
    p["edge_cases"]["mode"] = "aggressive"
    p["privacy"] = {"mode": "maximum"}
    p["source_mode"] = "csv"
    p["seed"] = "not a number"
    assert rejects(p)
    plan = repaired(p)
    assert plan.edge_cases.mode == "ai_recommended" and plan.privacy.mode == "auto" and plan.seed is None


def test_normalization_is_idempotent_and_never_mutates_input():
    p = base()
    p["tables"][0]["columns"][1]["generator"]["strategy"] = "Faker"
    p["confidence"] = 90
    original = copy.deepcopy(p)
    once = normalize_plan_payload(p)
    assert p == original
    assert normalize_plan_payload(once) == once


# ------------------------------------------------------------------ structure is NOT weakened
def _bad(mutator, expect_type=None):
    p = base()
    mutator(p)
    normalized = normalize_plan_payload(p)
    with pytest.raises(ValidationError) as ei:
        GenerationPlan.model_validate(normalized)
    if expect_type:
        assert expect_type in {e["type"] for e in ei.value.errors()}
    return normalized


@pytest.mark.parametrize("mutator", [
    lambda p: p["tables"][1]["foreign_keys"][0].update(references_table="ghost"),
    lambda p: p["tables"][1]["foreign_keys"][0].update(references_column="ghost"),
    lambda p: p["tables"][1]["foreign_keys"][0].update(column="ghost"),
    lambda p: p["tables"][0].update(primary_key=["ghost"]),
    lambda p: p["relationships"][0].update(child_column="ghost"),
    lambda p: p["relationships"][0].update(parent_table="ghost"),
    lambda p: p["tables"][0]["columns"][1]["generator"].update(depends_on=["ghost"]),
    lambda p: p["tables"][1].update(name="customers"),                                  # duplicate table
    lambda p: p["tables"][0]["columns"].append(col("id", "integer", "deterministic_id")),  # duplicate column
], ids=["fk-table", "fk-column", "fk-col", "pk", "rel-col", "rel-table", "depends-on", "dup-table", "dup-column"])
def test_reference_and_uniqueness_errors_still_fail(mutator):
    _bad(mutator)


@pytest.mark.parametrize("mutator", [
    lambda p: p.pop("tables"), lambda p: p.update(tables=[]), lambda p: p.pop("domain"),
    lambda p: p["tables"][0].update(columns=[]),
    lambda p: p["tables"][0]["columns"][1].pop("generator"),
    lambda p: p["tables"][0]["columns"][1].pop("data_type"),
    lambda p: p["tables"][0]["columns"][1].pop("name"),
    lambda p: p["tables"][0]["columns"][1]["generator"].pop("strategy"),
    lambda p: p["tables"][0]["columns"][1]["generator"].update(strategy="teleport"),     # unknown strategy is NOT invented
    lambda p: p["tables"][0]["columns"][1].update(data_type="hologram"),                  # unknown type is NOT invented
    lambda p: p["relationships"][0].update(cardinality="sideways"),
], ids=["no-tables", "empty-tables", "no-domain", "no-columns", "no-generator", "no-datatype", "no-colname",
        "no-strategy", "bad-strategy", "bad-type", "bad-cardinality"])
def test_required_structure_still_required(mutator):
    _bad(mutator)


def test_normalizer_never_invents_tables_columns_or_relationships():
    p = base()
    p["tables"][0]["foreign_keys"] = None
    p["relationships"] = None
    plan = repaired(p)
    assert [t.name for t in plan.tables] == ["customers", "orders"]
    assert [len(t.columns) for t in plan.tables] == [2, 3]
    assert plan.relationships == []


# ------------------------------------------------------------------ router integration + diagnostics
class Stub(BaseLLMProvider):
    name, model = "groq", "stub"

    def __init__(self, text):
        self.text = text

    async def complete_json(self, request, timeout):
        return self.text


def run_router(text, retries=0):
    import asyncio
    router = LLMRouter([Stub(text)], 5, retries)
    req = build_schema_analysis_request(AnalyzeRequest(mode="prompt", prompt="x", target_rows=7))
    return asyncio.run(router.complete_structured(req, GenerationPlan))


def test_router_accepts_messy_fenced_output_with_prose_and_reports_normalization():
    p = base()
    p["tables"][0]["columns"][1]["generator"]["strategy"] = "Faker"
    p["relationships"][0]["cardinality"] = "one-to-many"
    p["confidence"] = 88
    text = "Here is your plan:\n```json\n" + json.dumps({"generation_plan": p}) + "\n```\nHope this helps!"
    plan, meta = run_router(text)
    assert meta.provider == "groq" and meta.fallbacks == 0
    assert plan.tables[0].columns[1].generator.strategy.value == "faker" and plan.confidence == pytest.approx(0.88)
    assert any("normalized before validation" in w for w in plan.warnings)


def test_parse_json_output_handles_fences():
    assert parse_json_output('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_output('```\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_output('Sure! {"a": {"b": 2}} done') == {"a": {"b": 2}}


def test_failed_validation_reports_field_paths_and_types_never_values():
    p = base()
    del p["tables"][1]["columns"][2]["generator"]
    p["tables"][0]["columns"][1]["semantic_type"] = None                # top-secret-looking value must not leak
    p["tables"][0]["columns"][1]["description"] = "SECRET-CUSTOMER-DATA-123"
    p["tables"][1]["columns"][0]["data_type"] = "hologram-SECRET-999"
    with pytest.raises(AllProvidersFailedError) as ei:
        run_router(json.dumps(p))
    msg = " ".join(ei.value.attempts)
    assert "groq: schema validation failed" in msg and "errors:" in msg
    assert "tables.1.columns.2.generator [missing]" in msg
    assert "tables.1.columns.0.data_type [enum]" in msg
    assert "SECRET" not in msg and "hologram" not in msg


def test_summarize_validation_error_caps_length():
    with pytest.raises(ValidationError) as ei:
        GenerationPlan.model_validate({"tables": [{"columns": [{}]}] * 5})
    s = summarize_validation_error(ei.value, limit=3)
    assert s.count("[") == 3 and "more" in s
