import { Braces, CheckCircle2, Download, FileArchive, FileSpreadsheet, Info } from "lucide-react";
import { useState } from "react";
import type { ExportFormat, GeneratedData } from "../api/types";
import { Badge, Button, Callout, Card, CardHeader, Input, Label, SectionTitle } from "../components/ui";
import { cn } from "../lib/cn";
import { fmtInt } from "../lib/format";
import type { ExportState } from "../state/workspace";

export function ExportSection({ data, exportState, busy, onExport }: {
  data: GeneratedData; exportState: ExportState; busy: boolean; onExport: (f: ExportFormat, filename: string) => void;
}) {
  const [filename, setFilename] = useState("synthora_export");
  const tables = Object.keys(data);
  const multi = tables.length > 1;
  const totalRows = Object.values(data).reduce((n, r) => n + r.length, 0);
  const preparing = exportState.status === "preparing";

  const opts: { fmt: ExportFormat; title: string; desc: string; icon: React.ReactNode; disabled: boolean; primary: boolean; note?: string }[] = [
    { fmt: "csv", title: "CSV", icon: <FileSpreadsheet className="size-5" />, disabled: multi, primary: !multi,
      desc: "One comma-separated file, UTF-8 with header.", note: multi ? "Single-table datasets only — use ZIP for several tables." : undefined },
    { fmt: "json", title: "JSON", icon: <Braces className="size-5" />, disabled: false, primary: false,
      desc: `All ${tables.length} table${multi ? "s" : ""} in one file, keyed by table name.` },
    { fmt: "zip", title: "ZIP", icon: <FileArchive className="size-5" />, disabled: false, primary: multi,
      desc: multi ? "One CSV per table plus data.json — best for relational data." : "CSV plus data.json in one archive." },
  ];

  return (
    <section id="sec-export" className="scroll-mt-32 animate-fade-up space-y-4 pb-24">
      <SectionTitle eyebrow="Step 7" title="Export"
        description={`Download the full dataset — ${fmtInt(totalRows)} rows across ${tables.length} table${multi ? "s" : ""}.`} />
      <Card>
        <CardHeader icon={<Download className="size-4" />} title="Download" subtitle="Built in memory on the backend; nothing is stored." />
        <div className="space-y-5 p-5">
          <div className="max-w-sm">
            <Label htmlFor="filename" hint="extension added automatically">File name</Label>
            <Input id="filename" value={filename} maxLength={120} disabled={busy} placeholder="synthora_export"
              onChange={(e) => setFilename(e.target.value)} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {opts.map((o) => {
              const active = preparing && exportState.format === o.fmt;
              const done = exportState.status === "ready" && exportState.format === o.fmt;
              return (
                <div key={o.fmt} className={cn(
                  "flex flex-col justify-between rounded-xl border p-4 transition-colors",
                  o.disabled ? "border-line bg-panel/50 opacity-60"
                    : o.primary ? "border-accent/40 bg-accent/[0.06]" : "border-line bg-panel")}>
                  <div>
                    <div className="flex items-center justify-between">
                      <div className={cn("flex size-9 items-center justify-center rounded-lg", o.primary && !o.disabled ? "bg-accent/15 text-accent" : "bg-panel-3 text-fg-dim")}>{o.icon}</div>
                      {o.primary && !o.disabled && <Badge tone="accent">Recommended</Badge>}
                      {done && <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>Ready</Badge>}
                    </div>
                    <div className="mt-3 text-sm font-semibold">{o.title}</div>
                    <p className="mt-0.5 text-xs text-fg-mute">{o.desc}</p>
                    {o.note && <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300/90"><Info className="mt-0.5 size-3.5 shrink-0" />{o.note}</p>}
                  </div>
                  <Button className="mt-4 w-full" variant={o.primary && !o.disabled ? "primary" : "secondary"} loading={active}
                    disabled={o.disabled || busy} icon={<Download className="size-4" />} onClick={() => onExport(o.fmt, filename.trim())}>
                    {active ? "Preparing…" : `Download ${o.title}`}
                  </Button>
                </div>
              );
            })}
          </div>

          <div aria-live="polite">
            {preparing && <Callout tone="info" title="Preparing your file…">The backend is building the {exportState.format?.toUpperCase()} export.</Callout>}
            {exportState.status === "ready" && (
              <Callout tone="success" title="Export ready">
                Saved <span className="font-mono">{exportState.filename}</span> — check your browser's downloads.
              </Callout>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
