from functools import lru_cache

from app.ai.providers import build_providers
from app.ai.router import LLMRouter
from app.config import get_settings


@lru_cache
def get_llm_router() -> LLMRouter:
    s = get_settings()
    return LLMRouter(build_providers(s), s.llm_timeout_seconds, s.llm_max_retries_per_provider)
