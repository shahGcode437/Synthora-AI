import { ArrowRight, Lock } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button, Callout, Card } from "../components/ui";
import { AnalyzeSection } from "../sections/AnalyzeSection";
import { ErrorPanel } from "../sections/ErrorPanel";
import { ExportSection } from "../sections/ExportSection";
import { GeneratedSection, GeneratingCard } from "../sections/GeneratedSection";
import { InputSection } from "../sections/InputSection";
import { PlanSection } from "../sections/PlanSection";
import { QualitySection } from "../sections/QualitySection";
import { ValidationSection } from "../sections/ValidationSection";
import { useRouter } from "../router";
import { useApp } from "../state/AppContext";
import type { Phase } from "../state/workspace";
import { AboutContent } from "./AboutPage";
import { HelpContent } from "./HelpPage";
import { SettingsPage } from "./SettingsPage";

function Locked({ text, to = "/app/input", cta = "Go to Input" }: { text: string; to?: string; cta?: string }) {
  const { go } = useRouter();
  return (
    <Card className="mx-auto mt-6 max-w-xl p-8 text-center animate-fade-up">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border border-line-strong bg-panel-2 text-fg-mute"><Lock className="size-5" /></div>
      <h2 className="text-lg font-semibold">This step is not available yet</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-mute">{text}</p>
      <div className="mt-5"><Button variant="primary" onClick={() => go(to)}>{cta}</Button></div>
    </Card>
  );
}

function NextStep({ to, label }: { to: string; label: string }) {
  const { go } = useRouter();
  return (
    <div className="mt-8 flex justify-end">
      <Button variant="primary" size="lg" icon={<ArrowRight className="size-4" />} onClick={() => go(to)}>{label}</Button>
    </div>
  );
}

export function WorkspaceRoute({ name }: { name: string }) {
  const { ws, health, settings, analyzePrompt, analyzeSample, generate } = useApp();
  const { go } = useRouter();
  const { state } = ws;
  const err = state.error;
  const offline = health.status === "offline";
  const busy = (["analyzing", "generating", "exporting"] as Phase[]).includes(state.phase);

  // A failed analysis resets the session: send the user back to Input, where the error panel explains what happened.
  useEffect(() => {
    if (name === "analyze" && state.phase === "idle" && err?.step === "analyze") go("/app/input", true);
  }, [name, state.phase, err, go]);

  const panel = (step: "analyze" | "generate" | "export"): ReactNode =>
    err?.step === step ? <ErrorPanel step={step} err={err.err} onRetry={ws.retry} onDismiss={ws.dismissError} busy={busy} /> : null;

  switch (name) {
    case "input":
      return (
        <div className="space-y-6">
          {state.plan && (
            <Callout tone="info" title="A session is in progress"
              action={<Button variant="ghost" size="sm" onClick={() => go(state.result ? "/app/generate" : "/app/plan")}>Continue</Button>}>
              Working on “{state.sourceLabel}”. Submitting a new request replaces it.
            </Callout>
          )}
          <InputSection busy={state.phase === "analyzing"} offline={offline} onPrompt={analyzePrompt} onSample={analyzeSample} />
          {panel("analyze")}
        </div>
      );

    case "analyze":
      if (!state.plan && state.phase !== "analyzing") return <Locked text="Describe a dataset or upload a CSV first, then analyze it." />;
      return (
        <>
          <AnalyzeSection state={state} />
          {state.plan && state.phase !== "analyzing" && <NextStep to="/app/plan" label="Review generation plan" />}
        </>
      );

    case "plan":
      if (!state.plan) return <Locked text="A generation plan appears here once your input has been analyzed." />;
      return (
        <>
          <PlanSection plan={state.plan} ai={state.ai} generating={state.phase === "generating"} hasResult={!!state.result}
            disabled={busy} onSetRows={ws.setTableRows} onGenerate={generate} />
          {panel("generate")}
        </>
      );

    case "generate":
      if (state.phase === "generating") return <GeneratingCard />;
      if (state.result && state.plan) {
        return (
          <>
            <GeneratedSection result={state.result} plan={state.plan} />
            <NextStep to="/app/validate" label="Validate the data" />
          </>
        );
      }
      if (err?.step === "generate") return <>{panel("generate")}</>;
      if (!state.plan) return <Locked text="Analyze your input and approve a plan before generating." />;
      return <Locked text="Nothing has been generated yet. Review the plan, then press Generate." to="/app/plan" cta="Open the plan" />;

    case "validate":
      if (!state.result) return <Locked text="Validation runs as part of generation. Generate data first." to="/app/plan" cta="Open the plan" />;
      return (
        <>
          <ValidationSection report={state.result.validation} />
          <NextStep to="/app/quality" label="See quality and fidelity" />
        </>
      );

    case "quality":
      if (!state.result || !state.plan) return <Locked text="The quality report compares generated data with its source. Generate data first." to="/app/plan" cta="Open the plan" />;
      return (
        <>
          <QualitySection source={state.source} profile={state.profile} plan={state.plan} result={state.result} />
          <NextStep to="/app/export" label="Continue to export" />
        </>
      );

    case "export":
      if (!state.result) return <Locked text="Generate data before exporting." to="/app/plan" cta="Open the plan" />;
      return (
        <>
          <ExportSection data={state.result.data} exportState={state.exportState} busy={state.phase === "exporting"}
            onExport={ws.runExport} defaultFormat={settings.exportFormat} />
          {panel("export")}
        </>
      );

    case "settings": return <SettingsPage />;
    case "help": return <HelpContent />;
    case "about": return <AboutContent />;
    default:
      return <Locked text="That workspace does not exist." to="/app/input" cta="Back to Input" />;
  }
}
