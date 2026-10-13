// History, saved schemas and saved datasets of this browser's anonymous workspace (no account; see docs/DATABASE_SETUP.md).
import { ApiError, TIMEOUT, send } from "./client";
import { localDatasets, localHistory, localSchemas } from "./localLibrary";
import type { GeneratedData, GenerateResponse, GenerationPlan } from "./types";

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

const remoteHistory = {
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

const remoteSchemas = {
  list: () => json<SchemaSummary[]>("/api/v1/schemas"),
  get: (id: string) => json<SchemaDetail>(`/api/v1/schemas/${id}`),
  create: (d: { name: string; description?: string | null; plan: GenerationPlan }) => json<SchemaDetail>("/api/v1/schemas", body("POST", d)),
  update: (id: string, d: { name?: string; description?: string | null; plan?: GenerationPlan }) => json<SchemaDetail>(`/api/v1/schemas/${id}`, body("PUT", d)),
  remove: (id: string) => none(`/api/v1/schemas/${id}`, body("DELETE")),
};

const remoteDatasets = {
  list: () => json<DatasetSummary[]>("/api/v1/datasets"),
  get: (id: string) => json<DatasetDetail>(`/api/v1/datasets/${id}`),
  data: (id: string) => json<GeneratedData>(`/api/v1/datasets/${id}/data`),
  create: (d: { name: string; data: GeneratedData; plan?: GenerationPlan | null; validation?: unknown; seed?: number | null; source_mode?: "prompt" | "sample" | null }) =>
    json<DatasetSummary>("/api/v1/datasets", body("POST", d)),
  remove: (id: string) => none(`/api/v1/datasets/${id}`, body("DELETE")),
};

// ---- server first, browser storage when the server has no saved-work endpoints --------------------------------------
// A backend that predates saved work answers these routes with a plain 404. Then everything is kept in this browser
// instead (see localLibrary.ts), so Overview, Schemas, Datasets and History keep working on any deployment.
type Mode = "unknown" | "server" | "local";
let mode: Mode = "unknown";
/** Where saved work currently lives: the server, this browser, or not known yet. */
export const libraryMode = (): Mode => mode;

const missing = (e: unknown) => e instanceof ApiError && e.status === 404 && e.code === "http_error";
async function route<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
  if (mode === "local") return local();
  try { const r = await remote(); mode = "server"; return r; }
  catch (e) { if (missing(e)) { mode = "local"; return local(); } throw e; }
}

export const history = {
  list: (p: Parameters<typeof remoteHistory.list>[0] = {}) => route(() => remoteHistory.list(p), () => localHistory.list(p)),
  get: (id: string) => route(() => remoteHistory.get(id), () => localHistory.get(id)),
  remove: (id: string) => route(() => remoteHistory.remove(id), () => localHistory.remove(id)),
  clear: () => route(() => remoteHistory.clear(), () => localHistory.clear()),
  overview: () => route(() => remoteHistory.overview(), () => localHistory.overview()),
};
export const schemas = {
  list: () => route(() => remoteSchemas.list(), () => localSchemas.list()),
  get: (id: string) => route(() => remoteSchemas.get(id), () => localSchemas.get(id)),
  create: (d: Parameters<typeof remoteSchemas.create>[0]) => route(() => remoteSchemas.create(d), () => localSchemas.create(d)),
  update: (id: string, d: Parameters<typeof remoteSchemas.update>[1]) => route(() => remoteSchemas.update(id, d), () => localSchemas.update(id, d)),
  remove: (id: string) => route(() => remoteSchemas.remove(id), () => localSchemas.remove(id)),
};
export const datasets = {
  list: () => route(() => remoteDatasets.list(), () => localDatasets.list()),
  get: (id: string) => route(() => remoteDatasets.get(id), () => localDatasets.get(id)),
  data: (id: string) => route(() => remoteDatasets.data(id), () => localDatasets.data(id)),
  create: (d: Parameters<typeof remoteDatasets.create>[0]) => route(() => remoteDatasets.create(d), () => localDatasets.create(d)),
  remove: (id: string) => route(() => remoteDatasets.remove(id), () => localDatasets.remove(id)),
};

/** After a generation: when saved work lives in this browser, record the run in local history. (The server records
 * its own runs while generating.) The first call probes the server so the mode is known. */
export async function recordRun(plan: GenerationPlan, res: GenerateResponse): Promise<void> {
  if (mode === "unknown") { try { await history.overview(); } catch { return; } }
  if (mode === "local") localHistory.record(plan, res);
}
