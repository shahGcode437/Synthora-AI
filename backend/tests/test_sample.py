"""Sample-data (CSV) mode. AI is stubbed; profiling and grounding are the real code."""
import csv
import io
import json
import statistics
from collections import Counter
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.ai.base import BaseLLMProvider
from app.ai.router import LLMRouter
from app.api.deps import get_llm_router
from app.main import app
from app.profiling import csv_parser
from app.profiling.csv_parser import SampleInputError, parse_csv
from app.profiling.profiler import profile_dataset
from app.profiling.sampler import build_sample

SAMPLES = Path(__file__).parent / "fixtures" / "samples"
CUSTOMERS = (SAMPLES / "customers.csv").read_bytes()
TRANSACTIONS = (SAMPLES / "transactions.csv").read_bytes()


def profile_of(data: bytes, name: str):
    return profile_dataset(parse_csv(data, name))


def source_rows(data: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(data.decode("utf-8"))))


# ------------------------------------------------------------------ stub AI
def _col(name, dt, strategy, generator=None, sem=None, pii=None, **kw):
    return {"name": name, "data_type": dt, "semantic_type": sem or name,
            "generator": {"strategy": strategy, "generator": generator, "params": kw.pop("params", {}),
                          "depends_on": kw.pop("deps", [])},
            "pii": {"classification": pii or "none", "privacy_action": "synthesize" if pii else "none"}, **kw}


AI_CUSTOMERS = {
    "domain": "ecommerce", "locale": "en_PK",
    "tables": [{"name": "whatever_ai_called_it", "target_rows": 999, "columns": [
        _col("name", "string", "faker", "name", "person_name", "direct_identifier"),
        _col("email", "string", "derived", None, "email", "direct_identifier", deps=["name"]),
        _col("city", "string", "faker", "city", "city", "quasi_identifier"),          # AI picked faker: must become categorical
        _col("age", "integer", "faker", "random_int", "age", "quasi_identifier"),      # AI picked faker: must become statistical
        _col("account_status", "string", "categorical", None, "account_status",
             allowed_values=["active", "inactive", "suspended"]),
        _col("loyalty_points", "integer", "statistical", "uniform", "points"),         # not in the CSV: must be dropped
    ]}],
    "edge_cases": {"mode": "ai_recommended", "null_rate": 0.3, "recommendations": [
        {"name": "suspended_accounts", "kind": "status_scenario", "description": "A few suspended accounts",
         "table": "customers", "column": "account_status", "rate": 0.05},
        {"name": "ghost", "kind": "null_injection", "description": "x", "table": "customers", "column": "nope", "rate": 0.1}]},
    "business_rules": [{"id": "r1", "description": "no future signup", "tables": ["x"], "expression": "signup_date <= today()"}],
}
AI_TRANSACTIONS = {
    "domain": "banking",
    "tables": [{"name": "transactions", "columns": [
        _col("transaction_id", "string", "deterministic_id", None, "transaction_id", is_primary_key=True),
        _col("account_id", "string", "foreign_key", None, "account_id"),               # invalid in single table
        _col("amount", "decimal", "statistical", "normal", "money_amount", "sensitive"),
        _col("type", "string", "categorical", None, "transaction_type"),
        _col("timestamp", "datetime", "faker", "date_time_between", "transaction_timestamp"),
        _col("status", "string", "categorical", None, "transaction_status", allowed_values=["success", "pending", "failed"]),
        _col("merchant", "string", "categorical", None, "merchant_name"),
    ]}],
    "edge_cases": {"mode": "ai_recommended", "recommendations": [
        {"name": "failed payments", "kind": "status_scenario", "description": "failed payment cases",
         "table": "transactions", "column": "status", "rate": 0.1}]},
}


class Stub(BaseLLMProvider):
    name, model = "stub", "stub-1"

    def __init__(self, plan):
        self.plan, self.seen = plan, []

    async def complete_json(self, request, timeout):
        self.seen.append(request)
        return json.dumps(self.plan)


@pytest.fixture
def client():
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def analyze(client, csv_bytes, ai_plan, name="customers.csv", **form):
    stub = Stub(ai_plan)
    router = LLMRouter([stub], 5, 0)
    app.dependency_overrides[get_llm_router] = lambda: router
    r = client.post("/api/v1/analyze/sample", files={"file": (name, csv_bytes, "text/csv")},
                    data={k: str(v) for k, v in form.items()})
    return r, stub


# ------------------------------------------------------------------ parsing
def test_parse_basic_and_bom_and_table_name():
    p = parse_csv(b"\xef\xbb\xbfid,name\r\n1,Ann\r\n2,\r\n", "My Data (1).csv")
    assert p.headers == ["id", "name"] and len(p.rows) == 2 and p.table_name == "my_data_1"


@pytest.mark.parametrize("delim", [";", "\t", "|"])
def test_parse_detects_delimiters(delim):
    text = delim.join(["a", "b", "c"]) + "\n" + delim.join(["1", "2", "3"]) + "\n" + delim.join(["4", "5", "6"]) + "\n"
    p = parse_csv(text.encode(), "x.csv")
    assert p.delimiter == delim and p.headers == ["a", "b", "c"]


def test_parse_renames_duplicate_and_blank_headers():
    p = parse_csv(b"a,a,\n1,2,3\n", "x.csv")
    assert p.headers == ["a", "a_2", "column_3"] and p.warnings


@pytest.mark.parametrize("data,msg", [
    (b"", "empty"), (b"   \n\n", "empty"), (b"a,b,c\n", "no data rows"), (b"\x00\x01\x02binary", "binary"),
    (b"caf\xe9,x\n1,2\n", "UTF-8"), (b"a,b\n" + b"1,2,3\n" * 10, "Malformed"),
    (b'a,b\n1,"unterminated\n2,3\n', "Malformed"),
])
def test_parse_rejects_bad_files(data, msg):
    with pytest.raises(SampleInputError, match=msg):
        parse_csv(data, "x.csv")


def test_parse_size_and_shape_limits(monkeypatch):
    monkeypatch.setattr(csv_parser, "MAX_BYTES", 10)
    with pytest.raises(SampleInputError) as ei:
        parse_csv(b"a,b\n1,2\n3,4\n", "x.csv")
    assert ei.value.status == 413
    monkeypatch.setattr(csv_parser, "MAX_BYTES", 10_000)
    monkeypatch.setattr(csv_parser, "MAX_ROWS", 2)
    with pytest.raises(SampleInputError, match="Too many rows"):
        parse_csv(b"a\n1\n2\n3\n", "x.csv")
    monkeypatch.setattr(csv_parser, "MAX_COLUMNS", 2)
    with pytest.raises(SampleInputError, match="Too many columns"):
        parse_csv(b"a,b,c\n1,2,3\n", "x.csv")


def test_parse_tolerates_a_few_ragged_rows():
    body = "a,b\n" + "1,2\n" * 40 + "3\n"
    p = parse_csv(body.encode(), "x.csv")
    assert len(p.rows) == 41 and any("padded" in w for w in p.warnings)


# ------------------------------------------------------------------ profiling
def test_null_statistics():
    p = profile_of(CUSTOMERS, "customers.csv")
    assert p.total_rows == 40 and p.total_columns == 6
    assert p.column("email").null_count == 3 and p.column("email").null_pct == 7.5
    assert p.column("age").null_count == 2 and p.column("city").null_count == 1
    assert p.column("name").null_count == 0


def test_categorical_frequencies():
    p = profile_of(CUSTOMERS, "customers.csv")
    truth = Counter(r["city"] for r in source_rows(CUSTOMERS) if r["city"])
    city = p.column("city")
    assert city.is_categorical and {v.value: v.count for v in city.top_values} == dict(truth)
    assert sum(v.pct for v in city.top_values) == pytest.approx(100, abs=0.1)
    assert p.column("account_status").top_values[0].value == "active"
    assert "city" in p.likely_categorical and "name" not in p.likely_categorical


def test_numeric_statistics():
    p = profile_of(CUSTOMERS, "customers.csv")
    ages = [int(r["age"]) for r in source_rows(CUSTOMERS) if r["age"]]
    a = p.column("age")
    assert a.dtype == "integer" and a.is_numeric
    assert (a.min, a.max) == (min(ages), max(ages))
    assert a.mean == pytest.approx(statistics.mean(ages)) and a.median == pytest.approx(statistics.median(ages))
    assert a.std == pytest.approx(statistics.stdev(ages)) and set(a.quantiles) == {"p5", "p25", "p50", "p75", "p95"}
    t = profile_of(TRANSACTIONS, "transactions.csv").column("amount")
    assert t.dtype == "float" and t.log_mean and t.log_std


def test_date_ranges_and_formats():
    p = profile_of(CUSTOMERS, "customers.csv")
    dates = sorted(r["signup_date"] for r in source_rows(CUSTOMERS))
    d = p.column("signup_date")
    assert d.dtype == "date" and (d.date_min, d.date_max) == (dates[0], dates[-1]) and p.likely_date == ["signup_date"]
    ts = profile_of(TRANSACTIONS, "transactions.csv").column("timestamp")
    assert ts.dtype == "datetime" and ts.date_min < ts.date_max
    q = profile_of(b"d\n31/12/2024\n01/02/2025\n", "x.csv").column("d")
    assert q.dtype == "date" and q.date_min == "2024-12-31" and q.date_format == "%d/%m/%Y"


def test_uniqueness_and_identifiers():
    p = profile_of(TRANSACTIONS, "transactions.csv")
    tid, acc = p.column("transaction_id"), p.column("account_id")
    assert tid.unique_ratio == 1.0 and tid.candidate_primary_key and tid.is_identifier
    assert tid.id_pattern == {"kind": "prefixed", "prefix": "TXN-", "width": 6, "start": 1}
    assert not acc.is_identifier and acc.id_repeat["unique"] == 8 and acc.unique_ratio < 0.2
    assert set(p.likely_identifiers) == {"transaction_id", "account_id"}
    c = profile_of(CUSTOMERS, "customers.csv")
    assert 0.8 < c.column("name").unique_ratio < 1 and not c.column("name").candidate_primary_key


def test_type_inference_edge_cases():
    p = profile_of(b"b,phone,zip,f,mix\nyes,03001234567,00100,1.5,1\nno,03111234567,00200,2,x\n", "x.csv")
    assert p.column("b").dtype == "boolean" and p.column("b").is_categorical
    assert p.column("phone").dtype == "string" and p.column("zip").dtype == "string"   # leading zeros are not numbers
    assert p.column("f").dtype == "float" and p.column("mix").dtype == "string"
    assert "phone" in p.likely_pii or p.column("phone").pattern_hints == []


def test_pii_hints_are_deterministic_and_conservative():
    p = profile_of(CUSTOMERS, "customers.csv")
    assert set(p.likely_pii) == {"name", "email"}
    t = profile_of(TRANSACTIONS, "transactions.csv")
    assert t.likely_pii == []            # merchant is a business name, not a person name
    e = profile_of(b"contact\na@b.com\nc@d.org\n", "x.csv").column("contact")
    assert "email" in e.pattern_hints and e.pii_hint


# ------------------------------------------------------------------ sampling
def test_sample_is_compact_representative_and_private():
    parsed = parse_csv(CUSTOMERS, "customers.csv")
    prof = profile_dataset(parsed)
    s = build_sample(parsed, prof)
    assert 0 < len(s) <= 12 and s == build_sample(parsed, prof)
    assert any(None in r.values() for r in s)                                    # null-bearing rows included
    raw_names = {r["name"] for r in source_rows(CUSTOMERS)}
    raw_emails = {r["email"] for r in source_rows(CUSTOMERS)}
    blob = json.dumps(s)
    assert not any(n in blob for n in raw_names) and not any(e in blob for e in raw_emails if e)
    assert all(r["city"] in {None, "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar", "Multan"} for r in s)


def test_small_files_are_sent_whole():
    parsed = parse_csv(b"a,b\n1,x\n2,y\n", "x.csv")
    assert len(build_sample(parsed, profile_dataset(parsed))) == 2


# ------------------------------------------------------------------ endpoint / upload validation
def test_upload_validation_errors(client):
    r, _ = analyze(client, b"", AI_CUSTOMERS)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_sample"
    r, _ = analyze(client, b"a,b\n1,2\n", AI_CUSTOMERS, edge_case_mode="bogus")
    assert r.status_code == 422
    r, _ = analyze(client, b"a,b\n1,2\n", AI_CUSTOMERS, target_rows=0)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert client.post("/api/v1/analyze/sample", data={}).status_code == 422       # no file


def test_oversized_upload_returns_413(client, monkeypatch):
    monkeypatch.setattr(csv_parser, "MAX_BYTES", 50)
    monkeypatch.setattr("app.api.v1.sample.MAX_BYTES", 50)
    r, _ = analyze(client, CUSTOMERS, AI_CUSTOMERS)
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"


def test_no_provider_gives_503(client):
    app.dependency_overrides[get_llm_router] = lambda: LLMRouter([], 5, 0)
    r = client.post("/api/v1/analyze/sample", files={"file": ("c.csv", CUSTOMERS, "text/csv")})
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_provider_not_configured"


def test_json_analyze_still_points_sample_mode_to_upload(client):
    r = client.post("/api/v1/analyze", json={"mode": "sample"})
    assert r.status_code == 501 and "analyze/sample" in r.json()["error"]["message"]


# ------------------------------------------------------------------ sample-mode analyze
def test_ai_receives_profile_and_sample_not_the_file(client):
    r, stub = analyze(client, CUSTOMERS, AI_CUSTOMERS, instruction="use Pakistani names")
    assert r.status_code == 200
    sent = stub.seen[0]
    assert sent.task == "sample_analysis" and sent.input["instruction"] == "use Pakistani names"
    assert sent.input["profile"]["total_rows"] == 40 and len(sent.input["sample_rows"]) <= 12
    blob = json.dumps(sent.input)
    assert "rank_counts" not in blob and len(blob) < len(CUSTOMERS) * 12
    assert not any(row["name"] in blob for row in source_rows(CUSTOMERS))
    assert stub.seen[0].system_instruction.count("SAMPLE-DATA MODE") == 1


def test_plan_is_grounded_in_profile(client):
    r, _ = analyze(client, CUSTOMERS, AI_CUSTOMERS, instruction="add suspended accounts")
    plan = r.json()["plan"]
    (t,) = plan["tables"]
    cols = {c["name"]: c for c in t["columns"]}
    assert t["name"] == "customers" and list(cols) == ["name", "email", "city", "age", "signup_date", "account_status"]
    assert plan["source_mode"] == "sample" and plan["relationships"] == []

    # AI meaning kept, code facts applied
    assert cols["name"]["pii"]["classification"] == "direct_identifier"
    assert cols["email"]["generator"]["strategy"] == "derived" and cols["email"]["generator"]["depends_on"] == ["name"]
    city = cols["city"]["generator"]
    truth = Counter(r["city"] for r in source_rows(CUSTOMERS) if r["city"])
    assert city["strategy"] == "categorical" and set(cols["city"]["allowed_values"]) == set(truth)
    assert city["params"]["weights"]["Karachi"] == pytest.approx(truth["Karachi"] / sum(truth.values()), abs=1e-4)
    age = cols["age"]["generator"]
    assert age["strategy"] == "statistical" and age["params"]["min"] == 19 and age["params"]["max"] == 48
    sd = cols["signup_date"]
    assert sd["data_type"] == "date" and sd["generator"]["params"] == {"start_date": "2024-01-12", "end_date": "2025-05-26"}
    # nulls preserved as per-column rates
    assert cols["email"]["nullable"] and cols["city"]["generator"]["params"]["null_rate"] == 0.025
    assert not cols["name"]["nullable"] and "null_rate" not in cols["name"]["generator"]["params"]
    # requested extra category present with zero baseline weight
    assert cols["account_status"]["allowed_values"][-1] == "suspended"
    assert cols["account_status"]["generator"]["params"]["weights"]["suspended"] == 0
    # AI extras / bad recs dropped, with warnings
    assert "loyalty_points" not in cols
    assert [e["column"] for e in plan["edge_cases"]["recommendations"]] == ["account_status"]
    assert any("loyalty_points" in w for w in plan["warnings"]) and plan["edge_cases"]["null_rate"] is None
    assert t["target_rows"] == 40       # defaults to the source row count
    assert r.json()["profile"]["total_rows"] == 40 and "rank_counts" not in json.dumps(r.json()["profile"])


def test_user_controls_override_ai(client):
    r, _ = analyze(client, CUSTOMERS, AI_CUSTOMERS, target_rows=250, locale="en_GB", seed=99,
                   edge_case_mode="high", privacy_mode="safe_default")
    plan = r.json()["plan"]
    assert plan["tables"][0]["target_rows"] == 250          # AI said 999
    assert plan["locale"] == "en_GB" and plan["seed"] == 99
    assert plan["edge_cases"]["mode"] == "high" and plan["privacy"]["mode"] == "safe_default"
    r, _ = analyze(client, CUSTOMERS, AI_CUSTOMERS, edge_case_mode="none", privacy_mode="none")
    plan = r.json()["plan"]
    assert plan["edge_cases"]["recommendations"] == [] and plan["locale"] == "en_PK"      # AI locale kept when unset
    assert all(c["pii"]["privacy_action"] == "none" for c in plan["tables"][0]["columns"])
    assert any("privacy_mode=none" in w for w in plan["warnings"])


def test_local_pii_detection_backs_up_the_ai(client):
    ai = json.loads(json.dumps(AI_CUSTOMERS))
    for c in ai["tables"][0]["columns"]:
        c["pii"] = {"classification": "none", "privacy_action": "none"}     # AI misses all PII
    plan = analyze(client, CUSTOMERS, ai)[0].json()["plan"]
    cols = {c["name"]: c for c in plan["tables"][0]["columns"]}
    assert cols["name"]["pii"]["classification"] == "direct_identifier" and cols["email"]["pii"]["privacy_action"] == "synthesize"


def test_transactions_plan_identifiers_and_pool(client):
    plan = analyze(client, TRANSACTIONS, AI_TRANSACTIONS, name="transactions.csv",
                   instruction="add failed payments", target_rows=600)[0].json()["plan"]
    cols = {c["name"]: c for c in plan["tables"][0]["columns"]}
    tid = cols["transaction_id"]
    assert tid["is_primary_key"] and tid["generator"]["strategy"] == "deterministic_id"
    assert tid["generator"]["params"] == {"prefix": "TXN-", "width": 6, "start": 1}
    acc = cols["account_id"]["generator"]
    assert acc["strategy"] == "categorical" and acc["params"]["synthetic_pool"]["size"] == 80   # 8 accounts * 600/60
    assert plan["tables"][0]["foreign_keys"] == []
    assert cols["amount"]["generator"]["generator"] == "lognormal"          # right-skewed positive amounts
    assert cols["status"]["allowed_values"] == ["success", "pending", "failed"]
    assert cols["timestamp"]["generator"]["params"]["start_date"].startswith("2025-10-0")


# ------------------------------------------------------------------ generation from a sample-derived plan
def test_generate_from_sample_plan_customers(client):
    plan = analyze(client, CUSTOMERS, AI_CUSTOMERS, instruction="add suspended accounts", target_rows=1000)[0].json()["plan"]
    g = client.post("/api/v1/generate", json={"plan": plan, "seed": 5})
    assert g.status_code == 200
    body = g.json()
    rows = body["data"]["customers"]
    assert len(rows) == 1000 and body["validation"]["passed"], body["validation"]

    src = source_rows(CUSTOMERS)
    src_cities = Counter(r["city"] for r in src if r["city"])
    got = Counter(r["city"] for r in rows if r["city"])
    assert set(got) <= set(src_cities)
    assert got["Karachi"] / sum(got.values()) == pytest.approx(src_cities["Karachi"] / sum(src_cities.values()), abs=0.05)
    ages = [r["age"] for r in rows if r["age"] is not None]
    assert 19 <= min(ages) and max(ages) <= 48 and statistics.mean(ages) == pytest.approx(33.6, abs=2)
    dates = [r["signup_date"] for r in rows]
    assert min(dates) >= "2024-01-12" and max(dates) <= "2025-05-26"
    assert 0 < sum(r["city"] is None for r in rows) < 80 and sum(r["age"] is None for r in rows) > 0
    assert any(r["email"] is None for r in rows)                            # source email nulls reproduced on a derived column
    assert any(r["account_status"] == "suspended" for r in rows)
    assert {r["account_status"] for r in rows} <= {"active", "inactive", "suspended"}
    assert len({r["email"] for r in rows if r["email"]}) == len([r for r in rows if r["email"]])
    real_emails = {r["email"] for r in src}
    assert not real_emails & {r["email"] for r in rows}                     # no source value is reproduced


def test_generate_from_sample_plan_transactions(client):
    plan = analyze(client, TRANSACTIONS, AI_TRANSACTIONS, name="transactions.csv",
                   instruction="add failed payments", target_rows=500)[0].json()["plan"]
    body = client.post("/api/v1/generate", json={"plan": plan, "seed": 3}).json()
    rows = body["data"]["transactions"]
    assert len(rows) == 500 and body["validation"]["passed"], body["validation"]
    src = source_rows(TRANSACTIONS)
    assert len({r["transaction_id"] for r in rows}) == 500 and rows[0]["transaction_id"].startswith("TXN-")
    assert any(r["status"] == "failed" for r in rows)
    amounts = [r["amount"] for r in rows if not r["amount"] is None]
    assert min(amounts) > 0 and statistics.median(amounts) == pytest.approx(statistics.median(float(r["amount"]) for r in src), rel=0.35)
    src_accounts = {r["account_id"] for r in src}
    accounts = {r["account_id"] for r in rows}
    assert len(accounts) > 8 and not accounts & src_accounts                # fresh account ids, none reused
    assert all(a.startswith("ACC-") for a in accounts)
    assert min(r["timestamp"] for r in rows) >= "2025-10-01" and max(r["timestamp"] for r in rows) <= "2025-12-27"
