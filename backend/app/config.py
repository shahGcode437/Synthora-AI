from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Always allowed, regardless of the CORS_ORIGINS env var: the deployed frontend and local dev.
# (An env var that only lists localhost - e.g. copied from .env.example - must not lock out production.)
BUILTIN_CORS_ORIGINS = (
    "https://synthora-ai-nine.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

    llm_provider_order: str = "gemini,openai,qwen,xai"
    llm_timeout_seconds: float = 25
    llm_max_retries_per_provider: int = Field(default=1, ge=0, le=3)

    gemini_api_key: str = ""
    openai_api_key: str = ""
    xai_api_key: str = ""
    groq_api_key: str = ""
    qwen_api_key: str = ""
    qwen_base_url: str = ""

    # --- accounts & persistence ---
    # SQLite by default. Render's free disk is ephemeral: set DATABASE_URL to a managed Postgres for durable data.
    database_url: str = "sqlite:///./synthora.db"
    # Apply migrations at startup. None = automatic only for SQLite (local dev); set true for a single Render
    # instance, or leave false and run `alembic upgrade head` as a deploy step (then startup just verifies).
    db_auto_migrate: bool | None = None
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    db_pool_timeout_s: int = Field(default=10, ge=1)
    db_pool_recycle_s: int = Field(default=1800, ge=30)  # below typical proxy/server idle timeouts
    db_connect_timeout_s: int = Field(default=10, ge=1)
    session_ttl_days: int = Field(default=7, ge=1, le=90)
    # Browser sessions use an HttpOnly cookie. "lax" suits a frontend served from the same site as the API (via a
    # Vercel rewrite or a shared parent domain); "none" is for a genuinely cross-site API and forces Secure.
    session_cookie_name: str = "synthora_session"
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_cookie_secure: bool | None = None  # None = Secure whenever the request arrived over https
    session_cookie_domain: str = ""  # empty = host-only cookie
    # Where rate-limit counters live. auto = database when DATABASE_URL is not SQLite (shared by every instance).
    rate_limit_backend: Literal["auto", "memory", "database"] = "auto"
    google_client_id: str = ""  # public OAuth client id (audience of the Google ID token)
    auth_required_for_ai: bool = False  # when true, analyze/generate/export need a signed-in user
    trust_proxy: bool = False  # use X-Forwarded-For for rate limiting (set true behind Render/other proxies)
    rate_limit_enabled: bool = True
    max_history_per_user: int = Field(default=300, ge=10)
    max_schemas_per_user: int = Field(default=50, ge=1)
    max_datasets_per_user: int = Field(default=10, ge=1)
    max_dataset_bytes: int = Field(default=10_000_000, ge=100_000)

    gemini_model: str = ""
    openai_model: str = ""
    xai_model: str = ""
    groq_model: str = ""
    qwen_model: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        """Built-in origins plus CORS_ORIGINS extras. Trailing slashes are stripped (browsers send none);
        a wildcard is ignored because credentials are enabled."""
        extra = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        return list(dict.fromkeys([*BUILTIN_CORS_ORIGINS, *(o for o in extra if o != "*")]))

    @property
    def sqlalchemy_url(self) -> str:
        """Normalize provider-style URLs (postgres://, postgresql://) to the psycopg3 driver."""
        url = self.database_url.strip()
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_url.startswith("sqlite")

    @property
    def auto_migrate(self) -> bool:
        return self.is_sqlite if self.db_auto_migrate is None else self.db_auto_migrate

    @property
    def uses_database_rate_limit(self) -> bool:
        return self.rate_limit_backend == "database" or (self.rate_limit_backend == "auto" and not self.is_sqlite)

    @property
    def provider_order(self) -> list[str]:
        return [p.strip().lower() for p in self.llm_provider_order.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
