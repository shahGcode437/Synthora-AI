import { CheckCircle2, Clock, Dice5, Rows3, Table2, TriangleAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { GenerateResponse, GenerationPlan, TablePlan } from "../api/types";
import { FKBadge, PKBadge } from "../components/badges";
import { Badge, Callout, Card, CardHeader, Segmented, SectionTitle, Skeleton, Spinner, StatCard } from "../components/ui";
import { cn } from "../lib/cn";
import { fmtCell, fmtInt, fmtMs } from "../lib/format";

const STAGES = [
  "Resolving table order (parents first)", "Generating values per column", "Preserving relationships",
  "Applying privacy rules", "Injecting edge cases", "Validating the output",
];

export function GeneratingCard() {
  return (
    <section id="sec-generate" className="scroll-mt-32 animate-fade-up space-y-4">
      <SectionTitle eyebrow="Step 4" title="Generating synthetic data" />
      <Card>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Spinner className="size-5" />
          <div className="text-sm font-medium">Building your dataset…</div>
        </div>
        <div className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-3 text-sm text-fg-dim">
              <span className="flex size-5 items-center justify-center rounded-full border border-line-strong text-[10px] text-fg-mute">{i + 1}</span>
              {s}
            </div>
          ))}
        </div>
        <div className="space-y-2 px-5 pb-5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
      </Card>
    </section>
  );
}

export function GeneratedSection({ result, plan }: { result: GenerateResponse; plan: GenerationPlan }) {
  const m = result.metadata;
  const v = result.validation;
  const tables = Object.keys(result.data);
  const ordered = useMemo(() => {
    const planOrder = plan.tables.map((t) => t.name).filter((n) => tables.includes(n));
    return [...planOrder, ...tables.filter((n) => !planOrder.includes(n))];
  }, [plan, tables]);
  const [active, setActive] = useState(ordered[0]);
  const current = ordered.includes(active) ? active : ordered[0];

  return (
    <section id="sec-generate" className="scroll-mt-32 animate-fade-up space-y-4">
      <SectionTitle eyebrow="Step 4" title="Generated data"
        description="A preview of the first rows. The full dataset is available through Export." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tables generated" value={m.tables_generated} icon={<Table2 className="size-4" />} hint={`Order: ${m.generation_order.join(" → ")}`} />
        <StatCard label="Total rows" value={fmtInt(m.rows_generated)} icon={<Rows3 className="size-4" />} hint={`${fmtMs(m.duration_ms)} to generate`} />
        <StatCard label="Validation" value={v.passed ? "Passed" : "Failed"} tone={v.passed ? (v.warning_count ? "warning" : "success") : "danger"}
          icon={v.passed ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          hint={`${v.error_count} error${v.error_count === 1 ? "" : "s"} · ${v.warning_count} warning${v.warning_count === 1 ? "" : "s"}`} />
        <StatCard label="Seed" value={<span className="font-mono">{m.seed}</span>} icon={<Dice5 className="size-4" />}
          hint={`from ${m.seed_source}${m.faker_locale !== m.locale ? ` · Faker ${m.faker_locale}` : ""}`} />
      </div>

      {result.warnings.length > 0 && (
        <Callout tone="warning" title={`${result.warnings.length} generation note${result.warnings.length > 1 ? "s" : ""}`}>
          <ul className="list-inside list-disc space-y-0.5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Callout>
      )}

      <Card>
        <CardHeader icon={<Table2 className="size-4" />} title="Data preview"
          subtitle={`${fmtInt(m.rows_per_table[current] ?? 0)} rows in ${current}`}
          right={ordered.length > 1 ? (
            <Segmented value={current} onChange={setActive} options={ordered.map((n) => ({
              value: n, label: <>{n} <span className="text-fg-mute">{fmtInt(m.rows_per_table[n] ?? 0)}</span></>,
            }))} />
          ) : undefined} />
        <PreviewTable key={current} rows={result.data[current] ?? []} table={plan.tables.find((t) => t.name === current)} />
      </Card>

      {m.edge_cases_applied.length > 0 && (
        <Card>
          <CardHeader icon={<TriangleAlert className="size-4" />} title="Edge cases injected" subtitle="Deliberate test conditions applied to the data" />
          <ul className="divide-y divide-line">
            {m.edge_cases_applied.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <Badge tone="violet">{e.kind.replace(/_/g, " ")}</Badge>
                <span className="font-mono text-fg-dim">{e.table}.{e.column}</span>
                <Badge tone="neutral">{fmtInt(e.rows_affected)} rows</Badge>
                {e.detail && <span className="text-xs text-fg-mute">{e.detail}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

const PAGE_SIZES = ["20", "50"] as const;

function PreviewTable({ rows, table }: { rows: Record<string, unknown>[]; table?: TablePlan }) {
  const [size, setSize] = useState<(typeof PAGE_SIZES)[number]>("20");
  const n = Number(size);
  const shown = rows.slice(0, n);
  const columns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const colPlan = (name: string) => table?.columns.find((c) => c.name === name);

  if (!rows.length) return <div className="p-8 text-center text-sm text-fg-mute">This table has no rows.</div>;
  return (
    <>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-12 border-b border-line bg-panel-2 px-3 py-2 text-right text-[11px] font-medium text-fg-mute">#</th>
              {columns.map((c) => {
                const cp = colPlan(c);
                const fk = table?.foreign_keys.find((f) => f.column === c);
                return (
                  <th key={c} className="sticky top-0 z-10 whitespace-nowrap border-b border-line bg-panel-2 px-3 py-2 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-fg">{c}</span>
                      {(cp?.is_primary_key || table?.primary_key.includes(c)) && <PKBadge />}
                      {fk && <FKBadge to={`${fk.references_table}.${fk.references_column}`} />}
                    </div>
                    {cp && <div className="text-[10px] font-normal text-fg-mute">{cp.data_type}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="group">
                <td className="border-b border-line/60 px-3 py-1.5 text-right text-[11px] tabular-nums text-fg-mute group-hover:bg-panel-2/50">{i + 1}</td>
                {columns.map((c) => <Cell key={c} v={r[c]} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5 text-xs text-fg-mute">
        <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> Showing the first {fmtInt(Math.min(n, rows.length))} of {fmtInt(rows.length)} rows</span>
        <div className="flex items-center gap-2">
          Rows
          <Segmented value={size} onChange={setSize} options={PAGE_SIZES.map((p) => ({ value: p, label: p }))} />
        </div>
      </div>
    </>
  );
}

function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined)
    return <td className="border-b border-line/60 px-3 py-1.5 text-xs italic text-fg-mute/70">null</td>;
  const isNum = typeof v === "number";
  const text = fmtCell(v);
  return (
    <td title={text.length > 30 ? text : undefined}
      className={cn("max-w-[18rem] truncate whitespace-nowrap border-b border-line/60 px-3 py-1.5 text-fg-dim",
        isNum && "text-right tabular-nums text-fg", typeof v === "boolean" && "text-sky-300")}>
      {text}
    </td>
  );
}
