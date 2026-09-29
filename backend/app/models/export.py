from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ExportRequest(BaseModel):
    data: dict[str, list[dict[str, Any]]] = Field(description="Table name -> rows, as returned by /generate")
    format: Literal["csv", "json", "zip"]
    filename: str | None = Field(default=None, max_length=120, description="Base name; sanitized, extension added")
    include_json: bool = Field(default=True, description="zip only: also include data.json")
