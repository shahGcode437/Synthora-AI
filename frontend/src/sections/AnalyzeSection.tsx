import { Boxes, Cpu, Database, GitFork, ShieldAlert, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardHeader, SectionTitle, Skeleton, Spinner, StatCard } from "../components/ui";
import { fmtInt, fmtMs } from "../lib/format";
import type { WorkspaceState } from "../state/workspace";
import { ProfilePanel } from "./ProfilePanel";

function useElapsed(since: number | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return since && active ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

export function AnalyzeSection({ state }: { state: WorkspaceState }) {
  const analyzing = state.phase === "analyzing";
  const elapsed = useElapsed(state.analyzeStartedAt, analyzing);
  const { plan, ai, profile } = state;
  if (!analyzing && !plan) return null;

  const sample = state.source === "sample";
  const stages = sample
    ? ["Parsing and profiling the CSV locally", "Asking the AI to interpret the structure", "Grounding the plan in your data"]
    : ["Sending your request to the AI", "Designing tables, keys and rules", "Validating the Generation Plan"];

  return (
    <section id="sec-analyze" className="scroll-mt-32 animate-fade-up space-y-4">
      <SectionTitle eyebrow="Step 2" title="AI analysis"
        description={sample ? "Facts are computed locally; the AI only interprets what they mean." : "The AI turns your description into a structured plan."} />

      {analyzing && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Spinner className="size-5" />
            <div>
              <div className="text-sm font-medium">Analyzing{state.sourceLabel ? ` “${state.sourceLabel}${state.sourceLabel.length >= 80 ? "…" : ""}”` : ""}</div>
              <div className="text-xs text-fg-mute" aria-live="polite">{elapsed}s elapsed · usually 5–15 seconds</div>
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {stages.map((s, i) => (
              <div key={s} className="space-y-2.5 rounded-lg border border-line bg-canvas/40 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-mute">Stage {i + 1}</div>
                <div className="text-sm text-fg-dim">{s}</div>
                <Skeleton className="h-2 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!analyzing && plan && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Domain" value={<span className="text-lg capitalize">{plan.domain.replace(/[_-]+/g, " ")}</span>} icon={<Boxes className="size-4" />} hint={plan.locale ? `Locale ${plan.locale}` : "Locale auto"} />
            <StatCard label="Tables" value={plan.tables.length} icon={<Table2 className="size-4" />}
              hint={`${fmtInt(plan.tables.reduce((n, t) => n + t.columns.length, 0))} columns`} />
            <StatCard label="Relationships" value={plan.relationships.length} icon={<GitFork className="size-4" />}
              hint={plan.relationships.length ? "detected" : "single table"} />
            <StatCard label="PII fields" value={plan.tables.reduce((n, t) => n + t.columns.filter((c) => c.pii.classification !== "none").length, 0)}
              icon={<ShieldAlert className="size-4" />} hint="classified by AI" />
            <StatCard label="Business rules" value={plan.business_rules.length} icon={<Database className="size-4" />} hint={`${plan.edge_cases.recommendations.length} edge case${plan.edge_cases.recommendations.length === 1 ? "" : "s"}`} />
            {ai && <StatCard label="AI engine" value={<span className="text-lg capitalize">{ai.provider}</span>} icon={<Cpu className="size-4" />}
              hint={`${fmtMs(ai.latency_ms)}${ai.fallbacks ? ` · ${ai.fallbacks} fallback` : ""}`} />}
          </div>
          {profile && <ProfilePanel profile={profile} warnings={state.profileWarnings} />}
          {!profile && (
            <Card>
              <CardHeader title="How this was built" subtitle="Prompt mode — no source data involved" />
              <p className="px-5 py-4 text-sm text-fg-dim">
                The AI inferred the domain, tables and field semantics from your description. Review the plan below, adjust row counts if needed, then generate.
              </p>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
