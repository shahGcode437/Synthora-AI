import { Check, Download, FileInput, GitBranch, Loader2, RotateCcw, ScanSearch, Scale, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Phase, WorkspaceState } from "../state/workspace";
import { cn } from "../lib/cn";
import { fmtMs } from "../lib/format";

type StepStatus = "done" | "active" | "todo" | "locked";
interface StepDef { id: string; label: string; icon: ReactNode; status: StepStatus; note?: string }

export function buildSteps(s: WorkspaceState): StepDef[] {
  const p: Phase = s.phase;
  const hasPlan = !!s.plan;
  const generated = !!s.result;
  const exported = s.exportState.status === "ready";
  const passed = s.result?.validation.passed;
  return [
    { id: "sec-input", label: "Input", icon: <FileInput className="size-4" />,
      status: p === "idle" ? "active" : "done", note: s.sourceLabel ? (s.source === "sample" ? "CSV" : "Prompt") : undefined },
    { id: "sec-analyze", label: "Analyze", icon: <ScanSearch className="size-4" />,
      status: p === "analyzing" ? "active" : hasPlan ? "done" : "locked",
      note: s.ai ? `${s.ai.provider} · ${fmtMs(s.ai.latency_ms)}` : undefined },
    { id: "sec-plan", label: "Generation Plan", icon: <GitBranch className="size-4" />,
      status: !hasPlan ? "locked" : p === "plan_ready" ? "active" : "done",
      note: s.plan ? `${s.plan.tables.length} table${s.plan.tables.length === 1 ? "" : "s"}` : undefined },
    { id: "sec-generate", label: "Generate", icon: <Sparkles className="size-4" />,
      status: p === "generating" ? "active" : generated ? "done" : hasPlan ? "todo" : "locked",
      note: s.result ? `${s.result.metadata.rows_generated.toLocaleString()} rows` : undefined },
    { id: "sec-validate", label: "Validate", icon: <ShieldCheck className="size-4" />,
      status: !generated ? "locked" : "done",
      note: s.result ? (passed ? "Passed" : `${s.result.validation.error_count} error(s)`) : undefined },
    { id: "sec-quality", label: "Quality & Fidelity", icon: <Scale className="size-4" />,
      status: !generated ? "locked" : "done", note: generated ? (s.source === "sample" ? "Original vs synthetic" : "Validation metrics") : undefined },
    { id: "sec-export", label: "Export", icon: <Download className="size-4" />,
      status: p === "exporting" ? "active" : exported ? "done" : generated ? "todo" : "locked",
      note: exported ? s.exportState.format?.toUpperCase() : undefined },
  ];
}

function scrollToSection(id: string) {
  (document.getElementById(id) ?? document.getElementById(`${id}-action`))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Sidebar({ state, onReset }: { state: WorkspaceState; onReset: () => void }) {
  const steps = buildSteps(state);
  const busy = state.phase === "analyzing" || state.phase === "generating" || state.phase === "exporting";
  return (
    <>
      {/* desktop: vertical stepper */}
      <aside className="sticky top-[4.5rem] hidden h-[calc(100vh-5.5rem)] w-60 shrink-0 flex-col justify-between lg:flex">
        <nav aria-label="Workflow" className="rounded-xl border border-line bg-panel/70 p-2">
          <div className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-mute">Workflow</div>
          <ol className="relative">
            {steps.map((st, i) => (
              <li key={st.id} className="relative">
                {i < steps.length - 1 && (
                  <span className={cn("absolute left-[1.35rem] top-[2.35rem] h-[calc(100%-1.6rem)] w-px",
                    st.status === "done" ? "bg-accent/40" : "bg-line")} />
                )}
                <button disabled={st.status === "locked"} onClick={() => scrollToSection(st.id)}
                  aria-current={st.status === "active" ? "step" : undefined}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    st.status === "active" && "bg-accent/[0.08]",
                    st.status !== "locked" && st.status !== "active" && "hover:bg-panel-2",
                    st.status === "locked" && "cursor-not-allowed")}>
                  <StepDot status={st.status} index={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-medium",
                      st.status === "locked" ? "text-fg-mute/60" : st.status === "active" ? "text-fg" : "text-fg-dim")}>{st.label}</div>
                    {st.note && st.status !== "locked" && <div className="truncate text-[11px] text-fg-mute">{st.note}</div>}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {state.phase !== "idle" && (
          <button onClick={onReset} disabled={state.phase === "analyzing" || state.phase === "generating"}
            className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-line bg-panel/70 px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40">
            <RotateCcw className="size-3.5" /> New session
          </button>
        )}
      </aside>

      {/* mobile / tablet: horizontal stepper */}
      <nav aria-label="Workflow" className="sticky top-14 z-30 -mx-4 overflow-x-auto border-b border-line bg-canvas/90 px-4 py-2 backdrop-blur lg:hidden">
        <ol className="flex min-w-max items-center gap-1.5">
          {steps.map((st) => (
            <li key={st.id}>
              <button disabled={st.status === "locked"} onClick={() => scrollToSection(st.id)}
                className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  st.status === "active" ? "border-accent/40 bg-accent/10 text-accent-soft"
                    : st.status === "done" ? "border-line text-fg-dim"
                    : st.status === "todo" ? "border-line-strong text-fg-dim" : "cursor-not-allowed border-line/60 text-fg-mute/50")}>
                {st.status === "done" ? <Check className="size-3 text-accent" />
                  : st.status === "active" && busy ? <Loader2 className="size-3 animate-spin" /> : st.icon}
                {st.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

function StepDot({ status, index }: { status: StepStatus; index: number }) {
  if (status === "done")
    return <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/40"><Check className="size-3.5" /></span>;
  if (status === "active")
    return <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[#04231f] shadow-[0_0_14px_rgb(45_212_191/0.5)]"><span className="text-[11px] font-bold">{index}</span></span>;
  return <span className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
    status === "todo" ? "border-line-strong bg-panel-2 text-fg-dim" : "border-line bg-panel text-fg-mute/50")}>{index}</span>;
}
