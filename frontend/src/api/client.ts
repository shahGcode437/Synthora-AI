import type {
  AnalyzeRequest, AnalyzeResponse, EdgeCaseMode, ExportFormat, GenerateResponse, GeneratedData,
  GenerationPlan, HealthResponse, PrivacyMode, SampleAnalyzeResponse,
} from "./types";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

const TIMEOUT = { health: 6_000, analyze: 90_000, generate: 60_000, export: 30_000 } as const;

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

async function send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) throw await parseApiError(res);
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

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
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
