class AIError(Exception):
    """Base class for AI-layer failures."""


class ProviderNotConfiguredError(AIError):
    """No LLM provider is configured/available to handle the request."""


class ProviderCallError(AIError):
    """A single provider call failed (network, timeout, rate limit, 5xx...)."""


class InvalidStructuredOutputError(AIError):
    """Provider answered but the output was not a valid instance of the response schema."""


class AllProvidersFailedError(AIError):
    def __init__(self, attempts: list[str]):
        self.attempts = attempts
        super().__init__("All configured AI providers failed: " + "; ".join(attempts))
