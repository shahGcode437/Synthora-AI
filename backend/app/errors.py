"""HTTP-level errors raised by persistence code. Rendered in the standard error envelope."""
from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details, self.headers = status, code, message, details, headers or {}
