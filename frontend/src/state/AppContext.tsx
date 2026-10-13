import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SampleControls } from "../api/client";
import { recordRun } from "../api/library";
import type { AnalyzeRequest, GenerationPlan } from "../api/types";
import { defaultControls, type Controls } from "../sections/ControlsFields";
import { useRouter } from "../router";
import { applyAppearance, defaultSettings, loadSettings, saveSettings, type Settings } from "./settings";
import { useHealth, useWorkspace, type HealthState } from "./workspace";

export type EventTone = "success" | "danger" | "warning" | "info";
export interface AppEvent { id: number; ts: number; tone: EventTone; title: string; detail?: string }
export interface Draft { tab: "prompt" | "sample"; prompt: string; instruction: string; file: File | null; controls: Controls }

const controlsFrom = (s: Settings): Controls => ({
  ...defaultControls, targetRows: s.rows, locale: s.locale, edge: s.edge, privacy: s.privacy, seed: s.seed,
});
const freshDraft = (s: Settings): Draft => ({ tab: "prompt", prompt: "", instruction: "", file: null, controls: controlsFrom(s) });

interface Ctx {
  ws: ReturnType<typeof useWorkspace>;
  health: HealthState; recheck: () => void;
  settings: Settings; setSettings: (p: Partial<Settings>) => void; resetSettings: () => void;
  draft: Draft; patchDraft: (p: Partial<Draft>) => void;
  events: AppEvent[]; clearEvents: () => void;
  analyzePrompt: (req: AnalyzeRequest) => void;
  analyzeSample: (f: File, c: SampleControls) => void;
  generate: (seed: number | null) => void;
  newSession: () => void;
  /** Load a saved plan (schema or history run) for review: no AI call. */
  loadPlan: (plan: GenerationPlan, label: string) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside <AppProvider>");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { go } = useRouter();
  const ws = useWorkspace();
  const { health, recheck } = useHealth();
  const { state, analyzeFromPrompt, analyzeFromSample, runGenerate, reset } = ws;

  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [draft, setDraft] = useState<Draft>(() => freshDraft(loadSettings()));
  const [events, setEvents] = useState<AppEvent[]>([]);
  const nextId = useRef(1);

  useEffect(() => { applyAppearance(settings); saveSettings(settings); }, [settings]);

  const push = useCallback((tone: EventTone, title: string, detail?: string) =>
    setEvents((e) => [{ id: nextId.current++, ts: Date.now(), tone, title, detail }, ...e].slice(0, 30)), []);

  // Real events only: each entry is produced by an actual state transition.
  const prev = useRef({ phase: state.phase, exp: state.exportState.status, health: health.status, err: state.error });
  useEffect(() => {
    const p = prev.current;
    if (p.phase === "analyzing" && state.phase === "plan_ready") {
      push("success", "Analysis complete", `${state.ai?.provider ?? "AI"} · ${state.plan?.tables.length ?? 0} table(s) planned`);
    }
    if (p.phase === "generating" && state.phase === "generated" && state.result) {
      const ok = state.result.validation.passed;
      if (state.plan) void recordRun(state.plan, state.result);
      push(ok ? "success" : "warning", "Data generated",
        `${state.result.metadata.rows_generated.toLocaleString()} rows · validation ${ok ? "passed" : `found ${state.result.validation.error_count} error(s)`}`);
    }
    if (state.error && state.error !== p.err) push("danger", `${state.error.step[0].toUpperCase()}${state.error.step.slice(1)} failed`, state.error.err.message);
    if (p.exp !== "ready" && state.exportState.status === "ready") push("success", "Export ready", state.exportState.filename);
    if (p.health !== health.status && p.health !== "checking") {
      push(health.status === "online" ? "success" : "warning", health.status === "online" ? "API back online" : "API unreachable");
    }
    prev.current = { phase: state.phase, exp: state.exportState.status, health: health.status, err: state.error };
  }, [state, health.status, push]);

  const setSettings = useCallback((p: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...p })), []);
  const resetSettings = useCallback(() => setSettingsState(defaultSettings), []);
  const patchDraft = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  const analyzePrompt = useCallback((req: AnalyzeRequest) => { go("/app/analyze"); void analyzeFromPrompt(req); }, [go, analyzeFromPrompt]);
  const analyzeSample = useCallback((f: File, c: SampleControls) => { go("/app/analyze"); void analyzeFromSample(f, c); }, [go, analyzeFromSample]);
  const generate = useCallback((seed: number | null) => { go("/app/generate"); void runGenerate(seed); }, [go, runGenerate]);
  const newSession = useCallback(() => { reset(); setDraft(freshDraft(settings)); go("/app/input"); }, [reset, settings, go]);
  const loadPlan = useCallback((plan: GenerationPlan, label: string) => { ws.loadPlan(plan, label); go("/app/plan"); }, [ws, go]);

  return (
    <AppCtx.Provider value={{
      ws, health, recheck, settings, setSettings, resetSettings, draft, patchDraft,
      events, clearEvents: () => setEvents([]), analyzePrompt, analyzeSample, generate, newSession, loadPlan,
    }}>
      {children}
    </AppCtx.Provider>
  );
}
