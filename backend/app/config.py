from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    gemini_model: str = ""
    openai_model: str = ""
    xai_model: str = ""
    groq_model: str = ""
    qwen_model: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def provider_order(self) -> list[str]:
        return [p.strip().lower() for p in self.llm_provider_order.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
