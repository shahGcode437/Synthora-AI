import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { exportData, saveBlob } from "../../api/client";
import { PKBadge, FKBadge, PIIBadge, StrategyBadge } from "../../components/badges";
import { Badge, Button, Card, CardHeader, Collapsible, Segmented, StatCard } from "../../components/ui";
import { DataGrid } from "../../components/DataGrid";
import { useToast } from "../../components/Toast";
import { columnsOf } from "../../lib/datagrid";
import { fmtInt } from "../../lib/format";
import { useRouter } from "../../router";
import { DataModule } from "./DataModule";
import { SaveDatasetButton } from "./SaveDataset";
import { useActiveDataset } from "./useActiveDataset";

export function TabularPage() {
  const ctl = useActiveDataset();
  return (
    <DataModule ctl={ctl} title="Tabular Data" crumbs={[{ label: "Workspace", to: "/app/overview" }, { label: "Tabular Data" }]}
      description="Explore the generated rows: search, filter, sort, choose columns and page through the data."
      actions={ctl.active?.id === "session" ? <SaveDatasetButton /> : undefined}>
      {(d) => <TabularBody d={d} />}
    </DataModule>
  );
}

function TabularBody({ d }: { d: NonNullable<ReturnType<typeof useActiveDataset>["active"]> }) {
  const toast = useToast();
  const { go } = useRouter();
  const names = Object.keys(d.data);
  const [table, setTable] = useState(names[0]);
  const current = names.includes(table) ? table : names[0];
  const rows = d.data[current] ?? [];
  const tplan = d.plan?.tables.find((t) => t.name === current);
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);

  const meta = useMemo(() => ({
    pk: tplan ? (tplan.primary_key.length ? tplan.primary_key : tplan.columns.filter((c) => c.is_primary_key).map((c) => c.name)) : [],
    fks: Object.fromEntries((tplan?.foreign_keys ?? []).map((f) => [f.column, `${f.references_table}.${f.references_column}`])),
    types: Object.fromEntries((tplan?.columns ?? []).map((c) => [c.name, c.data_type])),
  }), [tplan]);
  const columns = columnsOf(rows);
  const v = d.validation;
  const sv = d.savedValidation;
  const passed = v ? v.passed : sv?.passed;

  const download = async (format: "csv" | "json") => {
    setBusy(format);
    try { saveBlob(await exportData({ [current]: rows }, format, current)); toast.push("success", `${current}.${format} downloaded`); }
    catch (e) { toast.push("error", "Export failed", e instanceof Error ? e.message : undefined); }
    finally { setBusy(null); }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rows" value={fmtInt(rows.length)} hint={current} />
        <StatCard label="Columns" value={columns.length} hint={`${names.length} table${names.length === 1 ? "" : "s"} in this dataset`} />
        <StatCard label="Validation" value={passed === undefined ? "—" : passed ? "Passed" : "Failed"} tone={passed === undefined ? undefined : passed ? (v?.warning_count || sv?.warning_count ? "warning" : "success") : "danger"}
          hint={v ? `${v.error_count} errors · ${v.warning_count} warnings` : sv ? `${sv.error_count ?? 0} errors · ${sv.warning_count ?? 0} warnings` : "not recorded"} />
        <StatCard label="Seed" value={<span className="font-mono">{d.seed ?? "—"}</span>} hint={d.seed != null ? "same plan + seed = same rows" : undefined} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {names.length > 1
            ? <Segmented value={current} onChange={setTable} options={names.map((n) => ({ value: n, label: <>{n} <span className="text-fg-mute">{fmtInt(d.data[n].length)}</span></> }))} />
            : <div className="flex items-center gap-2"><FileSpreadsheet className="size-4 text-accent" /><span className="font-mono text-sm font-medium">{current}</span></div>}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" loading={busy === "csv"} disabled={!!busy} icon={<Download className="size-3.5" />} onClick={() => download("csv")}>CSV</Button>
            <Button size="sm" variant="secondary" loading={busy === "json"} disabled={!!busy} icon={<Download className="size-3.5" />} onClick={() => download("json")}>JSON</Button>
            {d.id === "session" && names.length > 1 && <Button size="sm" variant="ghost" onClick={() => go("/app/export")}>All tables…</Button>}
          </div>
        </div>
        <div className="p-5"><DataGrid rows={rows} meta={meta} tableLabel={current} /></div>
      </Card>

      <Card>
        <CardHeader title="Schema details" subtitle={d.plan ? `From the Generation Plan · ${tplan?.columns.length ?? 0} columns` : "No plan stored with this dataset: showing column names only"} />
        <div className="p-5">
          <Collapsible title="Show column details" defaultOpen={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead><tr className="border-b border-line text-[11px] uppercase tracking-wider text-fg-mute"><th className="py-2 pr-3 font-medium">Column</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Meaning</th><th className="px-3 py-2 font-medium">Generator</th><th className="px-3 py-2 font-medium">Nullable</th></tr></thead>
                <tbody>
                  {(tplan?.columns ?? columns.map((c) => null)).map((c, i) => {
                    const name = c ? c.name : columns[i];
                    return (
                      <tr key={name} className="border-b border-line/70">
                        <td className="py-2 pr-3"><span className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-fg">{name}</span>{meta.pk.includes(name) && <PKBadge />}{meta.fks[name] && <FKBadge to={meta.fks[name]} />}{c && <PIIBadge cls={c.pii.classification} reason={c.pii.reason} />}</span></td>
                        <td className="px-3 py-2 text-fg-dim">{c?.data_type ?? "—"}</td><td className="px-3 py-2 text-fg-dim">{c?.semantic_type ?? "—"}</td>
                        <td className="px-3 py-2">{c ? <StrategyBadge strategy={c.generator.strategy} /> : "—"}</td>
                        <td className="px-3 py-2">{c ? <Badge tone={c.nullable ? "neutral" : "muted"}>{c.nullable ? "yes" : "no"}</Badge> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Collapsible>
        </div>
      </Card>
    </>
  );
}

