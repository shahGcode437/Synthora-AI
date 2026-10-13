"""Opaque bearer session tokens. Only a SHA-256 digest is stored, so a database leak does not leak sessions."""
from __future__ import annotations

import hashlib
import secrets


def new_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)  # 256 bits of entropy
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
