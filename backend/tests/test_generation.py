import copy
import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.generation.engine import generate
from app.main import app
from app.models.generation import GenerateRequest
from app.models.plan import GenerationPlan
from app.services.generate import generate_dataset
from app.validation.validator import validate

FIXTURE = Path(__file__).parent / "fixtures" / "plan_a.json"  # real Gemini output (prompt A)


def col(name, dt="string", strategy="faker", generator=None, params=None, deps=None, **kw):
    return {
        "name": name, "data_type": dt, "semantic_type": kw.pop("sem", name),
        "generator": {"strategy": strategy, "generator": generator, "params": params or {}, "depends_on": deps or []},
        **kw,
    }


def plan_of(*tables, rels=None, **kw):
    return GenerationPlan.model_validate({"domain": "t", "tables": list(tables), "relationships": rels or [], **kw})


def table(name, cols, rows=20, **kw):
    return {"name": name, "columns": cols, "target_rows": rows, **kw}


def customers(rows=50, **kw):
    return table("customers", [
        col("id", "integer", "deterministic_id", is_primary_key=True, nullable=False),
        col("name", sem="person_name", generator="name", nullable=False),
        col("email", strategy="derived", sem="email", deps=["name"], is_unique=True, nullable=False),
        col("city", strategy="categorical", allowed_values=["A", "B", "C"], params={"weights": {"A": 0.8, "B": 0.15, "C": 0.05}}),
        col("joined", "date", generator="date_between", params={"start_date": "-1y", "end_date": "today"}),
    ], rows=rows, **kw)


def rows_of(plan, **kw):
    return generate(plan, **kw).data


# ---------------------------------------------------------------- generators
def test_deterministic_ids_unique():
    p = plan_of(table("t", [col("id", "integer", "deterministic_id", is_primary_key=True),
                            col("u", "uuid", "deterministic_id", "uuid4"),
                            col("code", "string", "deterministic_id")], rows=200))
    d = rows_of(p, seed=1)["t"]
    assert [r["id"] for r in d] == list(range(1, 201))
    assert len({r["u"] for r in d}) == 200 and len({r["code"] for r in d}) == 200


def test_faker_fields_and_locale_fallback():
    p = plan_of(table("t", [col("n", generator="name"), col("c", sem="city"), col("ph", sem="phone_number"),
                            col("d", "date", generator="date_between", params={"start_date": "-2y", "end_date": "today"}),
                            col("dt", "datetime", generator="date_between"), col("w", generator="not_a_provider")]),
                locale="xx_YY")
    out = generate(p, seed=3)
    r = out.data["t"][0]
    assert r["n"] and r["c"] and r["ph"] and isinstance(r["d"], date)
    assert any("xx_YY" in w for w in out.warnings) and out.faker_locale == "en_US"
    assert any("not_a_provider" in w for w in out.warnings)


def test_pakistani_locale_pack():
    p = plan_of(table("t", [col("c", sem="city", generator="city")], rows=100), locale="en_PK")
    cities = {r["c"] for r in rows_of(p, seed=1)["t"]}
    assert "Karachi" in cities or "Lahore" in cities


def test_weighted_categorical():
    d = rows_of(plan_of(customers(2000)), seed=5)["customers"]
    share = sum(r["city"] == "A" for r in d) / len(d)
    assert 0.74 < share < 0.86 and {r["city"] for r in d} <= {"A", "B", "C"}


def test_bad_weights_normalized_with_warning():
    t = table("t", [col("s", strategy="categorical", allowed_values=["x", "y"], params={"weights": {"x": "bad", "y": -1}})], rows=30)
    out = generate(plan_of(t), seed=1)
    assert {r["s"] for r in out.data["t"]} <= {"x", "y"} and out.warnings


def test_statistical_types_and_bounds():
    t = table("t", [col("a", "integer", "statistical", "uniform", {"min": 5, "max": 9}),
                    col("b", "decimal", "statistical", "normal", {"mean": 100, "std": 10, "min": 0}),
                    col("c", "decimal", "statistical", "lognormal", {"mean": 3, "sigma": 1})], rows=300)
    d = rows_of(plan_of(t), seed=2)["t"]
    assert all(isinstance(r["a"], int) and 5 <= r["a"] <= 9 for r in d)
    assert all(r["b"] >= 0 for r in d) and all(r["c"] > 0 for r in d)


def test_derived_email_from_name_unique():
    d = rows_of(plan_of(customers(300)), seed=9)["customers"]
    emails = [r["email"] for r in d]
    assert len(set(emails)) == 300 and all("@" in e for e in emails)
    first = d[0]["name"].split()[0].lower()
    assert first in d[0]["email"]


def test_uniqueness_of_faker_unique_column():
    t = table("t", [col("n", generator="name", is_unique=True)], rows=500)
    d = rows_of(plan_of(t), seed=1)["t"]
    assert len({r["n"] for r in d}) == 500


def test_ai_text_placeholder_warns_without_llm():
    t = table("t", [col("note", strategy="ai_text")], rows=3)
    out = generate(plan_of(t), seed=1)
    assert all(r["note"] for r in out.data["t"]) and any("ai_text" in w for w in out.warnings)


def test_underivable_field_warns_not_invents():
    t = table("t", [col("x", strategy="derived", sem="mystery")], rows=3)
    out = generate(plan_of(t), seed=1)
    assert all(r["x"] is None for r in out.data["t"]) and out.warnings


def test_total_derived():
    t = table("t", [col("quantity", "integer", "statistical", "uniform", {"min": 1, "max": 5}),
                    col("p", "decimal", "statistical", "uniform", {"min": 10, "max": 20}),
                    col("total", "decimal", "derived", sem="order_total", deps=["quantity", "p"])], rows=20)
    out = generate(plan_of(t), seed=1)
    assert all(r["total"] == round(r["quantity"] * r["p"], 2) for r in out.data["t"])
    assert validate(plan_of(t), out.data, out.derived_meta).passed


# ---------------------------------------------------------------- relational
def hospital(rows=(10, 4, 60)):
    return plan_of(
        # child listed first on purpose: order must still be parents first
        table("appts", [col("id", "integer", "deterministic_id", is_primary_key=True),
                        col("pid", "integer", "foreign_key", params={"table": "patients", "column": "id"}, nullable=False),
                        col("did", "integer", "foreign_key", nullable=False)], rows=rows[2],
              foreign_keys=[{"column": "pid", "references_table": "patients", "references_column": "id"},
                            {"column": "did", "references_table": "doctors", "references_column": "id"}]),
        table("patients", [col("id", "integer", "deterministic_id", is_primary_key=True)], rows=rows[0]),
        table("doctors", [col("id", "integer", "deterministic_id", is_primary_key=True)], rows=rows[1]),
    )


def test_fk_integrity_and_parent_first():
    p = hospital()
    out = generate(p, seed=4)
    assert out.order.index("appts") > out.order.index("patients") and out.order.index("appts") > out.order.index("doctors")
    pids = {r["id"] for r in out.data["patients"]}
    dids = {r["id"] for r in out.data["doctors"]}
    a = out.data["appts"]
    assert all(r["pid"] in pids and r["did"] in dids for r in a)
    assert {r["pid"] for r in a} == pids  # every parent used when child rows >= parent rows
    assert validate(p, out.data, out.derived_meta).passed


def test_running_balance_reconciles():
    p = plan_of(
        table("accounts", [col("id", "integer", "deterministic_id", is_primary_key=True),
                           col("current_balance", "decimal", "statistical", "uniform", {"min": 1000, "max": 2000})], rows=3),
        table("tx", [col("id", "integer", "deterministic_id", is_primary_key=True),
                     col("account_id", "integer", "foreign_key", params={"table": "accounts", "column": "id"}),
                     col("amount", "decimal", "statistical", "uniform", {"min": 1, "max": 100}, sem="money_amount"),
                     col("kind", strategy="categorical", allowed_values=["DEBIT", "CREDIT"], sem="transaction_type"),
                     col("status", strategy="categorical", allowed_values=["SUCCESS", "FAILED"],
                         params={"weights": {"SUCCESS": 0.8, "FAILED": 0.2}}),
                     col("ts", "datetime", "faker", "date_time_between", {"start_date": "-30d", "end_date": "now"}),
                     col("running_balance", "decimal", "derived", sem="running_balance",
                         deps=["account_id", "amount", "kind", "status"])],
              rows=100, foreign_keys=[{"column": "account_id", "references_table": "accounts", "references_column": "id"}]))
    out = generate(p, seed=11)
    tx = out.data["tx"]
    assert [r["ts"] for r in tx] == sorted(r["ts"] for r in tx)
    state = {r["id"]: r["current_balance"] for r in out.data["accounts"]}
    for r in tx:
        if r["status"] == "SUCCESS":
            state[r["account_id"]] += r["amount"] if r["kind"] == "CREDIT" else -r["amount"]
        assert r["running_balance"] == pytest.approx(state[r["account_id"]], abs=0.011)
    assert validate(p, out.data, out.derived_meta).passed
    tx[10]["running_balance"] += 5  # tampering is detected
    rep = validate(p, out.data, out.derived_meta)
    assert not rep.passed and any(c.name == "derived:running_balance" and c.status == "error" for c in rep.tables[1].checks)


# ---------------------------------------------------------------- seed
def test_reproducible_with_seed():
    p = plan_of(customers(40))
    a = generate(p, seed=123).data
    b = generate(p, seed=123).data
    c = generate(p, seed=124).data
    assert a == b and a != c


def test_seed_priority_and_reporting():
    p = plan_of(customers(5), seed=77)
    assert generate(p).seed == 77 and generate(p).seed_source == "plan"
    assert generate(p, seed=5).seed == 5 and generate(p, seed=5).seed_source == "request"
    assert generate(plan_of(customers(5))).seed_source == "random"


# ---------------------------------------------------------------- edge cases
def test_null_injection_is_safe():
    p = plan_of(table("t", [col("id", "integer", "deterministic_id", is_primary_key=True),
                            col("opt", generator="name", nullable=True),
                            col("req", generator="name", nullable=False),
                            col("base", "integer", "statistical", "uniform", {"min": 1, "max": 9}),
                            col("dep", "decimal", "derived", sem="order_total", deps=["base"])], rows=100),
                edge_cases={"mode": "custom", "null_rate": 0.2})
    out = generate(p, seed=1)
    d = out.data["t"]
    assert sum(r["opt"] is None for r in d) == 20
    assert all(r["id"] is not None and r["req"] is not None and r["base"] is not None for r in d)


def test_rare_category_and_outlier_injection():
    p = plan_of(table("t", [col("s", strategy="categorical", allowed_values=["ok", "bad"], params={"weights": {"ok": 1, "bad": 0}}),
                            col("amt", "decimal", "statistical", "normal", {"mean": 100, "std": 5})], rows=100),
                edge_cases={"mode": "ai_recommended", "recommendations": [
                    {"name": "bad", "kind": "rare_category", "description": "bad ones", "table": "t", "column": "s", "rate": 0.1},
                    {"name": "big", "kind": "outlier", "description": "big amounts", "table": "t", "column": "amt", "rate": 0.03}]})
    out = generate(p, seed=1)
    d = out.data["t"]
    assert sum(r["s"] == "bad" for r in d) >= 10
    assert sum(r["amt"] > 120 for r in d) == 3
    assert {"rare_category", "outlier"} <= {e.kind for e in out.edge_log}


def test_edge_case_mode_none_disables():
    p = plan_of(customers(50), edge_cases={"mode": "none", "null_rate": 0.5, "rare_category_rate": 0.5})
    assert generate(p, seed=1).edge_log == []


def test_level_mode_uses_intensity():
    p = plan_of(table("t", [col("s", strategy="categorical", allowed_values=["a", "b"], params={"weights": {"a": 1, "b": 0}})], rows=100),
                edge_cases={"mode": "high"})
    assert sum(r["s"] == "b" for r in generate(p, seed=1).data["t"]) >= 8  # high mode also injects nulls


# ---------------------------------------------------------------- validation failures
def test_validation_detects_problems():
    p = hospital()
    data = generate(p, seed=1).data
    data["patients"][1]["id"] = data["patients"][0]["id"]   # duplicate PK
    data["appts"][0]["pid"] = 9999                          # orphan FK
    data["appts"][1]["did"] = None                          # null required FK
    data["doctors"].pop()                                   # wrong row count
    rep = validate(p, data, [])
    assert not rep.passed
    names = {(tv.table, c.name) for tv in rep.tables for c in tv.checks if c.status == "error"}
    assert {("patients", "primary_key_unique"), ("appts", "foreign_keys"), ("doctors", "row_count")} <= names


def test_validation_allowed_values_and_types():
    p = plan_of(customers(10))
    out = generate(p, seed=1)
    out.data["customers"][0]["city"] = "Z"
    out.data["customers"][1]["email"] = "not-an-email"
    out.data["customers"][2]["id"] = "str"
    rep = validate(p, out.data, out.derived_meta)
    errs = {c.name for tv in rep.tables for c in tv.checks if c.status == "error"}
    assert {"allowed_values", "email_format", "data_types"} <= errs


def test_business_rule_future_date_detected():
    p = plan_of(customers(5), business_rules=[
        {"id": "r1", "description": "no future", "tables": ["customers"], "expression": "joined <= today()"}])
    out = generate(p, seed=1)
    assert validate(p, out.data, out.derived_meta).passed
    out.data["customers"][0]["joined"] = date(2999, 1, 1)
    rep = validate(p, out.data, out.derived_meta)
    assert not rep.passed and rep.rules[0].status == "error"


# ---------------------------------------------------------------- real plan A
def test_real_plan_a():
    plan = GenerationPlan.model_validate(json.loads(FIXTURE.read_text()))
    out = generate(plan, seed=42)
    d = out.data["customers"]
    assert len(d) == 20
    assert len({r["customer_id"] for r in d}) == 20 and len({r["email"] for r in d}) == 20
    assert all(r["name"] for r in d)
    assert {r["city"] for r in d} <= {"Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta"}
    assert all(r["signup_date"] <= date.today() for r in d)
    assert {r["account_status"] for r in d} <= {"active", "inactive", "suspended"}
    assert any(r["account_status"] == "suspended" for r in d)
    assert validate(plan, out.data, out.derived_meta).passed


# ---------------------------------------------------------------- endpoint
def test_generate_endpoint():
    plan = json.loads(FIXTURE.read_text())
    c = TestClient(app)
    r = c.post("/api/v1/generate", json={"plan": plan, "seed": 42})
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]["customers"]) == 20
    assert body["validation"]["passed"] is True
    assert body["metadata"]["seed"] == 42 and body["metadata"]["rows_generated"] == 20
    assert "/api/v1/generate" in c.get("/openapi.json").json()["paths"]


def test_generate_endpoint_rejects_invalid_plan_and_huge_tables():
    c = TestClient(app)
    assert c.post("/api/v1/generate", json={"plan": {"domain": "x", "tables": []}}).status_code == 422
    plan = json.loads(FIXTURE.read_text())
    plan["tables"][0]["target_rows"] = 10_000_000
    r = c.post("/api/v1/generate", json={"plan": plan})
    assert r.status_code == 422 and r.json()["error"]["code"] == "generation_error"


def test_default_rows_used_when_plan_has_none():
    t = table("t", [col("id", "integer", "deterministic_id", is_primary_key=True)], rows=None)
    resp = generate_dataset(GenerateRequest(plan=plan_of(t), default_rows=7))
    assert resp.metadata.rows_generated == 7
    resp = generate_dataset(GenerateRequest(plan=plan_of(t)))
    assert resp.metadata.rows_generated == 100 and any("defaulted" in w for w in resp.warnings)
