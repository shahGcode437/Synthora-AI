"""Shared state for one generation run."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from faker import Faker
from faker.config import AVAILABLE_LOCALES

from app.generation.locale_packs import PACKS, Provider
from app.models.generation import EdgeCaseApplied
from app.models.plan import ColumnPlan, GenerationPlan, TablePlan


class GenerationError(Exception):
    """Unrecoverable generation problem (bad input, limits)."""


@dataclass
class DerivedMeta:
    table: str
    column: str
    kind: str  # running_balance | total | email | template
    info: dict[str, Any] = field(default_factory=dict)


def make_faker(locale: str | None, seed: int) -> tuple[Faker, str, dict[str, Provider] | None, str | None]:
    """Return (faker, faker_locale, locale_pack, warning). Never raises on unknown locales."""
    warning = None
    chosen = "en_US"
    if locale:
        norm = locale.replace("-", "_")
        if norm in AVAILABLE_LOCALES:
            chosen = norm
        else:
            warning = f"Faker has no locale '{locale}'; fell back to en_US"
            if locale in PACKS:
                warning += f" with built-in {locale} value pools for names, cities and phones"
    fk = Faker(chosen)
    fk.seed_instance(seed)
    pack = PACKS.get(locale or "")  # curated pools win over Faker where we have them
    return fk, chosen, pack, warning


@dataclass
class GenContext:
    plan: GenerationPlan
    seed: int
    rng: random.Random
    np_rng: np.random.Generator
    faker: Faker
    faker_locale: str
    pack: dict[str, Provider] | None
    warnings: list[str] = field(default_factory=list)
    rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    derived_meta: list[DerivedMeta] = field(default_factory=list)
    edge_log: list[EdgeCaseApplied] = field(default_factory=list)

    def warn(self, msg: str) -> None:
        if msg not in self.warnings:
            self.warnings.append(msg)

    def table(self, name: str) -> TablePlan | None:
        return next((t for t in self.plan.tables if t.name == name), None)

    def resolve_fk(self, table: TablePlan, col: ColumnPlan) -> tuple[str, str] | None:
        """Find the (parent_table, parent_column) a column references."""
        for fk in table.foreign_keys:
            if fk.column == col.name:
                return fk.references_table, fk.references_column
        for r in self.plan.relationships:
            if r.child_table == table.name and r.child_column == col.name:
                return r.parent_table, r.parent_column
        p = col.generator.params
        if p.get("table") and p.get("column"):
            return str(p["table"]), str(p["column"])
        return None

    def fk_columns(self, table: TablePlan) -> set[str]:
        cols = {fk.column for fk in table.foreign_keys}
        cols |= {r.child_column for r in self.plan.relationships if r.child_table == table.name}
        return cols
