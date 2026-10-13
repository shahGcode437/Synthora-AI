import { Download, FileInput, GitBranch, ScanSearch, Scale, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { fmtMs } from "../lib/format";
import type { Phase, WorkspaceState } from "../state/workspace";

export type StepStatus = "done" | "active" | "todo" | "locked";
export interface StepDef {
  key: string; route: string; label: string; description: string; icon: ReactNode; status: StepStatus; note?: string;
}

/** Step status is derived from real workspace state: nothing here is hard-coded as "done". */
export function buildSteps(s: WorkspaceState): StepDef[] {
  const p: Phase = s.phase;
  const hasPlan = !!s.plan;
  const generated = !!s.result;
  const exported = s.exportState.status === "ready";
  const passed = s.result?.validation.passed;
  const ic = "size-4";
  return [
    { key: "input", route: "/app/input", label: "Input", description: "Describe or upload", icon: <FileInput className={ic} />,
      status: p === "idle" ? "active" : "done", note: s.sourceLabel ? (s.source === "sample" ? "CSV" : "Prompt") : undefined },
    { key: "analyze", route: "/app/analyze", label: "Analyze", description: "AI reads the structure", icon: <ScanSearch className={ic} />,
      status: p === "analyzing" ? "active" : hasPlan ? "done" : "locked", note: s.ai ? `${s.ai.provider} · ${fmtMs(s.ai.latency_ms)}` : undefined },
    { key: "plan", route: "/app/plan", label: "Generation Plan", description: "Review tables and rules", icon: <GitBranch className={ic} />,
      status: !hasPlan ? "locked" : p === "plan_ready" ? "active" : "done",
      note: s.plan ? `${s.plan.tables.length} table${s.plan.tables.length === 1 ? "" : "s"}` : undefined },
    { key: "generate", route: "/app/generate", label: "Generate", description: "Create the records", icon: <Sparkles className={ic} />,
      status: p === "generating" ? "active" : generated ? "done" : hasPlan ? "todo" : "locked",
      note: s.result ? `${s.result.metadata.rows_generated.toLocaleString()} rows` : undefined },
    { key: "validate", route: "/app/validate", label: "Validate", description: "Integrity checks", icon: <ShieldCheck className={ic} />,
      status: !generated ? "locked" : "done", note: s.result ? (passed ? "Passed" : `${s.result.validation.error_count} error(s)`) : undefined },
    { key: "quality", route: "/app/quality", label: "Quality & Fidelity", description: "Original vs synthetic", icon: <Scale className={ic} />,
      status: !generated ? "locked" : "done", note: generated ? (s.source === "sample" ? "Original vs synthetic" : "Validation metrics") : undefined },
    { key: "export", route: "/app/export", label: "Export", description: "CSV, JSON or ZIP", icon: <Download className={ic} />,
      status: p === "exporting" ? "active" : exported ? "done" : generated ? "todo" : "locked", note: exported ? s.exportState.format?.toUpperCase() : undefined },
  ];
}

export const SECTION_TITLES: Record<string, string> = {
  input: "INPUT", analyze: "ANALYZE", plan: "GENERATION PLAN", generate: "GENERATE", validate: "VALIDATE",
  quality: "QUALITY & FIDELITY", export: "EXPORT", settings: "SETTINGS", help: "HELP", about: "ABOUT",
};
