from __future__ import annotations

from functools import lru_cache
from pathlib import Path

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

    # --- saved work (anonymous workspaces; no accounts) ---
    # SQLite file next to the code by default (same file whatever directory the server is started from).
    # Render's free disk is ephemeral: set DATABASE_URL to a managed Postgres for data that survives redeploys.
    database_url: str = f"sqlite:///{(Path(__file__).resolve().parent.parent / 'synthora.db').as_posix()}"
    # Apply migrations at startup. None = automatic only for SQLite (local dev); set true for a single Render
    # instance, or leave false and run `alembic upgrade head` as a deploy step (then startup just verifies).
    db_auto_migrate: bool | None = None
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    db_pool_timeout_s: int = Field(default=10, ge=1)
    db_pool_recycle_s: int = Field(default=1800, ge=30)
    db_connect_timeout_s: int = Field(default=10, ge=1)
    max_history_per_workspace: int = Field(default=300, ge=10)
    max_schemas_per_workspace: int = Field(default=50, ge=1)
    max_datasets_per_workspace: int = Field(default=10, ge=1)
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
    def provider_order(self) -> list[str]:
        return [p.strip().lower() for p in self.llm_provider_order.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
