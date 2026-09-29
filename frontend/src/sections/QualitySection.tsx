import {
  ArrowDownRight, ArrowRight, BarChart3, CalendarRange, CheckCircle2, Columns3, Info, Percent, Rows3, Sigma, TableProperties,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { CheckStatus, DatasetProfile, EdgeCaseApplied, GenerateResponse, GenerationPlan } from "../api/types";
import { Legend, RangeStrip, Timeline, DualBar } from "../components/charts";
import { Badge, Bar, Button, Callout, Card, CardHeader, Collapsible, Mono, Segmented, SectionTitle, StatCard, type Tone } from "../components/ui";
import { STATUS_TONE } from "../components/badges";
import {
  compareFidelity, gapLevel, type CategoricalComparison, type DateComparison, type FidelityReport, type NumericComparison,
} from "../lib/fidelity";
import { fmtInt, fmtNum } from "../lib/format";
import { checkCounts, ruleSummary, validationTiles } from "../lib/validation";
import type { SourceMode } from "../state/workspace";

const STATUS_LABEL: Record<CheckStatus, string> = { passed: "Passed", warning: "Warning", error: "Error", skipped: "Skipped" };
const GAP_TONE: Record<"small" | "moderate" | "large", Tone> = { small: "success", moderate: "warning", large: "danger" };
const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

interface Props {
  source: SourceMode | null;
  profile: DatasetProfile | null;
  plan: GenerationPlan;
  result: GenerateResponse;
}

export function QualitySection({ source, profile, plan, result }: Props) {
  const sample = source === "sample" && !!profile;
  const rows = useMemo(() => {
    if (!profile) return [];
    return result.data[profile.table_name] ?? result.data[plan.tables[0]?.name] ?? [];
  }, [profile, result, plan]);
  const fidelity = useMemo(
    () => (sample && profile ? compareFidelity(profile, rows, plan, result.metadata.edge_cases_applied) : null),
    [sample, profile, rows, plan, result],
  );

  return (
    <section id="sec-quality" className="scroll-mt-32 animate-fade-up space-y-4">
      <SectionTitle eyebrow="Step 6" title="Quality & Fidelity"
        description={sample
          ? "Did the synthetic data preserve the useful characteristics of your source? Every figure below is calculated from your file's profile and the generated rows."
          : "How trustworthy is the generated data? These metrics come from the deterministic validation checks."} />
      {sample && fidelity ? (
        <SampleQuality f={fidelity} result={result} plan={plan} />
      ) : (
        <PromptQuality result={result} plan={plan} />
      )}
    </section>
  );
}

// ------------------------------------------------------------------ shared: validation summary
function ValidationSummary({ result }: { result: GenerateResponse }) {
  const report = result.validation;
  const tiles = validationTiles(report);
  const rules = ruleSummary(report);
  const items: { title: string; status: CheckStatus; detail: string }[] = [
    ...tiles.map((t) => ({ title: t.title, status: t.status, detail: t.na ? "not applicable" : `${t.checks.length} check${t.checks.length > 1 ? "s" : ""}` })),
    ...(rules ? [{ title: "Business rules", status: rules.status, detail: `${rules.checked} checked · ${rules.skipped} skipped` }] : []),
  ];
  return (
    <Card>
      <CardHeader icon={<CheckCircle2 className="size-4" />} title="Validation summary"
        subtitle="Deterministic checks run in code — summarized here, detailed in Step 5"
        right={<Button size="sm" variant="ghost" onClick={() => jumpTo("sec-validate")} icon={<ArrowDownRight className="size-3.5 rotate-180" />}>View full validation</Button>} />
      <div className="flex flex-wrap gap-2 p-5">
        {items.map((i) => (
          <div key={i.title} className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-2">
            <Badge tone={i.detail === "not applicable" ? "muted" : STATUS_TONE[i.status]}>
              {i.detail === "not applicable" ? "N/A" : STATUS_LABEL[i.status]}
            </Badge>
            <div>
              <div className="text-[13px] font-medium text-fg">{i.title}</div>
              <div className="text-[11px] text-fg-mute">{i.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ prompt mode: validation-focused only
function PromptQuality({ result, plan }: { result: GenerateResponse; plan: GenerationPlan }) {
  const v = result.validation;
  const counts = checkCounts(v);
  const injected = result.metadata.edge_cases_applied.reduce((n, e) => n + e.rows_affected, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Tables generated" value={result.metadata.tables_generated} icon={<TableProperties className="size-4" />} />
        <StatCard label="Synthetic rows" value={fmtInt(result.metadata.rows_generated)} icon={<Rows3 className="size-4" />} />
        <StatCard label="Validation" value={v.passed ? "Passed" : "Failed"} tone={v.passed ? (v.warning_count ? "warning" : "success") : "danger"}
          hint={`${v.error_count} errors · ${v.warning_count} warnings`} />
        <StatCard label="Checks passed" value={`${counts.passed}/${counts.total - counts.skipped}`} hint={counts.skipped ? `${counts.skipped} not machine-checkable` : "all checkable rules ran"}
          tone={counts.error ? "danger" : undefined} />
        <StatCard label="Edge-case rows" value={fmtInt(injected)} hint={`${result.metadata.edge_cases_applied.length} injection${result.metadata.edge_cases_applied.length === 1 ? "" : "s"}`} />
      </div>
      <Callout tone="info" title="No source dataset in prompt mode">
        Original-vs-synthetic comparisons need an uploaded CSV to compare against. Upload one in the Input step to see distribution fidelity.
      </Callout>
      <ValidationSummary result={result} />
      <Card>
        <CardHeader icon={<Rows3 className="size-4" />} title="Rows: planned vs generated" subtitle="From the Generation Plan and the generation metadata" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-fg-mute">
                <th className="px-5 py-2.5 font-medium">Table</th><th className="px-3 py-2.5 text-right font-medium">Target</th>
                <th className="px-3 py-2.5 text-right font-medium">Generated</th><th className="px-5 py-2.5 font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {plan.tables.map((t) => {
                const got = result.metadata.rows_per_table[t.name] ?? 0;
                const ok = t.target_rows != null ? got === t.target_rows : null;
                return (
                  <tr key={t.name} className="border-b border-line/70">
                    <td className="px-5 py-2.5 font-mono text-fg">{t.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-fg-dim">{t.target_rows != null ? fmtInt(t.target_rows) : "default"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-fg">{fmtInt(got)}</td>
                    <td className="px-5 py-2.5">{ok == null ? <Badge tone="muted">no target</Badge> : <Badge tone={ok ? "success" : "danger"}>{ok ? "Exact" : "Differs"}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ sample mode: original vs synthetic
type Tab = "categories" | "numeric" | "nulls" | "dates" | "schema";

function SampleQuality({ f, result, plan }: { f: FidelityReport; result: GenerateResponse; plan: GenerationPlan }) {
  const v = result.validation;
  const edge = result.metadata.edge_cases_applied;
  const counts: Record<Tab, number> = {
    categories: f.categorical.length, numeric: f.numeric.length, nulls: f.nulls.length, dates: f.dates.length, schema: f.schema.source.length,
  };
  const firstWithContent = (["categories", "numeric", "nulls", "dates"] as Tab[]).find((t) => counts[t] > 0) ?? "schema";
  const [tab, setTab] = useState<Tab>(firstWithContent);
  const schemaOk = f.schema.matchPct === 100 && f.schema.typeMismatches.length === 0;
  const ratio = f.sourceRows ? f.syntheticRows / f.sourceRows : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Source rows" value={fmtInt(f.sourceRows)} icon={<Rows3 className="size-4" />} hint="rows in your CSV" />
        <StatCard label="Synthetic rows" value={fmtInt(f.syntheticRows)} icon={<TableProperties className="size-4" />}
          hint={ratio ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× the source` : undefined} />
        <StatCard label="Schema match" value={`${Math.round(f.schema.matchPct)}%`} tone={schemaOk ? "success" : "warning"} icon={<Columns3 className="size-4" />}
          hint={`${f.schema.matched.length}/${f.schema.source.length} columns${f.schema.typeMismatches.length ? ` · ${f.schema.typeMismatches.length} type issue(s)` : ""}`} />
        <StatCard label="Validation" value={v.passed ? "Passed" : "Failed"} tone={v.passed ? (v.warning_count ? "warning" : "success") : "danger"}
          hint={`${v.error_count} errors · ${v.warning_count} warnings`} />
        <StatCard label="Compared columns" value={`${f.comparedColumns}/${f.schema.source.length}`} icon={<BarChart3 className="size-4" />}
          hint={f.skipped.length ? `${f.skipped.length} not compared` : "all columns"} />
        <StatCard label="Largest category gap" value={f.largestGap ? `${f.largestGap.pp.toFixed(1)} pp` : "—"} icon={<Percent className="size-4" />}
          tone={f.largestGap ? (gapLevel(f.largestGap.pp) === "small" ? "success" : gapLevel(f.largestGap.pp) === "moderate" ? "warning" : "danger") : undefined}
          hint={f.largestGap ? `${f.largestGap.column} · ${f.largestGap.label}` : "no categorical columns"} />
      </div>

      <ValidationSummary result={result} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <Segmented<Tab> value={tab} onChange={setTab} options={[
            { value: "categories", label: <><BarChart3 className="size-4" />Categories <Count n={counts.categories} /></> },
            { value: "numeric", label: <><Sigma className="size-4" />Numeric <Count n={counts.numeric} /></> },
            { value: "nulls", label: <><Percent className="size-4" />Nulls <Count n={counts.nulls} /></> },
            { value: "dates", label: <><CalendarRange className="size-4" />Dates <Count n={counts.dates} /></> },
            { value: "schema", label: <><Columns3 className="size-4" />Schema</> },
          ]} />
          {(tab === "categories" || tab === "numeric" || tab === "dates") && <Legend />}
        </div>
        <div className="p-5">
          {tab === "categories" && <CategoriesTab items={f.categorical} edge={edge} />}
          {tab === "numeric" && <NumericTab items={f.numeric} />}
          {tab === "nulls" && <NullsTab f={f} />}
          {tab === "dates" && <DatesTab items={f.dates} />}
          {tab === "schema" && <SchemaTab f={f} plan={plan} />}
        </div>
      </Card>

      <p className="flex items-start gap-2 text-xs text-fg-mute">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Only aggregated figures are shown — category shares, summary statistics, null rates and date ranges. Personal-data columns are never charted,
        and differences shrink as the synthetic sample grows (here {fmtInt(f.syntheticRows)} rows).
      </p>
    </>
  );
}

const Count = ({ n }: { n: number }) => <span className="rounded bg-panel px-1.5 text-[11px] tabular-nums text-fg-mute">{n}</span>;

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-mute">{children}</div>;
}

// ------------------------------------------------------------------ categories
function CategoriesTab({ items, edge }: { items: CategoricalComparison[]; edge: EdgeCaseApplied[] }) {
  if (!items.length) return <Empty>No categorical columns were detected in the source, so there are no category shares to compare.</Empty>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-mute">Bars show each category's share of non-null values. Original comes from your file's profile; synthetic is counted from the generated rows.</p>
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {items.map((c) => {
          const max = Math.max(1, ...c.bars.flatMap((b) => [b.orig, b.synth]));
          const level = gapLevel(c.maxGap);
          const edgeHit = edge.filter((e) => e.column === c.column && e.kind === "rare_category" && e.rows_affected > 0);
          return (
            <div key={c.column} className="rounded-xl border border-line bg-canvas/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-fg">{c.column}</span>
                  <span className="text-[11px] text-fg-mute">{c.totalCategories} categor{c.totalCategories === 1 ? "y" : "ies"} · n={fmtInt(c.nSynthetic)}</span>
                </div>
                <Badge tone={GAP_TONE[level]} title="Largest difference between original and synthetic share, in percentage points">
                  Max gap {c.maxGap.toFixed(1)} pp{c.maxGapLabel ? ` · ${c.maxGapLabel}` : ""}
                </Badge>
              </div>
              <div className="space-y-3">
                {c.bars.map((b) => (
                  <DualBar key={b.label} label={b.label} orig={b.orig} synth={b.synth} max={max}
                    badge={b.isNew ? <Badge tone="violet" title="Not present in the source (e.g. a category you requested)">new</Badge> : undefined} />
                ))}
              </div>
              {(c.newCategories.length > 0 || c.missingCategories.length > 0 || edgeHit.length > 0) && (
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-fg-mute">
                  {c.newCategories.length > 0 && <p><span className="text-violet-300">New in synthetic:</span> {c.newCategories.join(", ")} — added on purpose (requested category / edge case).</p>}
                  {c.missingCategories.length > 0 && <p><span className="text-amber-300">Missing from synthetic:</span> {c.missingCategories.join(", ")}</p>}
                  {edgeHit.map((e, i) => <p key={i}><span className="text-accent-soft">Edge case:</span> {e.detail ?? e.kind} ({fmtInt(e.rows_affected)} rows)</p>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ numeric
function deltaOf(o: number, s: number): { text: string; rel: number | null } {
  if (o === 0) return { text: s === 0 ? "0" : `+${fmtNum(s)}`, rel: null };
  const rel = ((s - o) / Math.abs(o)) * 100;
  return { text: `${rel > 0 ? "+" : ""}${rel.toFixed(1)}%`, rel };
}
const deltaTone = (rel: number | null): string =>
  rel == null ? "text-fg-mute" : Math.abs(rel) <= 5 ? "text-emerald-300" : Math.abs(rel) <= 15 ? "text-amber-300" : "text-rose-300";

function NumericTab({ items }: { items: NumericComparison[] }) {
  if (!items.length) return <Empty>No numeric columns with enough values were found, so there are no summary statistics to compare.</Empty>;
  const metrics: { key: "mean" | "median" | "min" | "max" | "std"; label: string; tone: boolean }[] = [
    { key: "mean", label: "Mean", tone: true }, { key: "median", label: "Median", tone: true },
    { key: "std", label: "Std dev", tone: true }, { key: "min", label: "Min", tone: false }, { key: "max", label: "Max", tone: false },
  ];
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-mute">
        Your file's histogram isn't kept — only summary statistics are — so distributions are compared through quantiles and real summary statistics.
        Δ colour applies to mean, median and spread; min and max are sample extremes and shown neutrally.
      </p>
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {items.map((c) => (
          <div key={c.column} className="rounded-xl border border-line bg-canvas/30 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium text-fg">{c.column}</span>
              <div className="flex items-center gap-1.5">
                {c.outlierInjected && <Badge tone="violet" title="An outlier edge case stretched the range on purpose">Outliers injected</Badge>}
                <span className="text-[11px] text-fg-mute">n {fmtInt(c.orig.n)} → {c.synth ? fmtInt(c.synth.n) : "—"}</span>
              </div>
            </div>
            <RangeStrip orig={c.orig} synth={c.synth} />
            {c.synth ? (
              <table className="mt-3 w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-fg-mute">
                    <th className="py-1.5 text-left font-medium">Metric</th><th className="py-1.5 text-right font-medium">Original</th>
                    <th className="py-1.5 text-right font-medium">Synthetic</th><th className="py-1.5 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const d = deltaOf(c.orig[m.key], c.synth![m.key]);
                    return (
                      <tr key={m.key} className="border-t border-line/70">
                        <td className="py-1.5 text-fg-dim">{m.label}</td>
                        <td className="py-1.5 text-right tabular-nums text-indigo-200">{fmtNum(c.orig[m.key])}</td>
                        <td className="py-1.5 text-right tabular-nums text-accent-soft">{fmtNum(c.synth![m.key])}</td>
                        <td className={`py-1.5 text-right tabular-nums ${m.tone ? deltaTone(d.rel) : "text-fg-mute"}`}>{d.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-xs text-amber-300">{c.reason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ nulls
function NullsTab({ f }: { f: FidelityReport }) {
  if (!f.nulls.length)
    return <Empty>No missing values in the source or in the synthetic data — every column is complete on both sides.</Empty>;
  const max = Math.max(5, ...f.nulls.flatMap((n) => [n.orig, n.synth]));
  return (
    <div className="space-y-3">
      <Legend />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-fg-mute">
              <th className="py-2 pr-3 font-medium">Column</th><th className="px-3 py-2 font-medium">Original null %</th>
              <th className="px-3 py-2 font-medium">Synthetic null %</th><th className="py-2 pl-3 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {f.nulls.map((n) => {
              const d = n.synth - n.orig;
              return (
                <tr key={n.column} className="border-b border-line/70">
                  <td className="py-2.5 pr-3 font-mono text-fg">{n.column}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2"><Bar pct={(n.orig / max) * 100} className="w-32 [&>div]:!bg-indigo-300/80" />
                      <span className="tabular-nums text-fg-dim">{n.orig.toFixed(1)}%</span><span className="text-[11px] text-fg-mute">{fmtInt(n.origCount)} {n.origCount === 1 ? "row" : "rows"}</span></div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2"><Bar pct={(n.synth / max) * 100} className="w-32" />
                      <span className="tabular-nums text-fg-dim">{n.synth.toFixed(1)}%</span><span className="text-[11px] text-fg-mute">{fmtInt(n.synthCount)} {n.synthCount === 1 ? "row" : "rows"}</span></div>
                  </td>
                  <td className={`py-2.5 pl-3 text-right tabular-nums ${Math.abs(d) <= 1 ? "text-emerald-300" : Math.abs(d) <= 3 ? "text-amber-300" : "text-rose-300"}`}>
                    {d > 0 ? "+" : ""}{d.toFixed(1)} pp
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dates
const shortDate = (s: string) => s.replace("T", " ").replace(/:00$/, "");

function DatesTab({ items }: { items: DateComparison[] }) {
  if (!items.length) return <Empty>No date or datetime columns were found in the source.</Empty>;
  return (
    <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      {items.map((d) => (
        <div key={d.column} className="rounded-xl border border-line bg-canvas/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-sm font-medium text-fg">{d.column}</span>
            {d.reason ? <Badge tone="warning">{d.reason}</Badge>
              : <Badge tone={d.withinRange ? "success" : "warning"}>{d.withinRange ? "Within source range" : "Extends beyond source range"}</Badge>}
          </div>
          <Timeline origMin={d.origMin} origMax={d.origMax} synthMin={d.synthMin} synthMax={d.synthMax} />
          <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
            <div className="rounded-md bg-panel-2 px-3 py-2">
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-indigo-300">Original</div>
              <div className="flex items-center gap-2 font-mono text-fg"><span>{shortDate(d.origMin)}</span><ArrowRight className="size-3 text-fg-mute" /><span>{shortDate(d.origMax)}</span></div>
            </div>
            <div className="rounded-md bg-panel-2 px-3 py-2">
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-accent">Synthetic</div>
              {d.synthMin && d.synthMax
                ? <div className="flex items-center gap-2 font-mono text-fg"><span>{shortDate(d.synthMin)}</span><ArrowRight className="size-3 text-fg-mute" /><span>{shortDate(d.synthMax)}</span></div>
                : <span className="text-fg-mute">—</span>}
            </div>
          </div>
          {d.coveragePct != null && <p className="mt-2 text-xs text-fg-mute">Synthetic dates cover {d.coveragePct.toFixed(1)}% of the original time span.</p>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ schema
function ChipRow({ title, items, tone, empty }: { title: string; items: string[]; tone: Tone; empty: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-28 shrink-0 pt-0.5 text-xs text-fg-mute">{title} <span className="tabular-nums">({items.length})</span></div>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? items.map((c) => <Badge key={c} tone={tone}>{c}</Badge>) : <span className="text-xs text-fg-mute/70">{empty}</span>}
      </div>
    </div>
  );
}

function SchemaTab({ f }: { f: FidelityReport; plan: GenerationPlan }) {
  const s = f.schema;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Source columns" value={s.source.length} />
        <StatCard label="Generated" value={s.generated.length} />
        <StatCard label="Matched" value={s.matched.length} tone={s.matched.length === s.source.length ? "success" : "warning"} />
        <StatCard label="Missing" value={s.missing.length} tone={s.missing.length ? "danger" : undefined} />
        <StatCard label="Unexpected" value={s.unexpected.length} tone={s.unexpected.length ? "warning" : undefined} />
      </div>
      <div className="divide-y divide-line rounded-lg border border-line px-4">
        <ChipRow title="Matched" items={s.matched} tone="success" empty="none" />
        <ChipRow title="Missing" items={s.missing} tone="danger" empty="none — every source column was generated" />
        <ChipRow title="Unexpected" items={s.unexpected} tone="warning" empty="none — no extra columns" />
      </div>
      {s.typeMismatches.length > 0 && (
        <Callout tone="warning" title="Type mismatches">
          <ul className="list-inside list-disc">{s.typeMismatches.map((m) => <li key={m.column}><Mono>{m.column}</Mono> expected {m.expected}, generated {m.got}</li>)}</ul>
        </Callout>
      )}
      {f.skipped.length > 0 && (
        <Collapsible title="Columns not compared" badge={<Badge tone="neutral">{f.skipped.length}</Badge>}>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {f.skipped.map((c) => (
              <li key={c.column} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                <span className="font-mono text-fg">{c.column}</span><span className="text-xs text-fg-mute">{c.reason}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}
