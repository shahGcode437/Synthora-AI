"""Generation Plan contract.

Every AI provider's output is normalized into ``GenerationPlan``. Everything
downstream (generation router, privacy, validation, exports) depends only on
this contract, never on provider-specific output.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    # Unknown keys from an LLM are ignored rather than fatal; enums/types are strict enough.
    model_config = ConfigDict(extra="ignore", use_enum_values=False)


class DataType(str, Enum):
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    DECIMAL = "decimal"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    TIME = "time"
    UUID = "uuid"
    JSON = "json"


class GeneratorStrategy(str, Enum):
    """How a field is produced (Generation Router decides on this, not the LLM router)."""

    FAKER = "faker"  # names, addresses, phones, cities, dates...
    STATISTICAL = "statistical"  # numeric/date distributions
    CATEGORICAL = "categorical"  # weighted choice from allowed values
    DETERMINISTIC_ID = "deterministic_id"  # PKs / sequences / uuids
    FOREIGN_KEY = "foreign_key"  # sampled from parent PK by code
    DERIVED = "derived"  # computed from other columns (email, totals)
    AI_TEXT = "ai_text"  # free text needing an LLM
    CONSTANT = "constant"

    @classmethod
    def _missing_(cls, value):
        # Tolerate common LLM shorthand: "deterministic", "ai", "fk", "faker_provider"...
        aliases = {
            "deterministic": cls.DETERMINISTIC_ID, "id": cls.DETERMINISTIC_ID,
            "sequence": cls.DETERMINISTIC_ID, "ai": cls.AI_TEXT, "llm": cls.AI_TEXT,
            "fk": cls.FOREIGN_KEY, "reference": cls.FOREIGN_KEY, "stat": cls.STATISTICAL,
        }
        return aliases.get(str(value).strip().lower())


class PIIClass(str, Enum):
    NONE = "none"
    DIRECT_IDENTIFIER = "direct_identifier"  # name, email, phone, CNIC
    QUASI_IDENTIFIER = "quasi_identifier"  # city, DOB, zip
    SENSITIVE = "sensitive"  # health, financial, credentials


class PrivacyAction(str, Enum):
    NONE = "none"
    SYNTHESIZE = "synthesize"
    MASK = "mask"
    HASH = "hash"
    KEEP = "keep"


class Cardinality(str, Enum):
    ONE_TO_ONE = "1:1"
    ONE_TO_MANY = "1:N"
    MANY_TO_MANY = "N:N"


class EdgeCaseKind(str, Enum):
    NULL_INJECTION = "null_injection"
    OUTLIER = "outlier"
    RARE_CATEGORY = "rare_category"
    BOUNDARY_VALUE = "boundary_value"
    STATUS_SCENARIO = "status_scenario"  # e.g. failed payments
    CUSTOM = "custom"


class GeneratorSpec(StrictModel):
    strategy: GeneratorStrategy
    generator: str | None = Field(
        default=None,
        description="Concrete generator id, e.g. faker provider 'name' or 'lognormal'.",
    )
    params: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(
        default_factory=list, description="Columns (same table) this field derives from."
    )


class PIIInfo(StrictModel):
    classification: PIIClass = PIIClass.NONE
    privacy_action: PrivacyAction = PrivacyAction.NONE
    reason: str | None = None


class ColumnPlan(StrictModel):
    name: str = Field(min_length=1)
    data_type: DataType
    semantic_type: str = Field(
        description="Meaning of the field, e.g. 'person_name', 'email', 'city', 'signup_date'."
    )
    description: str | None = None
    nullable: bool = True
    is_primary_key: bool = False
    is_unique: bool = False
    allowed_values: list[str] | None = None
    generator: GeneratorSpec
    pii: PIIInfo = Field(default_factory=PIIInfo)
    confidence: float | None = Field(default=None, ge=0, le=1)


class ForeignKey(StrictModel):
    column: str
    references_table: str
    references_column: str


class TablePlan(StrictModel):
    name: str = Field(min_length=1)
    description: str | None = None
    target_rows: int | None = Field(default=None, ge=1)
    columns: list[ColumnPlan] = Field(min_length=1)
    primary_key: list[str] = Field(default_factory=list)
    foreign_keys: list[ForeignKey] = Field(default_factory=list)


class Relationship(StrictModel):
    parent_table: str
    parent_column: str
    child_table: str
    child_column: str
    cardinality: Cardinality = Cardinality.ONE_TO_MANY
    confidence: float | None = Field(default=None, ge=0, le=1)


class BusinessRule(StrictModel):
    id: str
    description: str
    tables: list[str] = Field(default_factory=list)
    expression: str | None = Field(
        default=None, description="Optional machine-checkable form, e.g. 'total = sum(items.price)'."
    )
    severity: Literal["error", "warning"] = "error"


class EdgeCaseRecommendation(StrictModel):
    name: str
    kind: EdgeCaseKind = EdgeCaseKind.CUSTOM
    description: str
    table: str | None = None
    column: str | None = None
    rate: float | None = Field(default=None, ge=0, le=1)
    rationale: str | None = None


class EdgeCaseConfig(StrictModel):
    mode: Literal["none", "ai_recommended", "low", "medium", "high", "custom"] = "ai_recommended"
    null_rate: float | None = Field(default=None, ge=0, le=1)
    outlier_rate: float | None = Field(default=None, ge=0, le=1)
    rare_category_rate: float | None = Field(default=None, ge=0, le=1)
    recommendations: list[EdgeCaseRecommendation] = Field(default_factory=list)


class PrivacyConfig(StrictModel):
    mode: Literal["auto", "safe_default", "none", "custom"] = "auto"


class GenerationPlan(StrictModel):
    plan_version: str = "1.0"
    source_mode: Literal["prompt", "sample"] = "prompt"
    domain: str = Field(min_length=1)
    summary: str | None = None
    locale: str | None = None
    seed: int | None = None
    tables: list[TablePlan] = Field(min_length=1)
    relationships: list[Relationship] = Field(default_factory=list)
    business_rules: list[BusinessRule] = Field(default_factory=list)
    edge_cases: EdgeCaseConfig = Field(default_factory=EdgeCaseConfig)
    privacy: PrivacyConfig = Field(default_factory=PrivacyConfig)
    confidence: float | None = Field(default=None, ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_integrity(self) -> "GenerationPlan":
        """Structural sanity so downstream code can trust the plan."""
        tables = {t.name: t for t in self.tables}
        if len(tables) != len(self.tables):
            raise ValueError("duplicate table names in plan")

        for t in self.tables:
            cols = [c.name for c in t.columns]
            if len(set(cols)) != len(cols):
                raise ValueError(f"duplicate column names in table '{t.name}'")
            colset = set(cols)
            # Derive primary_key from column flags when the provider only set flags.
            if not t.primary_key:
                t.primary_key = [c.name for c in t.columns if c.is_primary_key]
            for pk in t.primary_key:
                if pk not in colset:
                    raise ValueError(f"primary key '{pk}' not a column of '{t.name}'")
            for fk in t.foreign_keys:
                if fk.column not in colset:
                    raise ValueError(f"foreign key column '{fk.column}' not in '{t.name}'")
                parent = tables.get(fk.references_table)
                if parent is None or fk.references_column not in {c.name for c in parent.columns}:
                    raise ValueError(
                        f"foreign key {t.name}.{fk.column} references unknown "
                        f"{fk.references_table}.{fk.references_column}"
                    )
            for c in t.columns:
                for dep in c.generator.depends_on:
                    if dep not in colset:
                        raise ValueError(f"'{t.name}.{c.name}' depends on unknown column '{dep}'")

        for r in self.relationships:
            for tbl, col in ((r.parent_table, r.parent_column), (r.child_table, r.child_column)):
                if tbl not in tables or col not in {c.name for c in tables[tbl].columns}:
                    raise ValueError(f"relationship references unknown {tbl}.{col}")
        return self
