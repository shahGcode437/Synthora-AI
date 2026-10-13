"""HTTP-level errors raised by account/persistence code. Rendered in the standard error envelope."""
from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details, self.headers = status, code, message, details, headers or {}


def not_authenticated(message: str = "Sign in required.") -> ApiError:
    return ApiError(401, "not_authenticated", message, headers={"WWW-Authenticate": "Bearer"})
