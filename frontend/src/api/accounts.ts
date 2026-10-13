// Account, history, schema and dataset endpoints (see docs/API_CONTRACT.md "Accounts & persistence").
import { TIMEOUT, send } from "./client";
import type { GeneratedData, GenerationPlan } from "./types";

export interface Preferences {
  workspace_name: string; locale: string; rows: string;
  edge: "none" | "ai_recommended" | "low" | "medium" | "high" | "custom";
  privacy: "auto" | "safe_default" | "none" | "custom";
  seed: string; export_format: "auto" | "csv" | "json" | "zip";
  theme: "dark" | "light"; density: "comfortable" | "compact"; animations: boolean; depth: "full" | "reduced";
}
export interface User {
  id: string; email: string; name: string; avatar_url: string | null;
  has_password: boolean; has_google: boolean; email_verified: boolean;
  created_at: string; last_login_at: string | null; preferences: Partial<Preferences>;
}
/** `token` is for API clients only; the browser app ignores it and relies on the HttpOnly cookie plus `csrf_token`. */
export interface AuthResponse { user: User; token: string; csrf_token: string; expires_at: string }
export interface SessionInfo { id: string; created_at: string; last_used_at: string; expires_at: string; user_agent: string | null; current: boolean }

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

const json = async <T>(p: string, init?: RequestInit): Promise<T> => (await send(p, init ?? {}, TIMEOUT.account)).json();
const body = (method: string, data?: unknown): RequestInit => ({
  method, headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});
const none = async (p: string, init: RequestInit): Promise<void> => { await send(p, init, TIMEOUT.account); };

export const auth = {
  signup: (d: { name: string; email: string; password: string }) => json<AuthResponse>("/api/v1/auth/signup", body("POST", d)),
  login: (d: { email: string; password: string }) => json<AuthResponse>("/api/v1/auth/login", body("POST", d)),
  google: (credential: string) => json<AuthResponse>("/api/v1/auth/google", body("POST", { credential })),
  logout: () => none("/api/v1/auth/logout", body("POST")),
  me: () => json<User>("/api/v1/auth/me"),
  /** Who is signed in plus the CSRF token. Used on load: the cookie is invisible to scripts. */
  session: () => json<AuthResponse>("/api/v1/auth/session"),
  update: (d: { name?: string; preferences?: Preferences }) => json<User>("/api/v1/auth/me", body("PATCH", d)),
  changePassword: (d: { current_password?: string; new_password: string }) => none("/api/v1/auth/change-password", body("POST", d)),
  sessions: () => json<SessionInfo[]>("/api/v1/auth/sessions"),
  revokeSession: (id: string) => none(`/api/v1/auth/sessions/${id}`, body("DELETE")),
  revokeOthers: () => none("/api/v1/auth/sessions", body("DELETE")),
  deleteAccount: (d: { password?: string; confirm_email?: string }) => none("/api/v1/auth/delete-account", body("POST", d)),
};

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
