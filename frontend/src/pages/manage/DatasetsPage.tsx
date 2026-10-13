import { Braces, Database, Download, Eye, Network, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { datasets as api, type DatasetDetail, type DatasetSummary } from "../../api/accounts";
import { exportData, saveBlob } from "../../api/client";
import type { ExportFormat } from "../../api/types";
import { DataGrid } from "../../components/DataGrid";
import { ConfirmDialog, Dialog } from "../../components/Dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "../../components/page";
import { Segmented, Badge, Button, Callout, Card, Skeleton } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { fmtBytes, fmtInt } from "../../lib/format";
import { useAsync, errMsg } from "../../lib/useAsync";
import { Link, useRouter } from "../../router";
import { useApp } from "../../state/AppContext";
import { SaveDatasetButton } from "../data/SaveDataset";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const sc = (d: DatasetSummary) => (d.validation?.passed === undefined ? null : d.validation.passed);

export function DatasetsPage() {
  const { go } = useRouter();
  const { ws } = useApp();
  const toast = useToast();
  const list = useAsync(() => api.list(), []);
  const [del, setDel] = useState<DatasetSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ meta: DatasetSummary; detail: DatasetDetail | null; error: string | null } | null>(null);
  const [tab, setTab] = useState<string>("");

  const preview = async (d: DatasetSummary) => {
    setView({ meta: d, detail: null, error: null }); setTab(d.tables[0]?.name ?? "");
    try { setView({ meta: d, detail: await api.get(d.id), error: null }); } catch (e) { setView({ meta: d, detail: null, error: errMsg(e) }); }
  };
  const download = async (d: DatasetSummary, format: ExportFormat) => {
    setBusy(`${d.id}:${format}`);
    try { saveBlob(await exportData(await api.data(d.id), format, d.name)); toast.push("success", "Export ready", `${d.name} · ${format.toUpperCase()}`); }
    catch (e) { toast.push("error", "Export failed", errMsg(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(del.id); setError(null);
    try { await api.remove(del.id); list.setData((l) => (l ?? []).filter((x) => x.id !== del.id)); toast.push("success", "Dataset deleted"); setDel(null); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };

  const items = list.data ?? [];
  return (
    <div className="animate-fade-up">
      <PageHeader crumbs={[{ label: "Management", to: "/app/overview" }, { label: "Datasets" }]} title="Datasets"
        description="Generated data you chose to keep. Open it in the data views, preview it, or export it again."
        actions={<SaveDatasetButton />} />
      {ws.state.result && <Callout tone="info" title="You have unsaved generated data">Use “Save dataset” above to keep this session's rows.</Callout>}
      <div className="mt-5">
        {list.loading && !list.data ? <ListSkeleton /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
          : items.length === 0 ? (
            <EmptyState icon={<Database className="size-5" />} title="No saved datasets" action={<Button variant="primary" onClick={() => go("/app/input")}>Open the generator</Button>}>
              After generating data, choose “Save dataset” to keep it here.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {items.map((d) => (
                <li key={d.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-fg">{d.name}</h3>
                        <p className="mt-0.5 text-xs text-fg-mute">Saved {when(d.created_at)}{d.seed != null && <> · seed <span className="font-mono">{d.seed}</span></>}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {sc(d) !== null && <Badge tone={sc(d) ? "success" : "danger"}>{sc(d) ? "Validation passed" : "Validation failed"}</Badge>}
                        <Badge tone="neutral">{fmtInt(d.total_rows)} rows</Badge><Badge tone="neutral">{d.tables.length} table{d.tables.length === 1 ? "" : "s"}</Badge><Badge tone="muted">{fmtBytes(d.size_bytes)}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 truncate font-mono text-[11.5px] text-fg-mute">{d.tables.map((t) => `${t.name} (${fmtInt(t.rows)})`).join(" · ")}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="primary" icon={<Eye className="size-3.5" />} onClick={() => preview(d)}>Preview</Button>
                      <Link to={`/app/tabular?dataset=${d.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-panel-2 px-3 text-xs font-medium text-fg hover:bg-panel-3"><Table2 className="size-3.5" />Tabular</Link>
                      <Link to={`/app/relational?dataset=${d.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-panel-2 px-3 text-xs font-medium text-fg hover:bg-panel-3"><Network className="size-3.5" />Relational</Link>
                      <Link to={`/app/documents?dataset=${d.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-panel-2 px-3 text-xs font-medium text-fg hover:bg-panel-3"><Braces className="size-3.5" />Documents</Link>
                      <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                      {(["csv", "json", "zip"] as const).map((f) => (
                        <Button key={f} size="sm" variant="ghost" disabled={f === "csv" && d.tables.length > 1} title={f === "csv" && d.tables.length > 1 ? "CSV is for a single table: use ZIP" : undefined}
                          loading={busy === `${d.id}:${f}`} icon={<Download className="size-3.5" />} onClick={() => download(d, f)}>{f.toUpperCase()}</Button>
                      ))}
                      <Button size="sm" variant="ghost" className="ml-auto text-rose-300" aria-label={`Delete ${d.name}`} icon={<Trash2 className="size-3.5" />} onClick={() => { setDel(d); setError(null); }} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
      </div>

      <Dialog open={!!view} onClose={() => setView(null)} size="xl" title={view?.meta.name ?? ""} description={view ? `${fmtInt(view.meta.total_rows)} rows · first rows of each table` : undefined}>
        {view?.error ? <Callout tone="error">{view.error}</Callout> : !view?.detail ? <div className="space-y-2"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40 w-full" /></div> : (
          <div className="space-y-3">
            {view.meta.tables.length > 1 && <Segmented value={tab} onChange={setTab} options={view.meta.tables.map((t) => ({ value: t.name, label: <>{t.name} <span className="text-fg-mute">{fmtInt(t.rows)}</span></> }))} />}
            <DataGrid rows={view.detail.preview[tab] ?? []} tableLabel={tab} maxHeight="22rem" initialPageSize={25} />
            <p className="text-xs text-fg-mute">Preview shows up to the first 50 rows of this table. Open it in a data view for everything.</p>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={!!busy} error={error} title="Delete this dataset?"
        description={<>“{del?.name}” and its {del ? fmtInt(del.total_rows) : ""} stored rows will be permanently deleted.</>} confirmLabel="Delete dataset" />
    </div>
  );
}
