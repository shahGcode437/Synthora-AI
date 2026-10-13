import type {
  AnalyzeRequest, AnalyzeResponse, EdgeCaseMode, ExportFormat, GenerateResponse, GeneratedData,
  GenerationPlan, HealthResponse, PrivacyMode, SampleAnalyzeResponse,
} from "./types";

/** The backend's own address: shown in the UI and used for its interactive docs link. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

/**
 * Sessions are an HttpOnly cookie, which the browser only sends to the site that set it. So by default API calls go
 * to the page's own origin and are forwarded to the backend (Vite's dev proxy locally, a Vercel rewrite in production;
 * see docs/AUTH_SETUP.md). Set VITE_API_PROXY=false to call API_BASE directly: then the backend must use
 * SESSION_COOKIE_SAMESITE=none and the browser must allow third-party cookies.
 */
const PROXY = (import.meta.env.VITE_API_PROXY ?? "true") !== "false";
const FETCH_BASE = PROXY ? "" : API_BASE;

export const TIMEOUT = { health: 20_000, analyze: 90_000, generate: 60_000, export: 30_000, account: 30_000 } as const;

/** Error envelope from the backend: { error: { code, message, details } } (docs/API_CONTRACT.md §6). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** True when the backend could not be reached at all. */
  get isNetwork() {
    return this.code === "network_error" || this.code === "timeout";
  }
}

async function parseApiError(res: Response): Promise<ApiError> {
  try {
    const j = await res.json();
    if (j?.error) return new ApiError(res.status, j.error.code, j.error.message, j.error.details ?? null);
    return new ApiError(res.status, "http_error", j?.detail ?? res.statusText);
  } catch {
    return new ApiError(res.status, "http_error", res.statusText || `HTTP ${res.status}`);
  }
}

// ---- authentication: the session itself is an HttpOnly cookie that scripts cannot read. This module only
// attaches the CSRF token (kept in memory, never persisted) that proves a state-changing request came from the app.
let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
export const setCsrfToken = (t: string | null) => { csrfToken = t; };
/** Called when a request made while signed in comes back 401 (expired or revoked session). */
export const onUnauthorized = (fn: (() => void) | null) => { unauthorizedHandler = fn; };

export async function send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes((init.method ?? "GET").toUpperCase())) headers.set("X-CSRF-Token", csrfToken);
    const res = await fetch(`${FETCH_BASE}${path}`, { ...init, headers, credentials: "include", signal: ctrl.signal });
    if (!res.ok) {
      const err = await parseApiError(res);
      if (res.status === 401 && csrfToken && err.code === "not_authenticated") unauthorizedHandler?.();
      throw err;
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError(0, "timeout", `The request took longer than ${Math.round(timeoutMs / 1000)}s and was cancelled.`);
    }
    throw new ApiError(0, "network_error", `Cannot reach the backend at ${API_BASE}. Is it running?`);
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await send(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);
  return res.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await send("/health", { method: "GET" }, TIMEOUT.health);
  return res.json();
}

export function analyzePrompt(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  return postJson("/api/v1/analyze", req, TIMEOUT.analyze);
}

export interface SampleControls {
  instruction?: string;
  target_rows?: number | null;
  locale?: string | null;
  edge_case_mode: EdgeCaseMode;
  privacy_mode: PrivacyMode;
  seed?: number | null;
}

export async function analyzeSample(file: File, c: SampleControls): Promise<SampleAnalyzeResponse> {
  const fd = new FormData(); // no manual Content-Type: the browser adds the multipart boundary
  fd.append("file", file);
  if (c.instruction?.trim()) fd.append("instruction", c.instruction.trim());
  if (c.target_rows != null) fd.append("target_rows", String(c.target_rows));
  if (c.locale) fd.append("locale", c.locale);
  fd.append("edge_case_mode", c.edge_case_mode);
  fd.append("privacy_mode", c.privacy_mode);
  if (c.seed != null) fd.append("seed", String(c.seed));
  const res = await send("/api/v1/analyze/sample", { method: "POST", body: fd }, TIMEOUT.analyze);
  return res.json();
}

export function generate(plan: GenerationPlan, seed?: number | null): Promise<GenerateResponse> {
  return postJson("/api/v1/generate", { plan, seed: seed ?? null }, TIMEOUT.generate);
}

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

export async function exportData(
  data: GeneratedData, format: ExportFormat, filename: string,
): Promise<ExportedFile> {
  const res = await send("/api/v1/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, format, filename: filename || undefined }),
  }, TIMEOUT.export);
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${filename || "synthora_export"}.${format}`;
  return { blob: await res.blob(), filename: name };
}

/** Triggers a browser download for an exported blob. */
export function saveBlob({ blob, filename }: ExportedFile): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
