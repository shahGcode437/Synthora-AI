import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ApiError, analyzePrompt, analyzeSample, exportData, generate, getHealth, saveBlob,
  type SampleControls,
} from "../api/client";
import type {
  AIRunMeta, AnalyzeRequest, DatasetProfile, ExportFormat, GenerateResponse, GenerationPlan,
} from "../api/types";

export type Phase = "idle" | "analyzing" | "plan_ready" | "generating" | "generated" | "exporting";
export type Step = "analyze" | "generate" | "export";
export type SourceMode = "prompt" | "sample";

export interface ExportState {
  status: "idle" | "preparing" | "ready" | "error";
  format?: ExportFormat;
  filename?: string;
  message?: string;
}

export interface WorkspaceState {
  phase: Phase;
  source: SourceMode | null;
  sourceLabel: string | null; // prompt excerpt or file name
  plan: GenerationPlan | null;
  ai: AIRunMeta | null;
  profile: DatasetProfile | null;
  profileWarnings: string[];
  result: GenerateResponse | null;
  error: { step: Step; err: ApiError } | null;
  exportState: ExportState;
  analyzeStartedAt: number | null;
}

const initial: WorkspaceState = {
  phase: "idle", source: null, sourceLabel: null, plan: null, ai: null, profile: null, profileWarnings: [],
  result: null, error: null, exportState: { status: "idle" }, analyzeStartedAt: null,
};

type Action =
  | { type: "analyze_start"; source: SourceMode; label: string }
  | { type: "analyze_ok"; plan: GenerationPlan; ai: AIRunMeta; profile: DatasetProfile | null; warnings: string[] }
  | { type: "analyze_fail"; err: ApiError }
  | { type: "generate_start" }
  | { type: "generate_ok"; result: GenerateResponse }
  | { type: "generate_fail"; err: ApiError }
  | { type: "export_start"; format: ExportFormat }
  | { type: "export_ok"; filename: string }
  | { type: "export_fail"; err: ApiError }
  | { type: "set_rows"; table: string; rows: number | null }
  | { type: "dismiss_error" }
  | { type: "reset" };

function reducer(s: WorkspaceState, a: Action): WorkspaceState {
  switch (a.type) {
    case "analyze_start":
      return { ...initial, phase: "analyzing", source: a.source, sourceLabel: a.label, analyzeStartedAt: Date.now() };
    case "analyze_ok":
      return { ...s, phase: "plan_ready", plan: a.plan, ai: a.ai, profile: a.profile, profileWarnings: a.warnings, error: null };
    case "analyze_fail":
      return { ...initial, error: { step: "analyze", err: a.err } };
    case "generate_start":
      return { ...s, phase: "generating", error: null, result: null, exportState: { status: "idle" } };
    case "generate_ok":
      return { ...s, phase: "generated", result: a.result, error: null };
    case "generate_fail":
      return { ...s, phase: "plan_ready", error: { step: "generate", err: a.err } };
    case "export_start":
      return { ...s, phase: "exporting", error: null, exportState: { status: "preparing", format: a.format } };
    case "export_ok":
      return { ...s, phase: "generated", exportState: { status: "ready", format: s.exportState.format, filename: a.filename } };
    case "export_fail":
      return { ...s, phase: "generated", error: { step: "export", err: a.err },
        exportState: { status: "error", format: s.exportState.format, message: a.err.message } };
    case "set_rows":
      return s.plan ? {
        ...s,
        plan: { ...s.plan, tables: s.plan.tables.map((t) => (t.name === a.table ? { ...t, target_rows: a.rows } : t)) },
        // an edited plan invalidates earlier output
        ...(s.result ? { result: null, phase: "plan_ready" as Phase, exportState: { status: "idle" } as ExportState } : {}),
      } : s;
    case "dismiss_error":
      return { ...s, error: null };
    case "reset":
      return initial;
  }
}

const toApiError = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError(0, "unknown_error", e instanceof Error ? e.message : "Something went wrong.");

export function useWorkspace() {
  const [state, dispatch] = useReducer(reducer, initial);
  const retryRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const analyzeFromPrompt = useCallback((req: AnalyzeRequest) => {
    const run = async () => {
      dispatch({ type: "analyze_start", source: "prompt", label: (req.prompt ?? "").slice(0, 80) });
      try {
        const r = await analyzePrompt(req);
        dispatch({ type: "analyze_ok", plan: r.plan, ai: r.ai, profile: null, warnings: [] });
      } catch (e) {
        dispatch({ type: "analyze_fail", err: toApiError(e) });
      }
    };
    retryRef.current = run;
    return run();
  }, []);

  const analyzeFromSample = useCallback((file: File, controls: SampleControls) => {
    const run = async () => {
      dispatch({ type: "analyze_start", source: "sample", label: file.name });
      try {
        const r = await analyzeSample(file, controls);
        dispatch({ type: "analyze_ok", plan: r.plan, ai: r.ai, profile: r.profile, warnings: r.warnings });
      } catch (e) {
        dispatch({ type: "analyze_fail", err: toApiError(e) });
      }
    };
    retryRef.current = run;
    return run();
  }, []);

  const runGenerate = useCallback((seed: number | null) => {
    const run = async () => {
      const plan = stateRef.current.plan;
      if (!plan) return;
      dispatch({ type: "generate_start" });
      try {
        dispatch({ type: "generate_ok", result: await generate(plan, seed) });
      } catch (e) {
        dispatch({ type: "generate_fail", err: toApiError(e) });
      }
    };
    retryRef.current = run;
    return run();
  }, []);

  const runExport = useCallback((format: ExportFormat, filename: string) => {
    const run = async () => {
      const result = stateRef.current.result;
      if (!result) return;
      dispatch({ type: "export_start", format });
      try {
        const file = await exportData(result.data, format, filename);
        saveBlob(file);
        dispatch({ type: "export_ok", filename: file.filename });
      } catch (e) {
        dispatch({ type: "export_fail", err: toApiError(e) });
      }
    };
    retryRef.current = run;
    return run();
  }, []);

  return {
    state,
    analyzeFromPrompt, analyzeFromSample, runGenerate, runExport,
    retry: () => retryRef.current?.(),
    setTableRows: (table: string, rows: number | null) => dispatch({ type: "set_rows", table, rows }),
    dismissError: () => dispatch({ type: "dismiss_error" }),
    reset: () => dispatch({ type: "reset" }),
  };
}

// ------------------------------------------------------------------ backend health
export type HealthState = { status: "checking" | "online" | "offline"; version?: string };

export function useHealth(intervalMs = 15_000) {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const check = useCallback(async () => {
    try {
      const h = await getHealth();
      setHealth({ status: h.status === "ok" ? "online" : "offline", version: h.version });
    } catch {
      setHealth({ status: "offline" });
    }
  }, []);
  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);
  return { health, recheck: check };
}
