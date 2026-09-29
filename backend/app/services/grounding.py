"""Ground an AI-produced plan in the deterministic CSV profile.

AI decides meaning (semantic types, PII, strategy hints, rules, edge cases).
Code decides facts: dtypes, category frequencies, numeric stats, date ranges,
null rates, identifier formats. Source values are never copied into the plan
except category labels of non-identifier, non-PII columns.
"""
from __future__ import annotations

from app.models.plan import (
    ColumnPlan, DataType, GenerationPlan, GeneratorSpec, GeneratorStrategy, PIIClass, PIIInfo,
    PrivacyAction, TablePlan,
)
from app.models.profile import ColumnProfile, DatasetProfile

_DERIVABLE = ("email", "balance", "total")
_DTYPE = {"string": DataType.STRING, "integer": DataType.INTEGER, "float": DataType.FLOAT,
          "boolean": DataType.STRING, "date": DataType.DATE, "datetime": DataType.DATETIME}


class Grounder:
    def __init__(self, profile: DatasetProfile, instruction: str | None, target_rows: int):
        self.profile = profile
        self.target_rows = target_rows
        self.notes: list[str] = []
        self.warnings: list[str] = []
        self.preserved_categories: list[str] = []
        self.text = (instruction or "").lower()

    # ------------------------------------------------------------ helpers
    def _stub(self, p: ColumnProfile) -> ColumnPlan:
        self.warnings.append(f"AI plan did not describe source column '{p.name}'; used a profile-derived default.")
        return ColumnPlan(
            name=p.name, data_type=_DTYPE[p.dtype], semantic_type=p.name.lower(),
            description=f"Source column '{p.name}'.",
            generator=GeneratorSpec(strategy=GeneratorStrategy.FAKER),
        )

    def _mentioned(self, value: str, rec_text: str) -> bool:
        v = value.lower()
        return v in self.text or v in rec_text

    # ------------------------------------------------------------ per column
    def column(self, ai: ColumnPlan | None, p: ColumnProfile, rec_text: str, source_names: set[str]) -> ColumnPlan:
        col = ai or self._stub(p)
        orig_type = ai.data_type if ai else None
        orig_values = list(ai.allowed_values or []) if ai and ai.allowed_values else []
        col.name = p.name
        col.description = col.description or f"Source column '{p.name}'."
        col.allowed_values = None
        params: dict = {}
        is_unique = False

        # local PII hint upgrades an AI miss
        if p.pii_hint and col.pii.classification == PIIClass.NONE and not p.is_identifier:
            col.pii = PIIInfo(classification=PIIClass.DIRECT_IDENTIFIER, privacy_action=PrivacyAction.SYNTHESIZE,
                              reason=f"detected locally: {p.pii_hint}")
            self.notes.append(f"'{p.name}' classified as PII from local detection ({p.pii_hint}).")
        direct = col.pii.classification == PIIClass.DIRECT_IDENTIFIER or bool(p.pii_hint)
        ai_strategy = col.generator.strategy
        gen_name = col.generator.generator
        deps = [d for d in col.generator.depends_on if d in source_names and d != p.name]

        col.data_type = _DTYPE[p.dtype]
        if p.id_pattern and p.id_pattern.get("kind") == "uuid":
            col.data_type = DataType.UUID
        col.nullable = p.null_count > 0
        col.is_primary_key = False

        derivable = ai_strategy == GeneratorStrategy.DERIVED and deps and (
            "template" in col.generator.params
            or any(t in f"{col.semantic_type} {p.name} {gen_name or ''}".lower() for t in _DERIVABLE))

        if p.is_identifier:                                   # unique id column
            spec = p.id_pattern or {}
            params = {k: spec[k] for k in ("prefix", "width", "start") if k in spec}
            strategy, gen_name = GeneratorStrategy.DETERMINISTIC_ID, ("uuid4" if spec.get("kind") == "uuid" else "sequence")
            is_unique = True
            col.pii = PIIInfo()
        elif p.id_repeat:                                     # repeated id-like column (e.g. account_id)
            spec = dict(p.id_pattern or {"kind": "prefixed", "prefix": "ID-", "width": 4, "start": 1})
            if not p.id_pattern:
                self.warnings.append(f"'{p.name}' repeats but has no regular id format; generated as ID-0001 style codes.")
            unique = p.unique_count
            spec["size"] = max(1, round(unique * self.target_rows / max(1, self.profile.total_rows)))
            # start past the source's range so no real entity id is reused
            if spec.get("kind") == "integer":
                spec["start"] = int(p.max or 0) + 1
            elif spec.get("kind") == "prefixed":
                spec["start"] = int(spec.get("start", 1)) + 10 ** int(spec.get("width", 4))
            params = {"synthetic_pool": spec}
            if spec["size"] == unique and len(p.rank_counts) == unique:
                params["weights"] = [c / sum(p.rank_counts) for c in p.rank_counts]
            strategy, gen_name = GeneratorStrategy.CATEGORICAL, None
            col.pii = PIIInfo()
            self.notes.append(f"'{p.name}' is a repeating identifier: {spec['size']} new synthetic ids, source ids not reused.")
        elif derivable:
            strategy = GeneratorStrategy.DERIVED
            col.generator.depends_on = deps
            params = dict(col.generator.params)
            is_unique = p.unique_ratio == 1 and p.row_count > 1
        elif p.is_categorical and not direct and p.top_values:
            values = [v.value for v in p.top_values]
            weights = {v.value: round(v.pct / 100, 6) for v in p.top_values}
            for v in orig_values:
                if v not in weights and self._mentioned(str(v), rec_text):
                    values.append(v)
                    weights[v] = 0.0
                    self.notes.append(f"'{p.name}': added value '{v}' (requested) with 0 baseline weight for edge cases.")
            col.allowed_values = values
            params = {"weights": weights}
            strategy, gen_name = GeneratorStrategy.CATEGORICAL, None
            self.preserved_categories.append(p.name)
        elif p.is_numeric and not direct:
            strategy, gen_name, params = GeneratorStrategy.STATISTICAL, *self._numeric(p)
            if p.dtype == "float" and orig_type == DataType.DECIMAL:
                col.data_type = DataType.DECIMAL
        elif p.is_date:
            strategy = GeneratorStrategy.FAKER
            gen_name = "date_between" if p.dtype == "date" else "date_time_between"
            params = {"start_date": p.date_min, "end_date": p.date_max}
        else:                                                 # free text / PII / high-cardinality strings
            keep = ai_strategy in (GeneratorStrategy.FAKER, GeneratorStrategy.AI_TEXT)
            strategy = ai_strategy if keep else GeneratorStrategy.FAKER
            gen_name = gen_name if keep else None
            params = dict(col.generator.params) if keep else {}
            is_unique = p.candidate_primary_key and p.row_count > 1
            if not keep:
                self.warnings.append(f"'{p.name}': AI strategy '{ai_strategy.value}' does not fit a text column; used Faker.")

        if p.null_pct > 0 and strategy != GeneratorStrategy.DETERMINISTIC_ID:
            params["null_rate"] = round(p.null_pct / 100, 4)
        col.is_unique = is_unique
        col.generator = GeneratorSpec(strategy=strategy, generator=gen_name, params=params,
                                      depends_on=deps if strategy == GeneratorStrategy.DERIVED else [])
        return col

    @staticmethod
    def _numeric(p: ColumnProfile) -> tuple[str, dict]:
        lo, hi = p.min, p.max
        if lo == hi:
            return "uniform", {"min": lo, "max": hi}
        if p.log_mean is not None and p.median and p.mean and p.mean > 1.25 * p.median:
            return "lognormal", {"mean": p.log_mean, "sigma": max(p.log_std or 0.0, 1e-6), "min": lo, "max": hi}
        return "normal", {"mean": p.mean, "std": max(p.std or 0.0, 1e-9), "min": lo, "max": hi}


def ground_plan(plan: GenerationPlan, profile: DatasetProfile, instruction: str | None, target_rows: int) -> tuple[GenerationPlan, list[str]]:
    """Return the grounded plan plus warnings. Mutates and returns ``plan``."""
    g = Grounder(profile, instruction, target_rows)
    source_names = {c.name for c in profile.columns}

    ai_table = max(plan.tables, key=lambda t: len({c.name for c in t.columns} & source_names))
    if len(plan.tables) > 1:
        g.warnings.append("Sample mode supports a single table; extra tables proposed by the AI were dropped.")
    ai_cols = {c.name: c for c in ai_table.columns}
    extra = sorted(set(ai_cols) - source_names)
    if extra:
        g.warnings.append(f"AI proposed columns not present in the CSV and they were dropped: {extra}")

    rec_text = " ".join(
        f"{r.name} {r.description} {r.rationale or ''}" for r in plan.edge_cases.recommendations).lower()
    columns = [g.column(ai_cols.get(p.name), p, rec_text, source_names) for p in profile.columns]

    pk = next((c.name for c in columns if ai_cols.get(c.name) and ai_cols[c.name].is_primary_key
               and c.generator.strategy == GeneratorStrategy.DETERMINISTIC_ID), None) \
        or next((c.name for c in columns if c.generator.strategy == GeneratorStrategy.DETERMINISTIC_ID), None)
    if pk:
        next(c for c in columns if c.name == pk).is_primary_key = True
        next(c for c in columns if c.name == pk).nullable = False
    else:
        g.warnings.append("No unique identifier column found; the table has no primary key.")

    plan.tables = [TablePlan(
        name=profile.table_name, description=ai_table.description, target_rows=target_rows,
        columns=columns, primary_key=[pk] if pk else [], foreign_keys=[],
    )]
    plan.relationships = []
    for rule in plan.business_rules:
        rule.tables = [profile.table_name]
    keep_recs = []
    for r in plan.edge_cases.recommendations:
        if r.column in source_names or r.column is None:
            r.table = profile.table_name
            keep_recs.append(r)
        else:
            g.warnings.append(f"Edge case '{r.name}' targets unknown column '{r.column}' and was dropped.")
    plan.edge_cases.recommendations = keep_recs
    plan.edge_cases.null_rate = None  # source null behaviour lives in per-column null_rate params

    if g.preserved_categories:
        g.notes.append(f"Category frequencies preserved from the source for: {g.preserved_categories}.")
    g.notes.append(f"Numeric ranges/statistics, date ranges and null rates were taken from the source profile "
                   f"({profile.total_rows} source rows); generating {target_rows} rows.")
    plan.assumptions = list(dict.fromkeys(plan.assumptions + g.notes))
    plan.warnings = list(dict.fromkeys(plan.warnings + g.warnings))
    plan.source_mode = "sample"
    return plan, g.warnings


def apply_privacy_mode(plan: GenerationPlan, mode: str) -> list[str]:
    """Adjust planned privacy actions to the user's privacy_mode. Returns warnings."""
    warnings: list[str] = []
    cols = [c for t in plan.tables for c in t.columns]
    for c in cols:
        if mode == "none":
            c.pii.privacy_action = PrivacyAction.NONE
        elif mode in ("auto", "safe_default") and c.pii.classification in (PIIClass.DIRECT_IDENTIFIER, PIIClass.SENSITIVE):
            if c.pii.privacy_action in (PrivacyAction.NONE, PrivacyAction.KEEP):
                c.pii.privacy_action = PrivacyAction.SYNTHESIZE
    if mode == "none":
        warnings.append("privacy_mode=none: no privacy actions planned. Generated values are still newly synthesized, never copied from the source.")
    if any(c.pii.privacy_action in (PrivacyAction.MASK, PrivacyAction.HASH, PrivacyAction.KEEP) for c in cols):
        warnings.append("mask/hash/keep privacy actions are recorded in the plan, but the generation engine currently always "
                        "synthesizes new values; no source value is copied.")
    return warnings
