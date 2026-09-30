"""CORS: the deployed Vercel frontend and local dev may call the API; nobody else, and never via a wildcard."""
import pytest
from fastapi.testclient import TestClient

from app.config import BUILTIN_CORS_ORIGINS, Settings
from app.main import app

VERCEL = "https://synthora-ai-nine.vercel.app"
client = TestClient(app)


def preflight(origin: str, path: str = "/api/v1/analyze"):
    return client.options(path, headers={
        "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})


@pytest.mark.parametrize("origin", [VERCEL, "http://localhost:5173", "http://127.0.0.1:5173"])
def test_allowed_origins_preflight_and_simple_requests(origin):
    r = preflight(origin)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin        # echoed exactly, never "*"
    assert r.headers["access-control-allow-credentials"] == "true"
    assert "POST" in r.headers["access-control-allow-methods"]
    h = client.get("/health", headers={"Origin": origin})              # what the "API Online" check does
    assert h.status_code == 200 and h.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", [
    "https://evil.example.com", "https://synthora-ai-nine.vercel.app.evil.com", "http://synthora-ai-nine.vercel.app",
    "https://other-app.vercel.app",
])
def test_other_origins_are_not_allowed(origin):
    assert "access-control-allow-origin" not in preflight(origin).headers
    assert "access-control-allow-origin" not in client.get("/health", headers={"Origin": origin}).headers


def test_export_filename_header_is_readable_cross_origin():
    r = client.post("/api/v1/export", headers={"Origin": VERCEL},
                    json={"data": {"t": [{"a": 1}]}, "format": "csv"})
    assert r.headers["access-control-allow-origin"] == VERCEL
    assert "Content-Disposition" in r.headers["access-control-expose-headers"]


def test_builtin_origins_survive_an_env_var_that_only_lists_localhost():
    s = Settings(_env_file=None, cors_origins="http://localhost:5173,http://localhost:3000")
    assert set(BUILTIN_CORS_ORIGINS) <= set(s.cors_origin_list) and "http://localhost:3000" in s.cors_origin_list


def test_env_extras_are_normalized_deduplicated_and_never_wildcard():
    s = Settings(_env_file=None, cors_origins=" https://preview.example.com/ , https://synthora-ai-nine.vercel.app/ ,*, ")
    origins = s.cors_origin_list
    assert "https://preview.example.com" in origins           # trailing slash stripped
    assert origins.count(VERCEL) == 1 and "*" not in origins  # deduplicated; wildcard ignored (credentials are on)
    assert Settings(_env_file=None, cors_origins="").cors_origin_list == list(BUILTIN_CORS_ORIGINS)
