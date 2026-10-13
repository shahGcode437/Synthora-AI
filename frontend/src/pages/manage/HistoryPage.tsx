import { CheckCircle2, History, PlayCircle, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { history as api, type RunSummary } from "../../api/library";
import { ConfirmDialog } from "../../components/Dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "../../components/page";
import { useToast } from "../../components/Toast";
import { Badge, Button, Callout, Card, Segmented } from "../../components/ui";
import { fmtInt } from "../../lib/format";
import { errMsg } from "../../lib/useAsync";
import { useApp } from "../../state/AppContext";

const PAGE = 20;
type Status = "all" | "passed" | "failed";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const dur = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function HistoryPage() {
  const { loadPlan } = useApp();
  const toast = useToast();
  const [status, setStatus] = useState<Status>("all");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<RunSummary | "all" | null>(null);
  const [delError, setDelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await api.list({ limit: PAGE, offset, status }); setItems(r.items); setTotal(r.total); }
    catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [offset, status]);
  useEffect(() => { void load(); }, [load]);

  const reopen = async (r: RunSummary) => {
    setBusy(r.id);
    try { const d = await api.get(r.id); loadPlan(d.plan, `${r.domain.replace(/[_-]+/g, " ")} · ${when(r.created_at)}`); toast.push("info", "Plan re-opened", "Review it, then generate. Rows are not stored in history."); }
    catch (e) { toast.push("error", "Couldn't open this run", errMsg(e)); setBusy(null); }
  };
  const confirmDelete = async () => {
    if (!del) return;
    setBusy("del"); setDelError(null);
    try {
      if (del === "all") { await api.clear(); setOffset(0); toast.push("success", "History cleared"); }
      else { await api.remove(del.id); toast.push("success", "Run removed"); }
      setDel(null); await load();
    } catch (e) { setDelError(errMsg(e)); } finally { setBusy(null); }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;
  return (
    <div className="animate-fade-up">
      <PageHeader crumbs={[{ label: "Management", to: "/app/overview" }, { label: "Generation History" }]} title="Generation history"
        description="Every generation made in this browser's workspace. History keeps the plan and the validation summary, not the generated rows: save a dataset to keep rows."
        actions={total > 0 || status !== "all" ? <Button variant="ghost" className="text-rose-300" icon={<Trash2 className="size-4" />} onClick={() => { setDel("all"); setDelError(null); }}>Clear history</Button> : undefined} />
      <div className="mb-4"><Segmented<Status> value={status} onChange={(v) => { setStatus(v); setOffset(0); }}
        options={[{ value: "all", label: "All" }, { value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }]} /></div>

      {loading && items.length === 0 ? <ListSkeleton /> : error ? <ErrorState message={error} onRetry={load} />
        : items.length === 0 ? (
          <EmptyState icon={<History className="size-5" />} title={status === "all" ? "No generations yet" : `No ${status} runs`}>
            {status === "all" ? "Runs you generate will appear here." : "Try another filter."}
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-3" aria-busy={loading}>
              {items.map((r) => (
                <li key={r.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={r.validation_passed ? "text-emerald-300" : "text-rose-300"} title={r.validation_passed ? "Validation passed" : "Validation failed"}>
                        {r.validation_passed ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium capitalize text-fg">{r.domain.replace(/[_-]+/g, " ")}</span>
                          <Badge tone="neutral">{r.data_type}</Badge>
                          <Badge tone={r.source_mode === "sample" ? "violet" : "accent"}>{r.source_mode === "sample" ? "From CSV" : "From prompt"}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-fg-mute">
                          {when(r.created_at)} · {r.tables} table{r.tables === 1 ? "" : "s"} · {fmtInt(r.rows)} rows · seed <span className="font-mono">{r.seed}</span> · {dur(r.duration_ms)}
                          {(r.error_count > 0 || r.warning_count > 0) && <> · {r.error_count} errors, {r.warning_count} warnings</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" icon={<PlayCircle className="size-3.5" />} loading={busy === r.id} onClick={() => reopen(r)}>Re-open plan</Button>
                        <Button size="sm" variant="ghost" className="text-rose-300" aria-label="Delete this run" icon={<Trash2 className="size-3.5" />} onClick={() => { setDel(r); setDelError(null); }} />
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-fg-mute">
                <span>{fmtInt(total)} runs</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setOffset(offset - PAGE)}>Previous</Button>
                  <span className="px-2 tabular-nums text-fg-dim">Page {page} of {pages}</span>
                  <Button size="sm" variant="secondary" disabled={page >= pages || loading} onClick={() => setOffset(offset + PAGE)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      <Callout tone="info" title="About re-opening">Re-opening loads the saved plan and seed settings. Using the same plan and seed reproduces the same rows.</Callout>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} busy={busy === "del"} error={delError}
        title={del === "all" ? "Clear all history?" : "Delete this run?"}
        description={del === "all" ? "Every generation record will be permanently deleted. Saved schemas and datasets are not affected." : "This record will be permanently deleted."}
        confirmLabel={del === "all" ? "Clear history" : "Delete run"} />
    </div>
  );
}
