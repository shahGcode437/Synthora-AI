"""Anonymous workspaces: no accounts, no login.

Each browser creates a random 128-bit workspace id and sends it in `X-Workspace-Id`. Saved schemas, datasets and
generation history belong to that id, so people sharing one deployment do not see each other's saved work by
default. The id is an unguessable identifier, not a login: anyone who has it can read that workspace, so it is
not a security boundary for sensitive data. Generation itself (analyze / generate / export) needs no id at all.
"""
from __future__ import annotations

import re

from fastapi import Request

from app.errors import ApiError

HEADER = "x-workspace-id"
_ID = re.compile(r"^[0-9a-f]{32}$")


def optional_workspace(request: Request) -> str | None:
    value = request.headers.get(HEADER, "").strip().lower()
    if not value:
        return None
    if not _ID.match(value):
        raise ApiError(400, "invalid_workspace", "X-Workspace-Id must be a 32-character hexadecimal id.")
    return value


def current_workspace(request: Request) -> str:
    ws = optional_workspace(request)
    if ws is None:
        raise ApiError(400, "workspace_required", "Send your workspace id in the X-Workspace-Id header.")
    return ws
