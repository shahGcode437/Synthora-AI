import { useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { AnalyzeSection } from "./sections/AnalyzeSection";
import { ErrorPanel } from "./sections/ErrorPanel";
import { ExportSection } from "./sections/ExportSection";
import { GeneratedSection, GeneratingCard } from "./sections/GeneratedSection";
import { InputSection } from "./sections/InputSection";
import { PlanSection } from "./sections/PlanSection";
import { QualitySection } from "./sections/QualitySection";
import { ValidationSection } from "./sections/ValidationSection";
import { useHealth, useWorkspace, type Phase } from "./state/workspace";

function scrollTo(id: string) {
  // let the new section mount first
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

export default function App() {
  const ws = useWorkspace();
  const { health, recheck } = useHealth();
  const { state } = ws;
  const offline = health.status === "offline";
  const busy = (["analyzing", "generating", "exporting"] as Phase[]).includes(state.phase);

  // Guide the user to the next step as the workflow advances.
  const prev = useRef<Phase>("idle");
  useEffect(() => {
    if (prev.current === "analyzing" && state.phase === "plan_ready") scrollTo("sec-analyze");
    if (prev.current === "generating" && state.phase === "generated") scrollTo("sec-generate");
    if (prev.current === "idle" && state.phase === "analyzing") scrollTo("sec-analyze");
    prev.current = state.phase;
  }, [state.phase]);

  const err = state.error;

  return (
    <div className="min-h-screen">
      <Header health={health} onRecheck={recheck} ai={state.ai} />
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <Sidebar state={state} onReset={ws.reset} />

        <main className="min-w-0 max-w-6xl flex-1 space-y-12">
          <InputSection busy={state.phase === "analyzing"} offline={offline}
            onPrompt={ws.analyzeFromPrompt} onSample={ws.analyzeFromSample} />

          {err?.step === "analyze" && (
            <ErrorPanel step="analyze" err={err.err} onRetry={ws.retry} onDismiss={ws.dismissError} busy={busy} />
          )}

          <AnalyzeSection state={state} />

          {state.plan && state.phase !== "analyzing" && (
            <>
              <PlanSection plan={state.plan} ai={state.ai} generating={state.phase === "generating"} hasResult={!!state.result}
                disabled={busy} onSetRows={ws.setTableRows} onGenerate={ws.runGenerate} />
              {err?.step === "generate" && (
                <ErrorPanel step="generate" err={err.err} onRetry={ws.retry} onDismiss={ws.dismissError} busy={busy} />
              )}
            </>
          )}

          {state.phase === "generating" && <GeneratingCard />}

          {state.result && state.plan && (
            <>
              <GeneratedSection result={state.result} plan={state.plan} />
              <ValidationSection report={state.result.validation} />
              <QualitySection source={state.source} profile={state.profile} plan={state.plan} result={state.result} />
              {err?.step === "export" && (
                <ErrorPanel step="export" err={err.err} onRetry={ws.retry} onDismiss={ws.dismissError} busy={busy} />
              )}
              <ExportSection data={state.result.data} exportState={state.exportState}
                busy={state.phase === "exporting"} onExport={ws.runExport} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
