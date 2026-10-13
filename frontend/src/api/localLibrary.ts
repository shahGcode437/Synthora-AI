// Browser-side store for history, schemas and datasets. Used automatically when the backend has no saved-work
// endpoints (an older deployment), so every module keeps working. Data stays in this browser (localStorage).
import { ApiError } from "./client";
import type { DatasetDetail, DatasetSummary, HistoryPage, Overview, RunDetail, SchemaDetail, SchemaSummary } from "./library";
import type { GeneratedData, GenerateResponse, GenerationPlan } from "./types";

const HISTORY = "synthora.local.history.v1";
const SCHEMAS = "synthora.local.schemas.v1";
const DATASETS = "synthora.local.datasets.v1";
const DATA = (id: string) => `synthora.local.dataset.${id}`;
const LIMITS = { history: 100, schemas: 50, datasets: 10, datasetBytes: 1_500_000 };
const PREVIEW_ROWS = 50;

const now = () => new Date().toISOString();
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

function read<T>(key: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new ApiError(413, "storage_full", "This browser's storage is full. Delete something saved, or export the data instead."); }
}
const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);

type Plan = GenerationPlan & { domain?: string };
const planInfo = (plan: Plan) => {
  const tables = plan.tables ?? [];
  return {
    domain: plan.domain ?? "", tables: tables.map((t) => t.name), columns: tables.reduce((n, t) => n + (t.columns?.length ?? 0), 0),
    source_mode: plan.source_mode ?? "prompt",
  };
};
const schemaSummary = (s: SchemaDetail): SchemaSummary => { const { plan: _plan, ...rest } = s; return rest; };

export const localHistory = {
  list: async (p: { limit?: number; offset?: number; status?: "all" | "passed" | "failed" } = {}): Promise<HistoryPage> => {
    let rows = read<RunDetail>(HISTORY);
    if (p.status && p.status !== "all") rows = rows.filter((r) => r.validation_passed === (p.status === "passed"));
    const limit = p.limit ?? 20, offset = p.offset ?? 0;
    return { items: rows.slice(offset, offset + limit).map(({ plan: _p, ...r }) => r), total: rows.length };
  },
  get: async (id: string): Promise<RunDetail> => {
    const r = read<RunDetail>(HISTORY).find((x) => x.id === id);
    if (!r) throw notFound("Run");
    return r;
  },
  remove: async (id: string): Promise<void> => {
    const rows = read<RunDetail>(HISTORY);
    if (!rows.some((r) => r.id === id)) throw notFound("Run");
    write(HISTORY, rows.filter((r) => r.id !== id));
  },
  clear: async (): Promise<void> => write(HISTORY, []),
  overview: async (): Promise<Overview> => {
    const runs = read<RunDetail>(HISTORY).map(({ plan: _p, ...r }) => r);
    return {
      generations: runs.length, rows_generated: runs.reduce((n, r) => n + r.rows, 0),
      passed: runs.filter((r) => r.validation_passed).length, failed: runs.filter((r) => !r.validation_passed).length,
      schemas: read(SCHEMAS).length, datasets: read(DATASETS).length, last_run: runs[0] ?? null, recent: runs.slice(0, 5),
    };
  },
  /** Called after a successful generation. Stores the plan and a validation summary, never the rows. */
  record: (plan: GenerationPlan, res: GenerateResponse): void => {
    const m = res.metadata, v = res.validation, info = planInfo(plan as Plan);
    const run: RunDetail = {
      id: newId(), created_at: now(), source_mode: info.source_mode, domain: info.domain.slice(0, 120),
      data_type: m.tables_generated > 1 ? "relational" : "tabular", tables: m.tables_generated, rows: m.rows_generated,
      seed: m.seed, duration_ms: m.duration_ms, validation_passed: v.passed, error_count: v.error_count,
      warning_count: v.warning_count, settings: { locale: m.locale, faker_locale: m.faker_locale, edge_cases_applied: m.edge_cases_applied.length },
      plan,
    };
    try { write(HISTORY, [run, ...read<RunDetail>(HISTORY)].slice(0, LIMITS.history)); } catch { /* history is best effort */ }
  },
};

export const localSchemas = {
  list: async (): Promise<SchemaSummary[]> => read<SchemaDetail>(SCHEMAS).map(schemaSummary),
  get: async (id: string): Promise<SchemaDetail> => {
    const s = read<SchemaDetail>(SCHEMAS).find((x) => x.id === id);
    if (!s) throw notFound("Schema");
    return s;
  },
  create: async (d: { name: string; description?: string | null; plan: GenerationPlan }): Promise<SchemaDetail> => {
    const all = read<SchemaDetail>(SCHEMAS);
    if (all.length >= LIMITS.schemas) throw new ApiError(409, "limit_reached", `You can keep up to ${LIMITS.schemas} schemas. Delete one first.`);
    const s: SchemaDetail = { id: newId(), name: d.name, description: d.description ?? null, ...planInfo(d.plan as Plan), created_at: now(), updated_at: now(), plan: d.plan };
    write(SCHEMAS, [s, ...all]);
    return s;
  },
  update: async (id: string, d: { name?: string; description?: string | null; plan?: GenerationPlan }): Promise<SchemaDetail> => {
    const all = read<SchemaDetail>(SCHEMAS);
    const i = all.findIndex((x) => x.id === id);
    if (i < 0) throw notFound("Schema");
    const cur = all[i];
    const plan = d.plan ?? cur.plan;
    all[i] = { ...cur, ...(d.name !== undefined ? { name: d.name } : {}), ...(d.description !== undefined ? { description: d.description } : {}), ...planInfo(plan as Plan), plan, updated_at: now() };
    write(SCHEMAS, all);
    return all[i];
  },
  remove: async (id: string): Promise<void> => {
    const all = read<SchemaDetail>(SCHEMAS);
    if (!all.some((x) => x.id === id)) throw notFound("Schema");
    write(SCHEMAS, all.filter((x) => x.id !== id));
  },
};

export const localDatasets = {
  list: async (): Promise<DatasetSummary[]> => read<DatasetSummary>(DATASETS),
  get: async (id: string): Promise<DatasetDetail> => {
    const meta = read<DatasetSummary & { plan?: GenerationPlan | null }>(DATASETS).find((x) => x.id === id);
    if (!meta) throw notFound("Dataset");
    const data = await localDatasets.data(id);
    const preview = Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, rows.slice(0, PREVIEW_ROWS)]));
    return { ...meta, plan: meta.plan ?? null, preview };
  },
  data: async (id: string): Promise<GeneratedData> => {
    try { const raw = localStorage.getItem(DATA(id)); if (raw) return JSON.parse(raw); } catch { /* fall through */ }
    throw notFound("Dataset");
  },
  create: async (d: { name: string; data: GeneratedData; plan?: GenerationPlan | null; validation?: unknown; seed?: number | null; source_mode?: "prompt" | "sample" | null }): Promise<DatasetSummary> => {
    const all = read<DatasetSummary>(DATASETS);
    if (!d.data || Object.values(d.data).some((r) => !r.length)) throw new ApiError(422, "invalid_dataset", "Every table must have at least one row.");
    if (all.length >= LIMITS.datasets) throw new ApiError(409, "limit_reached", `You can keep up to ${LIMITS.datasets} datasets. Delete one first.`);
    const raw = JSON.stringify(d.data);
    if (raw.length > LIMITS.datasetBytes) {
      throw new ApiError(413, "dataset_too_large", `This dataset is ${Math.round(raw.length / 1024).toLocaleString()} KB; this browser can keep up to ${Math.round(LIMITS.datasetBytes / 1024).toLocaleString()} KB. Generate fewer rows, or export it instead.`);
    }
    const v = (d.validation ?? {}) as { passed?: unknown; error_count?: unknown; warning_count?: unknown };
    const validation = { ...(typeof v.passed === "boolean" ? { passed: v.passed } : {}), ...(typeof v.error_count === "number" ? { error_count: v.error_count } : {}), ...(typeof v.warning_count === "number" ? { warning_count: v.warning_count } : {}) };
    const meta: DatasetSummary & { plan?: GenerationPlan | null } = {
      id: newId(), name: d.name, created_at: now(), source_mode: d.source_mode ?? null, seed: d.seed ?? null,
      tables: Object.entries(d.data).map(([name, rows]) => ({ name, rows: rows.length, columns: Object.keys(rows[0]) })),
      total_rows: Object.values(d.data).reduce((n, r) => n + r.length, 0), size_bytes: raw.length,
      validation: Object.keys(validation).length ? validation : null, plan: d.plan ?? null,
    };
    try { localStorage.setItem(DATA(meta.id), raw); } catch { throw new ApiError(413, "storage_full", "This browser's storage is full. Delete something saved, or export the data instead."); }
    try { write(DATASETS, [meta, ...all]); } catch (e) { localStorage.removeItem(DATA(meta.id)); throw e; }
    const { plan: _plan, ...summary } = meta;
    return summary;
  },
  remove: async (id: string): Promise<void> => {
    const all = read<DatasetSummary>(DATASETS);
    if (!all.some((x) => x.id === id)) throw notFound("Dataset");
    write(DATASETS, all.filter((x) => x.id !== id));
    try { localStorage.removeItem(DATA(id)); } catch { /* ignore */ }
  },
};
