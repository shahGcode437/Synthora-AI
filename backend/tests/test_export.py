import csv
import io
import json
import zipfile
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.exports.exporter import ExportError, export_data, safe_name
from app.main import app

FIX = Path(__file__).parent / "fixtures"
client = TestClient(app)


def generated(fixture: str, seed: int = 1) -> dict:
    """Run the real /generate endpoint on a saved real plan and return its data."""
    plan = json.loads((FIX / fixture).read_text())
    r = client.post("/api/v1/generate", json={"plan": plan, "seed": seed})
    assert r.status_code == 200
    return r.json()["data"]


def post(data, fmt, **kw):
    return client.post("/api/v1/export", json={"data": data, "format": fmt, **kw})


def read_csv(content: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(content.decode("utf-8"))))


def test_single_table_csv():
    data = generated("plan_a.json")
    r = post(data, "csv", filename="customers export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="customers_export.csv"' in r.headers["content-disposition"]
    rows = read_csv(r.content)
    assert len(rows) == 20
    assert list(rows[0]) == list(data["customers"][0])  # header order preserved
    assert rows[0]["email"] == data["customers"][0]["email"]


def test_csv_serializes_dates_nulls_bools_and_unicode():
    rows = [{"d": date(2025, 1, 2), "dt": datetime(2025, 1, 2, 3, 4, 5), "n": None, "b": True, "s": "Zoë, \"q\"", "j": {"a": 1}}]
    out = read_csv(export_data({"t": rows}, "csv").content)
    assert out == [{"d": "2025-01-02", "dt": "2025-01-02T03:04:05", "n": "", "b": "true", "s": 'Zoë, "q"', "j": '{"a": 1}'}]


def test_csv_columns_first_seen_across_rows():
    out = export_data({"t": [{"a": 1}, {"a": 2, "b": 3}]}, "csv").content.decode()
    assert out.splitlines()[0] == "a,b" and out.splitlines()[1] == "1,"


def test_csv_multi_table_is_rejected_with_hint():
    r = post({"a": [{"x": 1}], "b": [{"y": 2}]}, "csv")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "export_error" and "zip" in r.json()["error"]["message"]


def test_single_table_json_round_trip():
    data = generated("plan_a.json")
    r = post(data, "json")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert r.headers["content-disposition"] == 'attachment; filename="synthora_export.json"'
    assert json.loads(r.content) == data


def test_multi_table_json_round_trip():
    data = generated("plan_b_hospital.json")
    assert json.loads(post(data, "json").content) == data


def test_multi_table_zip_hospital():
    data = generated("plan_b_hospital.json")
    r = post(data, "zip", filename="../../etc/hospital demo.zip")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert 'filename="hospital_demo.zip"' in r.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert z.testzip() is None
    assert sorted(z.namelist()) == ["appointments.csv", "data.json", "doctors.csv", "patients.csv"]
    for table, rows in data.items():
        got = read_csv(z.read(f"{table}.csv"))
        assert len(got) == len(rows) and list(got[0]) == list(rows[0])
    assert json.loads(z.read("data.json")) == data
    # referential integrity survives export
    pids = {p["patient_id"] for p in read_csv(z.read("patients.csv"))}
    assert all(a["patient_id"] in pids for a in read_csv(z.read("appointments.csv")))


def test_zip_without_json_and_safe_table_names():
    data = {"../evil": [{"x": 1}], "a b": [{"x": 1}], "a_b": [{"x": 2}], "data": [{"x": 3}]}
    z = zipfile.ZipFile(io.BytesIO(export_data(data, "zip", include_json=False).content))
    names = z.namelist()
    assert len(set(n.lower() for n in names)) == 4 and "data.json" not in names
    assert all("/" not in n and ".." not in n and n.endswith(".csv") for n in names)


@pytest.mark.parametrize("data", [{}, {"t": []}, {"t": [{"a": 1}], "u": []}])
def test_empty_input_rejected(data):
    r = post(data, "json")
    assert r.status_code == 422 and r.json()["error"]["code"] == "export_error"


def test_malformed_and_unsupported_rejected():
    assert post({"t": "not rows"}, "csv").status_code == 422
    assert post({"t": [1, 2]}, "csv").status_code == 422
    bad = post({"t": [{"a": 1}]}, "xlsx")
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "validation_error"


def test_too_large_rejected(monkeypatch):
    monkeypatch.setattr("app.exports.exporter.MAX_TOTAL_ROWS", 2)
    with pytest.raises(ExportError, match="too large"):
        export_data({"t": [{"a": 1}] * 3}, "json")


@pytest.mark.parametrize("raw,expected", [
    ("my export.csv", "my_export"), ("../../etc/passwd", "passwd"), ("C:\\x\\y.zip", "y"),
    ('a"b;c\r\nd', "a_b_c_d"), ("", "synthora_export"), (None, "synthora_export"), ("...", "synthora_export"),
    ("ünï", "n"), ("x" * 200, "x" * 64),
])
def test_filename_sanitization(raw, expected):
    assert safe_name(raw) == expected


def test_openapi_lists_export():
    assert "/api/v1/export" in client.get("/openapi.json").json()["paths"]
