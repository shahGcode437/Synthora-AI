"""Provider registry.

Add an adapter (OpenAI/Qwen/Grok next) class implementing ``BaseLLMProvider`` and register a factory
here; the router, services and API need no changes.
"""
from __future__ import annotations

import logging
from collections.abc import Callable

from app.ai.base import BaseLLMProvider
from app.ai.gemini import create_gemini_provider
from app.config import Settings

logger = logging.getLogger(__name__)

# provider id -> factory(settings) returning a provider, or None if not configured (no key/model).
PROVIDER_FACTORIES: dict[str, Callable[[Settings], BaseLLMProvider | None]] = {
    "gemini": create_gemini_provider,
}


def build_providers(settings: Settings) -> list[BaseLLMProvider]:
    providers: list[BaseLLMProvider] = []
    for name in settings.provider_order:
        factory = PROVIDER_FACTORIES.get(name)
        if factory is None:
            logger.debug("No adapter implemented for provider '%s'; skipping", name)
            continue
        provider = factory(settings)
        if provider is not None:
            providers.append(provider)
    return providers
