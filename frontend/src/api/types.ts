// Mirrors the backend Pydantic models (see docs/API_CONTRACT.md). Responses always contain every field.

export type DataType =
  | "string" | "integer" | "float" | "decimal" | "boolean" | "date" | "datetime" | "time" | "uuid" | "json";
export type GeneratorStrategy =
  | "faker" | "statistical" | "categorical" | "deterministic_id" | "foreign_key" | "derived" | "ai_text" | "constant";
export type PIIClass = "none" | "direct_identifier" | "quasi_identifier" | "sensitive";
export type PrivacyAction = "none" | "synthesize" | "mask" | "hash" | "keep";
export type Cardinality = "1:1" | "1:N" | "N:N";
export type EdgeCaseKind =
  | "null_injection" | "outlier" | "rare_category" | "boundary_value" | "status_scenario" | "custom";
export type EdgeCaseMode = "none" | "ai_recommended" | "low" | "medium" | "high" | "custom";
export type PrivacyMode = "auto" | "safe_default" | "none" | "custom";

export interface GeneratorSpec {
  strategy: GeneratorStrategy;
  generator: string | null;
  params: Record<string, unknown>;
  depends_on: string[];
}
export interface PIIInfo {
  classification: PIIClass;
  privacy_action: PrivacyAction;
  reason: string | null;
}
export interface ColumnPlan {
  name: string;
  data_type: DataType;
  semantic_type: string;
  description: string | null;
  nullable: boolean;
  is_primary_key: boolean;
  is_unique: boolean;
  allowed_values: string[] | null;
  generator: GeneratorSpec;
  pii: PIIInfo;
  confidence: number | null;
}
export interface ForeignKey {
  column: string;
  references_table: string;
  references_column: string;
}
export interface TablePlan {
  name: string;
  description: string | null;
  target_rows: number | null;
  columns: ColumnPlan[];
  primary_key: string[];
  foreign_keys: ForeignKey[];
}
export interface Relationship {
  parent_table: string;
  parent_column: string;
  child_table: string;
  child_column: string;
  cardinality: Cardinality;
  confidence: number | null;
}
export interface BusinessRule {
  id: string;
  description: string;
  tables: string[];
  expression: string | null;
  severity: "error" | "warning";
}
export interface EdgeCaseRecommendation {
  name: string;
  kind: EdgeCaseKind;
  description: string;
  table: string | null;
  column: string | null;
  rate: number | null;
  rationale: string | null;
}
export interface EdgeCaseConfig {
  mode: EdgeCaseMode;
  null_rate: number | null;
  outlier_rate: number | null;
  rare_category_rate: number | null;
  recommendations: EdgeCaseRecommendation[];
}
export interface PrivacyConfig {
  mode: PrivacyMode;
}
export interface GenerationPlan {
  plan_version: string;
  source_mode: "prompt" | "sample";
  domain: string;
  summary: string | null;
  locale: string | null;
  seed: number | null;
  tables: TablePlan[];
  relationships: Relationship[];
  business_rules: BusinessRule[];
  edge_cases: EdgeCaseConfig;
  privacy: PrivacyConfig;
  confidence: number | null;
  warnings: string[];
  assumptions: string[];
}

export interface AIRunMeta {
  provider: string;
  model: string | null;
  latency_ms: number;
  fallbacks: number;
}
export interface AnalyzeResponse {
  plan: GenerationPlan;
  ai: AIRunMeta;
}

export interface ValueFreq {
  value: string;
  count: number;
  pct: number;
}
export type ProfileDtype = "string" | "integer" | "float" | "boolean" | "date" | "datetime";
export interface ColumnProfile {
  name: string;
  dtype: ProfileDtype;
  row_count: number;
  null_count: number;
  null_pct: number;
  unique_count: number;
  unique_ratio: number;
  sample_values: string[];
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  quantiles: Record<string, number> | null;
  log_mean: number | null;
  log_std: number | null;
  top_values: ValueFreq[];
  date_min: string | null;
  date_max: string | null;
  date_format: string | null;
  str_len: Record<string, number> | null;
  is_categorical: boolean;
  is_numeric: boolean;
  is_date: boolean;
  is_identifier: boolean;
  id_like_name: boolean;
  candidate_primary_key: boolean;
  id_pattern: Record<string, unknown> | null;
  id_repeat: Record<string, number> | null;
  pattern_hints: string[];
  pii_hint: string | null;
}
export interface DatasetProfile {
  table_name: string;
  total_rows: number;
  total_columns: number;
  delimiter: string;
  columns: ColumnProfile[];
  likely_identifiers: string[];
  likely_categorical: string[];
  likely_numeric: string[];
  likely_date: string[];
  likely_pii: string[];
  warnings: string[];
}
export interface SampleAnalyzeResponse {
  plan: GenerationPlan;
  ai: AIRunMeta;
  profile: DatasetProfile;
  sample_rows: Record<string, unknown>[];
  warnings: string[];
}

export type CheckStatus = "passed" | "warning" | "error" | "skipped";
export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  count: number | null;
  examples: string[];
}
export interface TableValidation {
  table: string;
  rows: number;
  passed: boolean;
  checks: CheckResult[];
}
export interface ValidationReport {
  passed: boolean;
  error_count: number;
  warning_count: number;
  tables: TableValidation[];
  rules: CheckResult[];
}
export interface EdgeCaseApplied {
  table: string;
  column: string;
  kind: string;
  rows_affected: number;
  detail: string | null;
}
export interface GenerationMetadata {
  tables_generated: number;
  rows_generated: number;
  rows_per_table: Record<string, number>;
  generation_order: string[];
  seed: number;
  seed_source: "request" | "plan" | "random";
  locale: string | null;
  faker_locale: string;
  edge_cases_applied: EdgeCaseApplied[];
  duration_ms: number;
}
export type GeneratedData = Record<string, Record<string, unknown>[]>;
export interface GenerateResponse {
  data: GeneratedData;
  validation: ValidationReport;
  warnings: string[];
  metadata: GenerationMetadata;
}

// ---- requests
export interface AnalyzeRequest {
  mode: "prompt" | "sample";
  prompt?: string | null;
  target_rows?: number | null;
  locale?: string | null;
  edge_case_mode?: EdgeCaseMode;
  privacy_mode?: PrivacyMode;
  seed?: number | null;
}
export type ExportFormat = "csv" | "json" | "zip";

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}
