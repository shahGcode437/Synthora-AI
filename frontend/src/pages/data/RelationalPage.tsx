import { ArrowRight, CheckCircle2, GitFork, Network, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { FKBadge, PKBadge } from "../../components/badges";
import { DataGrid } from "../../components/DataGrid";
import { RelationshipGraph } from "../../components/RelationshipGraph";
import { Badge, Callout, Card, CardHeader, StatCard } from "../../components/ui";
import { columnsOf } from "../../lib/datagrid";
import type { GraphTable } from "../../lib/graph";
import { fmtInt } from "../../lib/format";
import { checkIntegrity, type RelationCheck } from "../../lib/integrity";
import { DataModule } from "./DataModule";
import { useActiveDataset, type ActiveDataset } from "./useActiveDataset";

export function RelationalPage() {
  const ctl = useActiveDataset();
  return (
    <DataModule ctl={ctl} title="Relational Data" crumbs={[{ label: "Workspace", to: "/app/overview" }, { label: "Relational Data" }]}
      description="Tables, keys and relationships, with referential integrity measured directly from the generated rows.">
      {(d) => <RelationalBody d={d} />}
    </DataModule>
  );
}

function RelationalBody({ d }: { d: ActiveDataset }) {
  const names = Object.keys(d.data);
  const checks = useMemo(() => checkIntegrity(d.data, d.plan), [d.data, d.plan]);
  const tables = useMemo<GraphTable[]>(() => names.map((n) => {
    const t = d.plan?.tables.find((x) => x.name === n);
    const cols = t ? t.columns.map((c) => c.name) : columnsOf(d.data[n]);
    return {
      name: n, columns: cols, rows: d.data[n].length,
      pk: t ? (t.primary_key.length ? t.primary_key : t.columns.filter((c) => c.is_primary_key).map((c) => c.name)) : [],
      fks: [...new Set(checks.filter((c) => c.childTable === n).map((c) => c.childColumn))],
    };
  }), [names, d.plan, d.data, checks]);
  const [selected, setSelected] = useState<string | null>(names[0] ?? null);
  const sel = tables.find((t) => t.name === selected) ?? tables[0];

  const verified = checks.filter((c) => c.verifiable);
  const orphans = verified.reduce((n, c) => n + c.orphans, 0);
  const touching = checks.filter((c) => c.parentTable === sel?.name || c.childTable === sel?.name);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tables" value={names.length} icon={<Network className="size-4" />} hint={`${fmtInt(names.reduce((n, t) => n + d.data[t].length, 0))} rows in total`} />
        <StatCard label="Relationships" value={checks.length} icon={<GitFork className="size-4" />} hint={checks.length ? "from the Generation Plan" : "none in this dataset"} />
        <StatCard label="Verified" value={`${verified.filter((c) => c.ok).length}/${checks.length}`} tone={checks.length && verified.length === checks.length && orphans === 0 ? "success" : checks.length ? "warning" : undefined}
          hint="checked against the rows" />
        <StatCard label="Orphan rows" value={fmtInt(orphans)} tone={checks.length ? (orphans === 0 ? "success" : "danger") : undefined} hint="child rows with no parent" />
      </div>

      {!d.plan && <Callout tone="warning" title="No plan stored with this dataset">Without a Generation Plan the relationships are unknown, so the graph shows tables only.</Callout>}
      {d.plan && checks.length === 0 && names.length > 1 && <Callout tone="info" title="No relationships were planned">These tables are independent: nothing references anything else.</Callout>}

      <Card>
        <CardHeader icon={<Network className="size-4" />} title="Relationship graph" subtitle="Arrows run from parent key to child foreign key. Green = every reference resolves; red = orphans found. Click a table to inspect it."
          right={<><Badge tone="success">✓ valid</Badge><Badge tone="danger">orphans</Badge></>} />
        <div className="p-4"><RelationshipGraph tables={tables} checks={checks} selected={sel?.name ?? null} onSelect={setSelected} /></div>
      </Card>

      {sel && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <Card>
            <CardHeader title={<span className="font-mono">{sel.name}</span>} subtitle={`${fmtInt(sel.rows)} rows · ${sel.columns.length} columns`} />
            <div className="space-y-4 p-5">
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-mute">Keys</div>
                <div className="flex flex-wrap gap-2">
                  {sel.pk.map((k) => <span key={k} className="inline-flex items-center gap-1"><PKBadge /><span className="font-mono text-xs">{k}</span></span>)}
                  {sel.fks.map((k) => <span key={k} className="inline-flex items-center gap-1"><FKBadge /><span className="font-mono text-xs">{k}</span></span>)}
                  {!sel.pk.length && !sel.fks.length && <span className="text-xs text-fg-mute">No keys recorded</span>}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-mute">Relationships</div>
                {touching.length === 0 ? <p className="text-xs text-fg-mute">This table is not connected to another.</p> : (
                  <ul className="space-y-2">{touching.map((c) => <RelationRow key={`${c.parentTable}${c.parentColumn}${c.childTable}${c.childColumn}`} c={c} self={sel.name} />)}</ul>
                )}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Table preview" subtitle={`Rows of ${sel.name}`} />
            <div className="p-5">
              <DataGrid rows={d.data[sel.name]} tableLabel={sel.name} maxHeight="24rem" initialPageSize={25}
                meta={{ pk: sel.pk, fks: Object.fromEntries(checks.filter((c) => c.childTable === sel.name).map((c) => [c.childColumn, `${c.parentTable}.${c.parentColumn}`])) }} />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function RelationRow({ c, self }: { c: RelationCheck; self: string }) {
  const out = c.parentTable === self;
  return (
    <li className="rounded-lg border border-line bg-canvas/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-mono text-fg">{c.parentTable}.{c.parentColumn}</span><ArrowRight className="size-3 text-fg-mute" /><span className="font-mono text-fg">{c.childTable}.{c.childColumn}</span>
        {c.cardinality && <Badge tone="accent">{c.cardinality}</Badge>}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {!c.verifiable ? <span className="text-fg-mute">Not verifiable from this data</span>
          : c.ok ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="size-3.5" />{fmtInt(c.checked)} reference{c.checked === 1 ? "" : "s"} checked · no orphans</span>
            : <span className="flex items-center gap-1 text-rose-300"><XCircle className="size-3.5" />{fmtInt(c.orphans)} orphan{c.orphans === 1 ? "" : "s"} of {fmtInt(c.checked)}</span>}
        {c.verifiable && c.emptyRefs > 0 && <span className="text-fg-mute">· {fmtInt(c.emptyRefs)} empty</span>}
      </div>
      <div className="mt-1 text-[11px] text-fg-mute">{out ? "This table is the parent" : "This table is the child"}</div>
    </li>
  );
}
