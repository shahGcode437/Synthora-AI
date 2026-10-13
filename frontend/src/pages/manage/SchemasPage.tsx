import { Pencil, PlayCircle, Plus, Shapes, Trash2 } from "lucide-react";
import { useState } from "react";
import { schemas as api, type SchemaSummary } from "../../api/library";
import { ConfirmDialog, Dialog } from "../../components/Dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, LocalStorageNote } from "../../components/page";
import { useToast } from "../../components/Toast";
import { Badge, Button, Callout, Card, Input, Label, Textarea } from "../../components/ui";
import { useAsync, errMsg } from "../../lib/useAsync";
import { useRouter } from "../../router";
import { useApp } from "../../state/AppContext";
import { SaveSchemaButton } from "../data/SaveDataset";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SchemasPage() {
  const { go } = useRouter();
  const { loadPlan, ws } = useApp();
  const toast = useToast();
  const list = useAsync(() => api.list(), []);
  const [edit, setEdit] = useState<SchemaSummary | null>(null);
  const [del, setDel] = useState<SchemaSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [error, setError] = useState<string | null>(null);

  const use = async (s: SchemaSummary) => {
    setBusy(s.id);
    try { const full = await api.get(s.id); loadPlan(full.plan, s.name); toast.push("info", `Loaded “${s.name}”`, "Review the plan, then generate. No AI call was made."); }
    catch (e) { toast.push("error", "Couldn't load the schema", errMsg(e)); setBusy(null); }
  };
  const openEdit = (s: SchemaSummary) => { setEdit(s); setFormName(s.name); setFormDesc(s.description ?? ""); setError(null); };
  const saveEdit = async () => {
    if (!edit) return;
    if (!formName.trim()) { setError("A schema needs a name."); return; }
    setBusy(edit.id); setError(null);
    try {
      const u = await api.update(edit.id, { name: formName.trim(), description: formDesc.trim() || null });
      list.setData((d) => (d ?? []).map((x) => (x.id === u.id ? u : x))); setEdit(null); toast.push("success", "Schema updated");
    } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(del.id); setError(null);
    try { await api.remove(del.id); list.setData((d) => (d ?? []).filter((x) => x.id !== del.id)); toast.push("success", "Schema deleted"); setDel(null); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };

  const items = list.data ?? [];
  return (
    <div className="animate-fade-up">
      <PageHeader crumbs={[{ label: "Management", to: "/app/overview" }, { label: "Schemas" }]} title="Schemas"
        description="Saved Generation Plans. Load one to review it and generate again: no AI call is made, so it works even when the AI is busy."
        actions={<><SaveSchemaButton />{!ws.state.plan && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => go("/app/input")}>New schema</Button>}</>} />
      {ws.state.plan && <Callout tone="info" title="You have a plan in this session">Use “Save as schema” above to keep it, including any row-count edits.</Callout>}
      <LocalStorageNote />
      <div className="mt-5">
        {list.loading && !list.data ? <ListSkeleton /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
          : items.length === 0 ? (
            <EmptyState icon={<Shapes className="size-5" />} title="No schemas saved yet" action={<Button variant="primary" onClick={() => go("/app/input")}>Create one in the generator</Button>}>
              Analyze a prompt or a CSV, review the plan, then choose “Save as schema” to reuse it later.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((s) => (
                <li key={s.id}>
                  <Card className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="truncate font-semibold text-fg">{s.name}</h3><p className="mt-0.5 text-xs text-fg-mute">Updated {when(s.updated_at)}</p></div>
                      <Badge tone={s.source_mode === "sample" ? "violet" : "accent"}>{s.source_mode === "sample" ? "From CSV" : "From prompt"}</Badge>
                    </div>
                    {s.description && <p className="mt-3 line-clamp-2 text-sm text-fg-dim">{s.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      <Badge tone="neutral" className="capitalize">{s.domain.replace(/[_-]+/g, " ")}</Badge>
                      <Badge tone="neutral">{s.tables.length} table{s.tables.length === 1 ? "" : "s"}</Badge><Badge tone="neutral">{s.columns} columns</Badge>
                    </div>
                    <p className="mt-2 truncate font-mono text-[11.5px] text-fg-mute" title={s.tables.join(", ")}>{s.tables.join(" · ")}</p>
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <Button size="sm" variant="primary" icon={<PlayCircle className="size-3.5" />} loading={busy === s.id && !edit && !del} onClick={() => use(s)}>Use schema</Button>
                      <Button size="sm" variant="ghost" aria-label={`Rename ${s.name}`} icon={<Pencil className="size-3.5" />} onClick={() => openEdit(s)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="ml-auto text-rose-300" aria-label={`Delete ${s.name}`} icon={<Trash2 className="size-3.5" />} onClick={() => { setDel(s); setError(null); }} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
      </div>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Edit schema" busy={!!busy} size="sm"
        footer={<><Button variant="ghost" onClick={() => setEdit(null)} disabled={!!busy}>Cancel</Button><Button variant="primary" loading={!!busy} onClick={saveEdit}>Save changes</Button></>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
          <div><Label htmlFor="se-name">Name</Label><Input id="se-name" data-autofocus value={formName} maxLength={80} onChange={(e) => setFormName(e.target.value)} /></div>
          <div><Label htmlFor="se-desc" hint="optional">Description</Label><Textarea id="se-desc" rows={3} maxLength={500} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} /></div>
          {error && <Callout tone="error">{error}</Callout>}
        </form>
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={!!busy} error={error} title="Delete this schema?"
        description={<>“{del?.name}” will be permanently deleted. Datasets and history are not affected.</>} confirmLabel="Delete schema" />
    </div>
  );
}
