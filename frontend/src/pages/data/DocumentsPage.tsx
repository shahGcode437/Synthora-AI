import { Braces, ChevronsDownUp, ChevronsUpDown, Copy, Download, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { JsonView } from "../../components/JsonView";
import { useToast } from "../../components/Toast";
import { Badge, Button, Callout, Card, Input, Label, Select, StatCard } from "../../components/ui";
import { cellText } from "../../lib/datagrid";
import { buildModel, describeNesting, makeDocBuilder } from "../../lib/documents";
import { fmtBytes, fmtInt } from "../../lib/format";
import { DataModule } from "./DataModule";
import { useActiveDataset, type ActiveDataset } from "./useActiveDataset";

const PER_PAGE = 5;

export function DocumentsPage() {
  const ctl = useActiveDataset();
  return (
    <DataModule ctl={ctl} title="Document Data" crumbs={[{ label: "Workspace", to: "/app/overview" }, { label: "Document Data" }]}
      description="Your generated tables as JSON documents. Child rows are nested inside their parents by foreign key, exactly as stored.">
      {(d) => <DocumentsBody d={d} />}
    </DataModule>
  );
}

function DocumentsBody({ d }: { d: ActiveDataset }) {
  const toast = useToast();
  const model = useMemo(() => buildModel(d.data, d.plan), [d.data, d.plan]);
  const names = Object.keys(d.data);
  const [root, setRoot] = useState(model.roots[0] ?? names[0]);
  const rootName = names.includes(root) ? root : names[0];
  const maxDepth = describeNesting(model, rootName, 4).length ? 3 : 0;
  const [depth, setDepth] = useState(Math.min(2, maxDepth));
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(1);   // JSON levels open by default
  const [signal, setSignal] = useState(0);

  const builder = useMemo(() => makeDocBuilder(d.data, model, rootName, Math.min(depth, maxDepth)), [d.data, model, rootName, depth, maxDepth]);
  const rootRows = d.data[rootName] ?? [];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: number[] = [];
    rootRows.forEach((r, i) => { if (Object.values(r).some((v) => cellText(v).toLowerCase().includes(q))) out.push(i); });
    return out;
  }, [query, rootRows]);
  const indexes = matches ?? Array.from({ length: builder.total }, (_, i) => i);
  const pages = Math.max(1, Math.ceil(indexes.length / PER_PAGE));
  const p = Math.min(page, pages);
  const visible = indexes.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  const shape = describeNesting(model, rootName, Math.min(depth, maxDepth));

  const docs = useMemo(() => visible.map((i) => ({ i, doc: builder.at(i) })), [visible, builder]);

  const download = () => {
    const blob = new Blob([JSON.stringify(builder.all(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${rootName}_documents.json` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.push("success", `${rootName}_documents.json downloaded`, `${fmtInt(builder.total)} documents`);
  };
  const copy = async (doc: unknown) => {
    try { await navigator.clipboard.writeText(JSON.stringify(doc, null, 2)); toast.push("success", "Copied to clipboard"); }
    catch { toast.push("error", "Couldn't copy", "Your browser blocked clipboard access."); }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Documents" value={fmtInt(builder.total)} icon={<Braces className="size-4" />} hint={`one per row of ${rootName}`} />
        <StatCard label="Nesting" value={Math.min(depth, maxDepth) === 0 ? "Flat" : `${Math.min(depth, maxDepth)} level${Math.min(depth, maxDepth) === 1 ? "" : "s"}`} hint={maxDepth === 0 ? "no child tables" : "child tables embedded"} />
        <StatCard label="Tables used" value={1 + shape.length} hint={shape.length ? "root + embedded" : "root only"} />
        <StatCard label="Matches" value={matches ? fmtInt(matches.length) : "—"} hint={matches ? `for “${query}”` : "search to filter"} />
      </div>

      {maxDepth === 0 && names.length > 1 && <Callout tone="info" title="No parent–child links to nest">These tables have no recorded relationships, so each document is a single flat row.</Callout>}

      <Card>
        <div className="flex flex-wrap items-end gap-4 border-b border-line px-5 py-4">
          <div><Label htmlFor="doc-root">Root table</Label>
            <Select id="doc-root" className="w-44" value={rootName} onChange={(e) => { setRoot(e.target.value); setPage(1); setDepth(2); }}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select></div>
          <div><Label htmlFor="doc-depth">Nesting depth</Label>
            <Select id="doc-depth" className="w-36" value={Math.min(depth, maxDepth)} disabled={maxDepth === 0} onChange={(e) => setDepth(Number(e.target.value))}>
              {Array.from({ length: maxDepth + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? "Flat (0)" : `${i} level${i > 1 ? "s" : ""}`}</option>)}
            </Select></div>
          <div className="min-w-[12rem] flex-1 sm:max-w-xs"><Label htmlFor="doc-q">Find documents</Label>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-mute" />
              <Input id="doc-q" placeholder="Search root values…" className="pl-9 pr-8" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
              {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-mute hover:text-fg"><X className="size-3.5" /></button>}
            </div></div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<ChevronsUpDown className="size-3.5" />} onClick={() => { setOpen(99); setSignal((n) => n + 1); }}>Expand all</Button>
            <Button size="sm" variant="ghost" icon={<ChevronsDownUp className="size-3.5" />} onClick={() => { setOpen(1); setSignal((n) => n + 1); }}>Collapse</Button>
            <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={download}>Download JSON</Button>
          </div>
        </div>
        {shape.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2.5 text-xs text-fg-mute">
            Document shape: <Badge tone="accent">{rootName}</Badge>
            {shape.map((s) => <Badge key={s} tone="neutral" className="font-mono">{s.trim()}</Badge>)}
          </div>
        )}

        <div className="space-y-3 p-5">
          {docs.length === 0 ? <p className="py-8 text-center text-sm text-fg-mute">No documents match “{query}”.</p> : docs.map(({ i, doc }) => (
            <div key={`${signal}-${i}`} className="overflow-hidden rounded-xl border border-line bg-canvas/40">
              <div className="flex items-center justify-between border-b border-line bg-panel-2 px-4 py-2 text-xs">
                <span className="font-mono text-fg-dim">{rootName}[{i}]</span>
                <span className="flex items-center gap-3 text-fg-mute">{fmtBytes(JSON.stringify(doc).length)}
                  <button aria-label={`Copy document ${i}`} onClick={() => copy(doc)} className="flex items-center gap-1 text-fg-dim hover:text-fg"><Copy className="size-3.5" />Copy</button></span>
              </div>
              <div className="overflow-x-auto p-4"><JsonView value={doc} defaultDepth={open} /></div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-fg-mute">
          <span aria-live="polite">{indexes.length === 0 ? "0 documents" : `Documents ${(p - 1) * PER_PAGE + 1}–${Math.min(p * PER_PAGE, indexes.length)} of ${fmtInt(indexes.length)}`}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" disabled={p <= 1} onClick={() => setPage(p - 1)}>Previous</Button>
            <span className="px-2 tabular-nums text-fg-dim">Page {p} of {pages}</span>
            <Button size="sm" variant="secondary" disabled={p >= pages} onClick={() => setPage(p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      <p className="text-xs text-fg-mute">This is a document view of tables generated by Synthora: it rearranges real rows and invents nothing. Generating documents with a nested schema of their own (invoices, statements, PDFs) is not available yet.</p>
    </>
  );
}

