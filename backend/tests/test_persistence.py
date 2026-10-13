"""History, saved schemas, saved datasets, overview, and tenant isolation."""
import copy

import pytest

from app.config import get_settings

from tests.conftest import workspace_headers

H = "/api/v1/history"


def gen(api, plan, headers=None, **kw):
    return api.post("/api/v1/generate", json={"plan": plan, **kw}, headers=headers or {})


# ------------------------------------------------------------------ history
def test_only_generations_with_a_workspace_are_recorded(api, user, plan):
    assert gen(api, plan, seed=1).status_code == 200                       # anonymous: not recorded
    assert gen(api, plan, user["h"], seed=7).status_code == 200
    page = api.get(H, headers=user["h"]).json()
    assert page["total"] == 1
    run = page["items"][0]
    assert run["domain"] == "ecommerce" and run["rows"] == 20 and run["tables"] == 1 and run["seed"] == 7
    assert run["data_type"] == "tabular" and run["validation_passed"] is True and run["source_mode"] == "prompt"
    assert run["settings"]["target_rows"] == {"customers": 20} and run["settings"]["edge_case_mode"] == "ai_recommended"


def test_history_stores_the_plan_but_never_the_rows(api, user, plan):
    gen(api, plan, user["h"], seed=3)
    rid = api.get(H, headers=user["h"]).json()["items"][0]["id"]
    detail = api.get(f"{H}/{rid}", headers=user["h"]).json()
    assert detail["plan"]["tables"][0]["name"] == "customers"
    assert "data" not in detail and "customer_id" not in str(detail["settings"])
    import json
    from sqlalchemy.orm import Session
    from app.db import get_engine
    from app.models.db import GenerationRun
    with Session(get_engine()) as s:
        stored = json.dumps(s.query(GenerationRun).one().plan)
    assert "@" not in stored          # no generated emails: only the plan


def test_multi_table_runs_are_labelled_relational(api, user, plan):
    p = copy.deepcopy(plan)
    p["tables"].append({"name": "orders", "target_rows": 5, "primary_key": ["id"], "foreign_keys": [],
                        "columns": [{"name": "id", "data_type": "integer", "semantic_type": "id", "is_primary_key": True,
                                     "generator": {"strategy": "deterministic_id"}}]})
    gen(api, p, user["h"], seed=1)
    run = api.get(H, headers=user["h"]).json()["items"][0]
    assert run["data_type"] == "relational" and run["tables"] == 2 and run["rows"] == 25


def test_history_pagination_filter_and_newest_first(api, user, plan):
    for i in range(5):
        gen(api, plan, user["h"], seed=i)
    page = api.get(H, params={"limit": 2, "offset": 0}, headers=user["h"]).json()
    assert page["total"] == 5 and [r["seed"] for r in page["items"]] == [4, 3]
    assert [r["seed"] for r in api.get(H, params={"limit": 2, "offset": 4}, headers=user["h"]).json()["items"]] == [0]
    assert api.get(H, params={"status": "failed"}, headers=user["h"]).json()["total"] == 0
    assert api.get(H, params={"status": "passed"}, headers=user["h"]).json()["total"] == 5
    assert api.get(H, params={"limit": 0}, headers=user["h"]).status_code == 422


def test_failed_validation_runs_are_recorded_as_failed(api, user, plan, monkeypatch):
    from app.services import generate as svc
    real = svc.validate

    def failing(plan_, data, meta):
        rep = real(plan_, data, meta)
        return rep.model_copy(update={"passed": False, "error_count": 2})

    monkeypatch.setattr(svc, "validate", failing)
    gen(api, plan, user["h"], seed=1)
    assert api.get(H, params={"status": "failed"}, headers=user["h"]).json()["total"] == 1


def test_history_delete_and_clear(api, user, plan):
    for i in range(3):
        gen(api, plan, user["h"], seed=i)
    items = api.get(H, headers=user["h"]).json()["items"]
    assert api.delete(f"{H}/{items[0]['id']}", headers=user["h"]).status_code == 204
    assert api.delete(f"{H}/{items[0]['id']}", headers=user["h"]).status_code == 404
    assert api.get(H, headers=user["h"]).json()["total"] == 2
    assert api.delete(H, headers=user["h"]).status_code == 204
    assert api.get(H, headers=user["h"]).json()["total"] == 0


def test_history_is_capped_per_workspace(api, user, plan, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_history_per_workspace", 3)
    for i in range(6):
        gen(api, plan, user["h"], seed=i)
    page = api.get(H, headers=user["h"]).json()
    assert page["total"] == 3 and [r["seed"] for r in page["items"]] == [5, 4, 3]


def test_generation_still_succeeds_if_history_cannot_be_written(api, user, plan, monkeypatch):
    from app.api.v1 import generate as gen_mod
    from app.services import history

    def boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(history, "GenerationRun", boom)
    r = gen(api, plan, user["h"], seed=1)
    assert r.status_code == 200 and r.json()["metadata"]["rows_generated"] == 20
    assert gen_mod.record_generation is history.record_generation


# ------------------------------------------------------------------ overview
def test_overview_numbers_come_from_stored_rows(api, user, plan):
    empty = api.get("/api/v1/overview", headers=user["h"]).json()
    assert empty == {"generations": 0, "rows_generated": 0, "passed": 0, "failed": 0, "schemas": 0, "datasets": 0,
                     "last_run": None, "recent": []}
    for i in range(2):
        gen(api, plan, user["h"], seed=i)
    api.post("/api/v1/schemas", json={"name": "S", "plan": plan}, headers=user["h"])
    api.post("/api/v1/datasets", json={"name": "D", "data": {"t": [{"a": 1}]}}, headers=user["h"])
    ov = api.get("/api/v1/overview", headers=user["h"]).json()
    assert (ov["generations"], ov["rows_generated"], ov["passed"], ov["schemas"], ov["datasets"]) == (2, 40, 2, 1, 1)
    assert ov["last_run"]["seed"] == 1 and len(ov["recent"]) == 2


# ------------------------------------------------------------------ schemas
def test_schema_crud(api, user, plan):
    h = user["h"]
    r = api.post("/api/v1/schemas", json={"name": "  Shop   customers ", "description": "demo", "plan": plan}, headers=h)
    assert r.status_code == 201
    s = r.json()
    assert s["name"] == "Shop customers" and s["domain"] == "ecommerce" and s["tables"] == ["customers"] and s["columns"] == 6
    sid = s["id"]
    assert api.get("/api/v1/schemas", headers=h).json()[0]["id"] == sid
    got = api.get(f"/api/v1/schemas/{sid}", headers=h).json()
    assert got["plan"]["tables"][0]["target_rows"] == 20

    p2 = copy.deepcopy(plan)
    p2["tables"][0]["target_rows"] = 99
    up = api.put(f"/api/v1/schemas/{sid}", json={"name": "Renamed", "description": None, "plan": p2}, headers=h)
    assert up.status_code == 200 and up.json()["name"] == "Renamed" and up.json()["description"] is None
    assert up.json()["plan"]["tables"][0]["target_rows"] == 99
    partial = api.put(f"/api/v1/schemas/{sid}", json={"description": "kept name"}, headers=h).json()
    assert partial["name"] == "Renamed" and partial["description"] == "kept name"

    assert api.delete(f"/api/v1/schemas/{sid}", headers=h).status_code == 204
    assert api.get(f"/api/v1/schemas/{sid}", headers=h).status_code == 404


def test_saved_schema_can_generate_without_any_ai(api, user, plan):
    sid = api.post("/api/v1/schemas", json={"name": "S", "plan": plan}, headers=user["h"]).json()["id"]
    saved = api.get(f"/api/v1/schemas/{sid}", headers=user["h"]).json()["plan"]
    r = gen(api, saved, user["h"], seed=5)
    assert r.status_code == 200 and r.json()["validation"]["passed"] and len(r.json()["data"]["customers"]) == 20


def test_schema_validation_and_limit(api, user, plan, monkeypatch):
    h = user["h"]
    bad = copy.deepcopy(plan)
    bad["tables"][0]["foreign_keys"] = [{"column": "name", "references_table": "ghost", "references_column": "id"}]
    assert api.post("/api/v1/schemas", json={"name": "S", "plan": bad}, headers=h).status_code == 422
    assert api.post("/api/v1/schemas", json={"name": "", "plan": plan}, headers=h).status_code == 422
    assert api.post("/api/v1/schemas", json={"name": "S"}, headers=h).status_code == 422
    monkeypatch.setattr(get_settings(), "max_schemas_per_workspace", 2)
    assert api.post("/api/v1/schemas", json={"name": "1", "plan": plan}, headers=h).status_code == 201
    assert api.post("/api/v1/schemas", json={"name": "2", "plan": plan}, headers=h).status_code == 201
    r = api.post("/api/v1/schemas", json={"name": "3", "plan": plan}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "limit_reached"


# ------------------------------------------------------------------ datasets
DATA = {"patients": [{"id": i, "name": f"P{i}"} for i in range(120)], "doctors": [{"id": 1, "name": "D"}]}


def test_dataset_lifecycle(api, user, plan):
    h = user["h"]
    body = {"name": "Hospital", "data": DATA, "plan": plan, "seed": 9, "source_mode": "prompt",
            "validation": {"passed": True, "error_count": 0, "warning_count": 1, "secret": "dropped", "tables": [1]}}
    r = api.post("/api/v1/datasets", json=body, headers=h)
    assert r.status_code == 201
    d = r.json()
    assert d["total_rows"] == 121 and d["size_bytes"] > 1000 and d["seed"] == 9
    assert d["tables"] == [{"name": "patients", "rows": 120, "columns": ["id", "name"]},
                           {"name": "doctors", "rows": 1, "columns": ["id", "name"]}]
    assert d["validation"] == {"passed": True, "error_count": 0, "warning_count": 1}      # only scalar facts are kept
    assert [x["id"] for x in api.get("/api/v1/datasets", headers=h).json()] == [d["id"]]

    detail = api.get(f"/api/v1/datasets/{d['id']}", headers=h).json()
    assert len(detail["preview"]["patients"]) == 50 and len(detail["preview"]["doctors"]) == 1
    assert detail["plan"]["domain"] == "ecommerce"
    full = api.get(f"/api/v1/datasets/{d['id']}/data", headers=h).json()
    assert full == DATA                                    # lossless round trip through gzip storage
    assert api.delete(f"/api/v1/datasets/{d['id']}", headers=h).status_code == 204
    assert api.get(f"/api/v1/datasets/{d['id']}", headers=h).status_code == 404


def test_saved_data_is_stored_compressed(api, user):
    api.post("/api/v1/datasets", json={"name": "D", "data": DATA}, headers=user["h"])
    from sqlalchemy.orm import Session
    from app.db import get_engine
    from app.models.db import SavedDataset
    with Session(get_engine()) as s:
        row = s.query(SavedDataset).one()
        assert row.data_gz[:2] == b"\x1f\x8b" and len(row.data_gz) < row.size_bytes


@pytest.mark.parametrize("data", [{}, {"t": []}, {"t": [{"a": 1}], "u": []}, {"t": [1, 2]}])
def test_invalid_datasets_rejected(api, user, data):
    assert api.post("/api/v1/datasets", json={"name": "D", "data": data}, headers=user["h"]).status_code == 422


def test_dataset_size_and_count_limits(api, user, monkeypatch):
    h = user["h"]
    monkeypatch.setattr(get_settings(), "max_dataset_bytes", 1000)
    r = api.post("/api/v1/datasets", json={"name": "Big", "data": {"t": [{"a": "x" * 50}] * 100}}, headers=h)
    assert r.status_code == 413 and r.json()["error"]["code"] == "dataset_too_large"
    monkeypatch.setattr(get_settings(), "max_dataset_bytes", 1_000_000)
    monkeypatch.setattr(get_settings(), "max_datasets_per_workspace", 1)
    assert api.post("/api/v1/datasets", json={"name": "A", "data": {"t": [{"a": 1}]}}, headers=h).status_code == 201
    r = api.post("/api/v1/datasets", json={"name": "B", "data": {"t": [{"a": 1}]}}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "limit_reached"


# ------------------------------------------------------------------ anonymous workspaces & isolation
PRIVATE = [("get", "/api/v1/history"), ("get", "/api/v1/overview"), ("get", "/api/v1/schemas"),
           ("get", "/api/v1/datasets"), ("delete", "/api/v1/history")]


@pytest.mark.parametrize("method,path", PRIVATE)
def test_saved_work_endpoints_need_a_workspace_id(api, method, path):
    r = getattr(api, method)(path)
    assert r.status_code == 400 and r.json()["error"]["code"] == "workspace_required"


@pytest.mark.parametrize("bad", ["x", "g" * 32, "0" * 31, "0" * 33, "../../etc"])
def test_malformed_workspace_ids_are_rejected(api, bad):
    r = api.get("/api/v1/history", headers={"X-Workspace-Id": bad})
    assert r.status_code == 400 and r.json()["error"]["code"] in ("invalid_workspace", "workspace_required")


def test_the_generator_works_with_no_workspace_and_records_nothing(api, plan):
    assert api.post("/api/v1/generate", json={"plan": plan, "seed": 1}).status_code == 200
    assert api.get(H, headers=workspace_headers()).json()["total"] == 0


def test_workspaces_cannot_see_or_modify_each_others_data(api, user, other, plan):
    a, b = user["h"], other["h"]
    sid = api.post("/api/v1/schemas", json={"name": "Mine", "plan": plan}, headers=a).json()["id"]
    did = api.post("/api/v1/datasets", json={"name": "D", "data": DATA}, headers=a).json()["id"]
    gen(api, plan, a, seed=1)
    rid = api.get(H, headers=a).json()["items"][0]["id"]

    assert api.get("/api/v1/schemas", headers=b).json() == []
    assert api.get("/api/v1/datasets", headers=b).json() == []
    assert api.get(H, headers=b).json()["total"] == 0
    for method, url in [("get", f"/api/v1/schemas/{sid}"), ("put", f"/api/v1/schemas/{sid}"), ("delete", f"/api/v1/schemas/{sid}"),
                        ("get", f"/api/v1/datasets/{did}"), ("get", f"/api/v1/datasets/{did}/data"), ("delete", f"/api/v1/datasets/{did}"),
                        ("get", f"{H}/{rid}"), ("delete", f"{H}/{rid}")]:
        kw = {"json": {"name": "Hijack"}} if method == "put" else {}
        r = getattr(api, method)(url, headers=b, **kw)
        assert r.status_code == 404, (method, url, r.status_code)
    api.delete(H, headers=b)  # clearing another workspace's history must not touch mine
    assert api.get(H, headers=a).json()["total"] == 1
    assert api.get(f"/api/v1/schemas/{sid}", headers=a).json()["name"] == "Mine"
    assert api.get("/api/v1/overview", headers=b).json()["generations"] == 0


def test_work_survives_across_requests_for_the_same_workspace(api, plan):
    h = workspace_headers()
    api.post("/api/v1/schemas", json={"name": "Keep", "plan": plan}, headers=h)
    assert [s["name"] for s in api.get("/api/v1/schemas", headers=dict(h)).json()] == ["Keep"]
