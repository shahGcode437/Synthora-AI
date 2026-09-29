import { FileSpreadsheet, MessageSquareText, Sparkles, Trash2, UploadCloud, WifiOff } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import type { SampleControls } from "../api/client";
import type { AnalyzeRequest } from "../api/types";
import { Button, Callout, Card, Label, SectionTitle, Segmented, Textarea } from "../components/ui";
import { cn } from "../lib/cn";
import { fmtBytes } from "../lib/format";
import { ControlsFields, defaultControls, parseControls, type Controls } from "./ControlsFields";

const MAX_BYTES = 10 * 1024 * 1024;

const EXAMPLES = [
  { label: "E-commerce customers", text: "Generate 200 Pakistani e-commerce customer records with names, emails, cities, signup dates and account status." },
  { label: "Hospital appointments", text: "Generate synthetic hospital appointment data with patients, doctors and appointments. Appointments must reference valid patients and doctors." },
  { label: "Banking transactions", text: "Generate banking transaction data with account IDs, merchants, debit/credit transactions, timestamps and running balances. Include a small number of failed transactions." },
];

type Tab = "prompt" | "sample";

export function InputSection({ busy, offline, onPrompt, onSample }: {
  busy: boolean; offline: boolean;
  onPrompt: (req: AnalyzeRequest) => void;
  onSample: (file: File, c: SampleControls) => void;
}) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [prompt, setPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [controls, setControls] = useState<Controls>(defaultControls);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const disabled = busy;
  const blocked = busy || offline;

  const submitPrompt = () => {
    const p = parseControls(controls);
    if (!p.ok) return setErrors(p.errors);
    setErrors({});
    onPrompt({ mode: "prompt", prompt: prompt.trim(), ...p.value });
  };

  const submitSample = () => {
    if (!file) return;
    const p = parseControls(controls);
    if (!p.ok) return setErrors(p.errors);
    setErrors({});
    onSample(file, { instruction, ...p.value });
  };

  const pickFile = (f: File | null) => {
    setFileError(null);
    if (!f) return setFile(null);
    if (f.size === 0) return setFileError("This file is empty.");
    if (f.size > MAX_BYTES) return setFileError(`This file is ${fmtBytes(f.size)}; the limit is 10 MB.`);
    setFile(f);
  };

  return (
    <section id="sec-input" className="scroll-mt-32 animate-fade-up">
      <SectionTitle eyebrow="Step 1" title="What data do you need?"
        description="Describe a dataset in plain language, or upload a CSV and Synthora will learn its structure — not copy its rows." />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <Segmented<Tab> value={tab} onChange={setTab} disabled={disabled} options={[
            { value: "prompt", label: <><MessageSquareText className="size-4" /> Generate from Prompt</> },
            { value: "sample", label: <><FileSpreadsheet className="size-4" /> Analyze Sample CSV</> },
          ]} />
          <span className="text-xs text-fg-mute">
            {tab === "prompt" ? "AI designs the schema, tables and rules" : "Profiled locally · only a compact summary goes to the AI"}
          </span>
        </div>

        <div className="space-y-5 p-5">
          {offline && (
            <Callout tone="warning" title="Backend offline">
              Start the API (<code className="font-mono text-xs">uvicorn app.main:app --port 8000</code> in <code className="font-mono text-xs">backend/</code>) — this page reconnects automatically.
            </Callout>
          )}

          {tab === "prompt" ? (
            <div>
              <Label htmlFor="prompt" hint={`${prompt.length}/8000`}>Describe your dataset</Label>
              <Textarea id="prompt" rows={5} maxLength={8000} disabled={disabled} value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Generate 500 Pakistani e-commerce customers with orders and payment behaviour, including a few failed payments." />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-mute">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} type="button" disabled={disabled} onClick={() => setPrompt(ex.text)}
                    className="rounded-full border border-line bg-panel-2 px-3 py-1 text-xs text-fg-dim transition-colors hover:border-accent/40 hover:text-accent-soft disabled:opacity-50">
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Dropzone file={file} error={fileError} disabled={disabled} onFile={pickFile} />
              <div>
                <Label htmlFor="instruction" hint="optional">Instruction</Label>
                <Textarea id="instruction" rows={3} maxLength={8000} disabled={disabled} value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g. Generate 5,000 new records, preserve category ratios, add failed-payment cases and use Pakistani names." />
              </div>
            </div>
          )}

          <ControlsFields value={controls} onChange={setControls} errors={errors} disabled={disabled}
            rowsHint={tab === "sample" ? "Same as source" : "Auto"} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="max-w-lg text-xs text-fg-mute">
              {tab === "prompt"
                ? "Your controls always override the AI's assumptions."
                : "Uploaded data is processed in memory and never stored. PII columns are masked before anything reaches the AI."}
            </p>
            {tab === "prompt" ? (
              <Button variant="primary" size="lg" loading={busy} disabled={blocked || prompt.trim().length < 3}
                icon={offline ? <WifiOff className="size-4" /> : <Sparkles className="size-4" />} onClick={submitPrompt}>
                Analyze with AI
              </Button>
            ) : (
              <Button variant="primary" size="lg" loading={busy} disabled={blocked || !file}
                icon={offline ? <WifiOff className="size-4" /> : <Sparkles className="size-4" />} onClick={submitSample}>
                Analyze Sample
              </Button>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

function Dropzone({ file, error, disabled, onFile }: {
  file: File | null; error: string | null; disabled?: boolean; onFile: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    onFile(e.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div>
      <input ref={ref} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" disabled={disabled}
        onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3.5 animate-fade-in">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"><FileSpreadsheet className="size-5" /></div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg">{file.name}</div>
              <div className="text-xs text-fg-mute">{fmtBytes(file.size)} · ready to analyze</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onFile(null)} icon={<Trash2 className="size-4" />}>Remove</Button>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
          onDragLeave={() => setOver(false)} onDrop={onDrop}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            over ? "border-accent bg-accent/[0.07]" : "border-line-strong bg-canvas/40 hover:border-accent/50 hover:bg-accent/[0.03]",
            disabled && "cursor-not-allowed opacity-50")}>
          <UploadCloud className={cn("size-8 transition-colors", over ? "text-accent" : "text-fg-mute group-hover:text-accent")} />
          <div className="text-sm font-medium text-fg">Drop a CSV here, or <span className="text-accent">browse</span></div>
          <div className="text-xs text-fg-mute">UTF-8 · up to 10 MB · 200,000 rows · header row required</div>
        </button>
      )}
      {error && <p className="mt-2 text-xs text-rose-300" role="alert">{error}</p>}
    </div>
  );
}
