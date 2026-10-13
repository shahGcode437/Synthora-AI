// History, saved schemas and saved datasets of this browser's anonymous workspace (no account; see docs/DATABASE_SETUP.md).
import { TIMEOUT, send } from "./client";
import type { GeneratedData, GenerationPlan } from "./types";

export interface RunSummary {
  id: string; created_at: string; source_mode: string; domain: string; data_type: "tabular" | "relational";
  tables: number; rows: number; seed: number; duration_ms: number;
  validation_passed: boolean; error_count: number; warning_count: number; settings: Record<string, unknown>;
}
export interface RunDetail extends RunSummary { plan: GenerationPlan }
export interface HistoryPage { items: RunSummary[]; total: number }
export interface Overview {
  generations: number; rows_generated: number; passed: number; failed: number; schemas: number; datasets: number;
  last_run: RunSummary | null; recent: RunSummary[];
}

export interface SchemaSummary {
  id: string; name: string; description: string | null; domain: string; tables: string[]; columns: number;
  source_mode: string; created_at: string; updated_at: string;
}
export interface SchemaDetail extends SchemaSummary { plan: GenerationPlan }

export interface DatasetTableMeta { name: string; rows: number; columns: string[] }
export interface DatasetSummary {
  id: string; name: string; created_at: string; source_mode: string | null; seed: number | null;
  tables: DatasetTableMeta[]; total_rows: number; size_bytes: number;
  validation: { passed?: boolean; error_count?: number; warning_count?: number } | null;
}
export interface DatasetDetail extends DatasetSummary { plan: GenerationPlan | null; preview: GeneratedData }

const json = async <T>(p: string, init?: RequestInit): Promise<T> => (await send(p, init ?? {}, TIMEOUT.library)).json();
const body = (method: string, data?: unknown): RequestInit => ({
  method, headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});
const none = async (p: string, init: RequestInit): Promise<void> => { await send(p, init, TIMEOUT.library); };

export const history = {
  list: (p: { limit?: number; offset?: number; status?: "all" | "passed" | "failed" } = {}) => {
    const q = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return json<HistoryPage>(`/api/v1/history?${q}`);
  },
  get: (id: string) => json<RunDetail>(`/api/v1/history/${id}`),
  remove: (id: string) => none(`/api/v1/history/${id}`, body("DELETE")),
  clear: () => none("/api/v1/history", body("DELETE")),
  overview: () => json<Overview>("/api/v1/overview"),
};

export const schemas = {
  list: () => json<SchemaSummary[]>("/api/v1/schemas"),
  get: (id: string) => json<SchemaDetail>(`/api/v1/schemas/${id}`),
  create: (d: { name: string; description?: string | null; plan: GenerationPlan }) => json<SchemaDetail>("/api/v1/schemas", body("POST", d)),
  update: (id: string, d: { name?: string; description?: string | null; plan?: GenerationPlan }) => json<SchemaDetail>(`/api/v1/schemas/${id}`, body("PUT", d)),
  remove: (id: string) => none(`/api/v1/schemas/${id}`, body("DELETE")),
};

export const datasets = {
  list: () => json<DatasetSummary[]>("/api/v1/datasets"),
  get: (id: string) => json<DatasetDetail>(`/api/v1/datasets/${id}`),
  data: (id: string) => json<GeneratedData>(`/api/v1/datasets/${id}/data`),
  create: (d: { name: string; data: GeneratedData; plan?: GenerationPlan | null; validation?: unknown; seed?: number | null; source_mode?: "prompt" | "sample" | null }) =>
    json<DatasetSummary>("/api/v1/datasets", body("POST", d)),
  remove: (id: string) => none(`/api/v1/datasets/${id}`, body("DELETE")),
};
