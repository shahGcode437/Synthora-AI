import {
  ArrowRight, Check, ChevronRight, Dice5, GitFork, Info, Lightbulb, ListChecks, Minus, Scale, Sparkles, TriangleAlert,
} from "lucide-react";
import { Fragment, useState } from "react";
import type {
  AIRunMeta, BusinessRule, ColumnPlan, EdgeCaseConfig, GenerationPlan, Relationship, TablePlan,
} from "../api/types";
import { ConfidenceMeter, FKBadge, PIIBadge, PKBadge, PrivacyActionBadge, StrategyBadge } from "../components/badges";
import { Badge, Button, Callout, Card, CardHeader, Collapsible, Input, Label, Mono, SectionTitle } from "../components/ui";
import { cn } from "../lib/cn";
import { fmtInt, fmtMs, fmtPct, humanize, parseIntOrNull } from "../lib/format";

interface Props {
  plan: GenerationPlan;
  ai: AIRunMeta | null;
  generating: boolean;
  hasResult: boolean;
  disabled: boolean;
  onSetRows: (table: string, rows: number | null) => void;
  onGenerate: (seed: number | null) => void;
}

export function PlanSection({ plan, ai, generating, hasResult, disabled, onSetRows, onGenerate }: Props) {
  return (
    <section id="sec-plan" className="scroll-mt-32 animate-fade-up space-y-4">
      <SectionTitle eyebrow="Step 3" title="Generation Plan"
        description="This is what will be generated and why. AI decides the meaning; code guarantees keys, relationships and arithmetic." />
      <PlanOverview plan={plan} ai={ai} />

      <div className="space-y-3">
        {plan.tables.map((t, i) => (
          <TableCard key={t.name} table={t} plan={plan} defaultOpen={plan.tables.length <= 3 || i === 0}
            disabled={disabled} onSetRows={(n) => onSetRows(t.name, n)} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <RelationshipsCard relationships={plan.relationships} tables={plan.tables} />
        <BusinessRulesCard rules={plan.business_rules} />
      </div>
      <EdgeCasesCard cfg={plan.edge_cases} />
      <GenerateBar plan={plan} generating={generating} hasResult={hasResult} disabled={disabled} onGenerate={onGenerate} />
    </section>
  );
}

// ------------------------------------------------------------------ overview
function PlanOverview({ plan, ai }: { plan: GenerationPlan; ai: AIRunMeta | null }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold capitalize tracking-tight">{plan.domain.replace(/[_-]+/g, " ")}</h3>
            <Badge tone="accent">{plan.source_mode === "sample" ? "From sample CSV" : "From prompt"}</Badge>
            {plan.locale && <Badge tone="neutral">Locale {plan.locale}</Badge>}
            {plan.seed != null && <Badge tone="neutral" icon={<Dice5 className="size-3" />}>Seed {plan.seed}</Badge>}
            <Badge tone="muted">Privacy: {humanize(plan.privacy.mode)}</Badge>
          </div>
          {plan.summary && <p className="mt-2 text-sm leading-relaxed text-fg-dim">{plan.summary}</p>}
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-mute">Plan confidence</div>
            <div className="mt-1.5"><ConfidenceMeter value={plan.confidence} /></div>
          </div>
          {ai && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-fg-mute">AI</div>
              <div className="mt-1 text-sm"><span className="font-medium capitalize">{ai.provider}</span> <span className="text-fg-mute">· {fmtMs(ai.latency_ms)}</span></div>
              {ai.model && <div className="max-w-[12rem] truncate font-mono text-[11px] text-fg-mute">{ai.model}</div>}
            </div>
          )}
        </div>
      </div>

      {(plan.warnings.length > 0 || plan.assumptions.length > 0) && (
        <div className="grid gap-3 border-t border-line p-5 lg:grid-cols-2">
          {plan.warnings.length > 0 && (
            <Callout tone="warning" title={`${plan.warnings.length} warning${plan.warnings.length > 1 ? "s" : ""}`}>
              <ul className="list-inside list-disc space-y-0.5">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Callout>
          )}
          {plan.assumptions.length > 0 && (
            <Callout tone="info" title="Assumptions">
              <ul className="list-inside list-disc space-y-0.5">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </Callout>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ tables & columns
function TableCard({ table, plan, defaultOpen, disabled, onSetRows }: {
  table: TablePlan; plan: GenerationPlan; defaultOpen: boolean; disabled: boolean; onSetRows: (n: number | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [rowsText, setRowsText] = useState(table.target_rows?.toString() ?? "");
  const pk = table.primary_key.length ? table.primary_key : table.columns.filter((c) => c.is_primary_key).map((c) => c.name);
  const pii = table.columns.filter((c) => c.pii.classification !== "none").length;

  const commitRows = (text: string) => {
    setRowsText(text);
    const n = parseIntOrNull(text);
    if (n === null) onSetRows(null);
    else if (!Number.isNaN(n) && n >= 1 && n <= 1_000_000) onSetRows(n);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
          <ChevronRight className={cn("mt-1 size-4 shrink-0 text-fg-mute transition-transform", open && "rotate-90")} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[15px] font-semibold text-fg">{table.name}</span>
              <Badge tone="neutral">{table.columns.length} columns</Badge>
              {pii > 0 && <Badge tone="danger">{pii} PII</Badge>}
            </div>
            {table.description && <p className="mt-0.5 line-clamp-2 text-xs text-fg-mute">{table.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {pk.map((k) => <span key={k} className="inline-flex items-center gap-1"><PKBadge /><Mono>{k}</Mono></span>)}
              {table.foreign_keys.map((fk) => (
                <span key={fk.column} className="inline-flex items-center gap-1">
                  <FKBadge /><Mono>{fk.column}</Mono><ArrowRight className="size-3 text-fg-mute" /><Mono>{fk.references_table}.{fk.references_column}</Mono>
                </span>
              ))}
              {!pk.length && <span className="text-[11px] text-fg-mute">No primary key</span>}
            </div>
          </div>
        </button>
        <div className="w-40">
          <Label htmlFor={`rows-${table.name}`} hint="editable">Target rows</Label>
          <Input id={`rows-${table.name}`} inputMode="numeric" value={rowsText} placeholder="default 100" disabled={disabled}
            onChange={(e) => commitRows(e.target.value.replace(/[^\d]/g, ""))} className="text-right tabular-nums" />
        </div>
      </div>

      {open && (
        <div className="animate-fade-in overflow-x-auto border-t border-line">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-fg-mute">
                <th className="w-8 py-2.5 pl-4" />
                {["Column", "Type", "Semantic type", "Generator", "Null", "Unique", "PII / Privacy", "Confidence"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.columns.map((c) => <ColumnRow key={c.name} col={c} table={table} plan={plan} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ColumnRow({ col, table }: { col: ColumnPlan; table: TablePlan; plan: GenerationPlan }) {
  const [open, setOpen] = useState(false);
  const fk = table.foreign_keys.find((f) => f.column === col.name);
  const isPk = col.is_primary_key || table.primary_key.includes(col.name);
  const params = Object.entries(col.generator.params).filter(([, v]) => v !== null && v !== undefined);
  return (
    <Fragment>
      <tr className="cursor-pointer border-b border-line/70 transition-colors hover:bg-panel-2/60" onClick={() => setOpen((o) => !o)}>
        <td className="py-2.5 pl-4"><ChevronRight className={cn("size-3.5 text-fg-mute transition-transform", open && "rotate-90")} /></td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-medium text-fg">{col.name}</span>
            {isPk && <PKBadge />}
            {fk && <FKBadge to={`${fk.references_table}.${fk.references_column}`} />}
            <PIIBadge cls={col.pii.classification} reason={col.pii.reason} />
          </div>
        </td>
        <td className="px-3 py-2.5"><Mono>{col.data_type}</Mono></td>
        <td className="px-3 py-2.5 text-fg-dim">{col.semantic_type}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <StrategyBadge strategy={col.generator.strategy} />
            {col.generator.generator && <span className="hidden font-mono text-[11px] text-fg-mute xl:inline">{col.generator.generator}</span>}
          </div>
        </td>
        <td className="px-3 py-2.5">{col.nullable ? <Check className="size-4 text-fg-dim" aria-label="Nullable" /> : <Minus className="size-4 text-fg-mute/50" aria-label="Not nullable" />}</td>
        <td className="px-3 py-2.5">{col.is_unique || isPk ? <Check className="size-4 text-emerald-400" aria-label="Unique" /> : <Minus className="size-4 text-fg-mute/50" aria-label="Not unique" />}</td>
        <td className="px-3 py-2.5">
          {col.pii.classification === "none" && col.pii.privacy_action === "none" ? <span className="text-fg-mute">—</span> : <PrivacyActionBadge action={col.pii.privacy_action} />}
        </td>
        <td className="px-3 py-2.5"><ConfidenceMeter value={col.confidence} /></td>
      </tr>
      {open && (
        <tr className="border-b border-line/70 bg-canvas/40">
          <td />
          <td colSpan={8} className="animate-fade-in px-3 py-3">
            <div className="grid gap-4 text-xs md:grid-cols-3">
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-mute">Description</div>
                <p className="text-fg-dim">{col.description ?? "—"}</p>
                {col.pii.reason && <p className="mt-2 text-fg-mute"><span className="text-fg-dim">PII reason:</span> {col.pii.reason}</p>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-mute">Generator</div>
                <div className="space-y-1 text-fg-dim">
                  <div>Strategy <Mono>{col.generator.strategy}</Mono>{col.generator.generator && <> · <Mono>{col.generator.generator}</Mono></>}</div>
                  {col.generator.depends_on.length > 0 && <div>Depends on {col.generator.depends_on.map((d) => <Mono key={d} className="mr-1">{d}</Mono>)}</div>}
                  {params.length > 0 && (
                    <pre className="max-h-40 overflow-auto rounded-md bg-panel-3 p-2 font-mono text-[11px] leading-relaxed text-fg-dim">
                      {JSON.stringify(Object.fromEntries(params), null, 1)}
                    </pre>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-mute">Allowed values</div>
                {col.allowed_values?.length
                  ? <div className="flex flex-wrap gap-1">{col.allowed_values.map((v) => <Badge key={v} tone="sky">{v}</Badge>)}</div>
                  : <span className="text-fg-mute">Unrestricted</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// ------------------------------------------------------------------ relationships / rules / edge cases
function RelationshipsCard({ relationships, tables }: { relationships: Relationship[]; tables: TablePlan[] }) {
  return (
    <Card>
      <CardHeader icon={<GitFork className="size-4" />} title="Relationships"
        subtitle="Enforced by code: no orphan rows, valid keys" right={<Badge tone="neutral">{relationships.length}</Badge>} />
      <div className="space-y-2.5 p-5">
        {relationships.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-mute">
            {tables.length > 1 ? "The AI found no relationships between these tables." : "Single table — no relationships needed."}
          </div>
        ) : relationships.map((r) => (
          <div key={`${r.parent_table}.${r.parent_column}-${r.child_table}.${r.child_column}`}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-canvas/40 px-3.5 py-3 animate-fade-in">
            <div className="min-w-0">
              <div className="font-mono text-sm font-medium text-fg">{r.parent_table}</div>
              <div className="font-mono text-[11px] text-fg-mute">{r.parent_column}</div>
            </div>
            <div className="flex flex-col items-center gap-0.5 text-accent">
              <Badge tone="accent">{r.cardinality}</Badge>
              <ArrowRight className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-sm font-medium text-fg">{r.child_table}</div>
              <div className="font-mono text-[11px] text-fg-mute">{r.child_column}</div>
            </div>
            <div className="ml-auto"><ConfidenceMeter value={r.confidence} /></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BusinessRulesCard({ rules }: { rules: BusinessRule[] }) {
  return (
    <Card>
      <CardHeader icon={<Scale className="size-4" />} title="Business rules" subtitle="Checked after generation where machine-checkable"
        right={<Badge tone="neutral">{rules.length}</Badge>} />
      <div className="space-y-2.5 p-5">
        {rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-mute">No business rules proposed.</div>
        ) : rules.map((r) => (
          <div key={r.id} className="rounded-lg border border-line bg-canvas/40 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.severity === "error" ? "danger" : "warning"} icon={r.severity === "error" ? <TriangleAlert className="size-3" /> : <Info className="size-3" />}>{r.severity}</Badge>
              {r.tables.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
            </div>
            <p className="mt-1.5 text-sm text-fg">{r.description}</p>
            {r.expression && <Mono className="mt-1.5 block w-fit max-w-full overflow-x-auto whitespace-nowrap">{r.expression}</Mono>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RateCell({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/40 px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-fg-mute">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{v == null ? <span className="text-fg-mute">—</span> : fmtPct(v, v < 0.1 ? 1 : 0)}</div>
    </div>
  );
}

function EdgeCasesCard({ cfg }: { cfg: EdgeCaseConfig }) {
  return (
    <Card>
      <CardHeader icon={<Lightbulb className="size-4" />} title="Edge cases" subtitle="Deliberate, plausible test conditions injected after core generation"
        right={<Badge tone="accent">{humanize(cfg.mode)}</Badge>} />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <RateCell label="Null rate" v={cfg.null_rate} />
          <RateCell label="Outlier rate" v={cfg.outlier_rate} />
          <RateCell label="Rare-category rate" v={cfg.rare_category_rate} />
        </div>
        {cfg.recommendations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-fg-mute">
            {cfg.mode === "none" ? "Edge cases are turned off." : "No specific edge cases recommended."}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {cfg.recommendations.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                <ListChecks className="mt-0.5 size-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">{humanize(r.name)}</span>
                    <Badge tone="violet">{humanize(r.kind)}</Badge>
                    {r.table && <Mono>{r.table}{r.column ? `.${r.column}` : ""}</Mono>}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-dim">{r.description}</p>
                  {r.rationale && <p className="mt-0.5 text-xs text-fg-mute">Why: {r.rationale}</p>}
                </div>
                {r.rate != null && <Badge tone="neutral">{fmtPct(r.rate, r.rate < 0.1 ? 1 : 0)}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ generate action
function GenerateBar({ plan, generating, hasResult, disabled, onGenerate }: {
  plan: GenerationPlan; generating: boolean; hasResult: boolean; disabled: boolean; onGenerate: (seed: number | null) => void;
}) {
  const [seedText, setSeedText] = useState(plan.seed != null ? String(plan.seed) : "");
  const seed = parseIntOrNull(seedText);
  const seedBad = seed !== null && Number.isNaN(seed);
  const total = plan.tables.reduce((n, t) => n + (t.target_rows ?? 100), 0);
  const defaulted = plan.tables.some((t) => t.target_rows == null);

  return (
    <div id="sec-generate-action" className="scroll-mt-32">
    <Card className="border-accent/25 bg-gradient-to-r from-accent/[0.07] via-panel to-panel">
      <div className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <div className="text-sm font-semibold">{hasResult ? "Regenerate with the current plan" : "Ready to generate"}</div>
          <p className="mt-0.5 text-sm text-fg-dim">
            About <span className="font-medium tabular-nums text-fg">{fmtInt(total)}</span> rows across{" "}
            <span className="font-medium text-fg">{plan.tables.length}</span> table{plan.tables.length > 1 ? "s" : ""}
            {defaulted && <span className="text-amber-300"> · tables without a row count default to 100</span>}.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-36">
            <Label htmlFor="gen-seed" hint="optional">Seed</Label>
            <Input id="gen-seed" inputMode="numeric" placeholder="Random" value={seedText} disabled={disabled} invalid={seedBad}
              onChange={(e) => setSeedText(e.target.value.replace(/[^\d-]/g, ""))} />
          </div>
          <Button variant="primary" size="lg" loading={generating} disabled={disabled || seedBad}
            icon={<Sparkles className="size-4" />} onClick={() => onGenerate(seed)}>
            {hasResult ? "Regenerate" : "Generate Synthetic Data"}
          </Button>
        </div>
      </div>
    </Card>
    </div>
  );
}
