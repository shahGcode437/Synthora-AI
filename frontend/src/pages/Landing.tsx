import { ArrowRight, Bot, Braces, Check, Database, FileArchive, FileInput, FileSpreadsheet, FileText, GitBranch, Layers, Network, Quote, Scale, ScanSearch, ShieldCheck, Sparkles, Table2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { ACCOUNTS_ENABLED } from "../auth/config";
import { Link } from "../router";
import { SceneLoader } from "../three/SceneLoader";
import { PublicFooter, PublicHeader } from "./PublicLayout";

const Chip = ({ children, tone = "n" }: { children: ReactNode; tone?: "n" | "ok" | "soon" }) => (
  <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[10.5px]",
    tone === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    tone === "soon" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
    tone === "n" && "border-line-strong bg-panel-2 text-fg-dim")}>{children}</span>
);

function Glass({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return <div className={cn("glass rounded-xl", className)} style={style}>{children}</div>;
}

/* ---------------- Hero 3D scene (illustrative) ---------------- */
function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`);
    el.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 9}deg`);
  };
  const leave = () => { ref.current?.style.setProperty("--rx", "0deg"); ref.current?.style.setProperty("--ry", "0deg"); };
  const z = (n: number): CSSProperties => ({ translate: `0 0 ${n}px` });
  return (
    <div className="relative hidden lg:block" style={{ perspective: "1300px" }} onPointerMove={move} onPointerLeave={leave} aria-hidden="true">
      <div ref={ref} className="scene relative mx-auto h-[500px] w-[520px]">
        <svg className="absolute inset-0 size-full" viewBox="0 0 520 500" fill="none" style={z(5)}>
          {["M105 118 C 140 160, 200 170, 232 190", "M425 128 C 400 160, 340 170, 300 192", "M232 285 C 190 300, 150 300, 130 312", "M292 285 C 340 300, 390 300, 410 312"].map((d, i) => (
            <path key={i} d={d} className="flow-line" stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="5 6" opacity="0.7" />
          ))}
        </svg>
        <Glass className="float-a absolute left-0 top-0 w-52 p-3" style={z(40)}>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-mute"><Network className="size-3 text-accent" /> schema</div>
          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="rounded-md border border-line-strong bg-panel-2 px-2 py-1">customers <span className="text-accent">PK</span> customer_id</div>
            <div className="ml-4 rounded-md border border-line-strong bg-panel-2 px-2 py-1">orders <span className="text-sky-300">FK</span> customer_id <span className="text-fg-mute">1:N</span></div>
          </div>
        </Glass>
        <Glass className="float-b absolute right-0 top-0 w-48 p-3 opacity-90" style={z(20)}>
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-fg-mute"><span className="flex items-center gap-1.5"><FileText className="size-3" /> invoice</span><Chip tone="soon">soon</Chip></div>
          <div className="space-y-1.5">{[88, 64, 76, 40].map((w, i) => <div key={i} className="h-1.5 rounded bg-line-strong" style={{ width: `${w}%` }} />)}</div>
        </Glass>
        <div className="absolute left-[200px] top-[170px] size-[120px]" style={z(70)}>
          <div className="spin-slow absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, transparent, var(--color-accent), transparent 60%)", filter: "blur(2px)" }} />
          <div className="absolute inset-[3px] flex flex-col items-center justify-center rounded-full border border-accent/40 bg-canvas">
            <Sparkles className="size-6 text-accent" /><span className="mt-1 font-mono text-[10px] text-fg-dim">AI plan</span>
          </div>
        </div>
        <Glass className="float-c absolute left-0 top-[310px] w-64 p-3" style={z(45)}>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-mute">orders · synthetic</div>
          <table className="w-full font-mono text-[11px]">
            <tbody>
              {[["5001", "1042", "12,400", "paid"], ["5002", "1007", "3,150", "paid"], ["5003", "1042", "8,700", "failed"]].map((r) => (
                <tr key={r[0]} className="border-t border-line">{r.map((c, i) => <td key={i} className={cn("py-1 pr-2", c === "failed" && "text-amber-300")}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Glass>
        <Glass className="float-a absolute right-0 top-[310px] w-52 p-3" style={z(55)}>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-mute"><ShieldCheck className="size-3 text-emerald-300" /> validation</div>
          {["PK unique", "FK integrity · 0 orphans", "Totals reconcile"].map((t) => (
            <div key={t} className="flex items-center gap-1.5 py-0.5 font-mono text-[11px] text-fg-dim"><Check className="size-3 text-emerald-300" />{t}</div>
          ))}
        </Glass>
        <div className="absolute left-[165px] top-[455px] flex gap-2" style={z(30)}><Chip>CSV</Chip><Chip>JSON</Chip><Chip>ZIP</Chip></div>
        <div className="absolute bottom-0 right-0 font-mono text-[10px] text-fg-mute">Illustrative example</div>
      </div>
    </div>
  );
}

const PIPE: [string, string][] = [
  ["SCHEMA", "Describe it or upload a CSV"], ["ENGINE", "AI plans, code generates"], ["SYNTHETIC DATA", "Tables with consistent keys"],
  ["VALIDATION", "Keys, relations, totals"], ["EXPORT", "CSV, JSON or ZIP"],
];
function Pipeline() {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setOn((n) => (n + 1) % PIPE.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <ol className="grid gap-3 md:grid-cols-5" aria-label="Pipeline">
      {PIPE.map(([p, d], i) => (
        <li key={p} className="relative">
          <div className={cn("glass rounded-xl px-4 py-3 transition-all duration-500", on === i ? "border-accent/60 shadow-[0_0_32px_-8px_var(--color-accent)]" : "opacity-80")}>
            <div className={cn("font-mono text-[11px] tracking-[0.16em]", on === i ? "text-accent" : "text-fg-mute")}>{String(i + 1).padStart(2, "0")} · {p}</div>
            <div className="mt-1 text-sm text-fg-dim">{d}</div>
          </div>
          {i < PIPE.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-accent/70 md:block" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Sections ---------------- */
const QUOTES = [
  "Build and test with realistic data — without exposing real records.",
  "Generate data for the edge cases your production dataset never gives you.",
  "From structured tables to connected databases and realistic documents.",
  "Good synthetic data doesn't just look real. It behaves like real data.",
  "Turn schemas into shippable datasets.",
];
const QSPAN = ["md:col-span-3", "md:col-span-3", "md:col-span-2", "md:col-span-2", "md:col-span-2"];

function TabularPreview() {
  return (
    <div className="rounded-lg border border-line bg-canvas/50 p-2.5 font-mono text-[11px] text-fg-dim">
      {[["1001", "Ayesha Khan", "Lahore"], ["1002", "Hamza Raza", "Wah Cantt"], ["1003", "Sana Malik", "null"]].map((r, i) => (
        <div key={r[0]} className="row-in flex justify-between gap-3 border-b border-line py-1 last:border-0" style={{ animationDelay: `${i * 0.5}s` }}>
          {r.map((c, j) => <span key={j} className={c === "null" ? "text-amber-300" : ""}>{c}</span>)}
        </div>
      ))}
    </div>
  );
}
function RelationalPreview() {
  return (
    <svg viewBox="0 0 260 92" className="w-full" fill="none" aria-hidden="true">
      {[[6, "customers"], [96, "orders"], [186, "order_items"]].map(([x, t]) => (
        <g key={t as string}><rect x={x as number} y="26" width="68" height="40" rx="8" fill="var(--color-panel-2)" stroke="var(--color-line-strong)" />
          <text x={(x as number) + 34} y="50" textAnchor="middle" fontSize="9.5" fill="var(--color-fg-dim)" fontFamily="ui-monospace,monospace">{t as string}</text></g>
      ))}
      {[[74, 96], [164, 186]].map(([a, b]) => <path key={a} d={`M${a} 46 H${b}`} stroke="var(--color-accent)" strokeWidth="1.6" strokeDasharray="4 4" className="flow-line" />)}
      <text x="85" y="40" fontSize="8" fill="var(--color-accent)" textAnchor="middle" fontFamily="ui-monospace,monospace">1:N</text>
      <text x="175" y="40" fontSize="8" fill="var(--color-accent)" textAnchor="middle" fontFamily="ui-monospace,monospace">1:N</text>
    </svg>
  );
}
function DocPreview() {
  return (
    <div className="relative rounded-lg border border-line bg-canvas/50 p-3 opacity-70">
      <div className="space-y-1.5">{[92, 70, 82, 46].map((w, i) => <div key={i} className="h-1.5 rounded bg-line-strong" style={{ width: `${w}%` }} />)}</div>
      <span className="absolute right-2 top-2"><Chip tone="ok">Nested JSON</Chip></span>
    </div>
  );
}

const TYPES: { icon: ReactNode; title: string; text: string; tags: [string, ("n" | "ok" | "soon")?][]; preview: ReactNode }[] = [
  { icon: <Table2 className="size-5" />, title: "Tabular", text: "One table of realistic records with the distributions and null behavior you ask for.",
    tags: [["CSV", "ok"], ["JSON", "ok"], ["ZIP", "ok"], ["Excel · soon", "soon"]], preview: <TabularPreview /> },
  { icon: <Network className="size-5" />, title: "Relational", text: "Connected tables with primary keys, foreign keys and checked relationships.",
    tags: [["Tables"], ["Primary keys"], ["Foreign keys"], ["1:1 · 1:N · N:N"]], preview: <RelationalPreview /> },
  { icon: <FileText className="size-5" />, title: "Document", text: "Your generated tables as nested JSON documents, children embedded by foreign key. Invoices and PDFs are on the roadmap.",
    tags: [["Nested JSON", "ok"], ["Download JSON", "ok"], ["Invoices · soon", "soon"], ["PDF · soon", "soon"]], preview: <DocPreview /> },
];

const STEPS: [string, string][] = [
  ["Define", "Describe a dataset in plain language or upload a sample CSV."],
  ["Analyze", "AI reads the domain, column meanings, PII and relationships."],
  ["Plan", "Review the generation plan and adjust it before anything is created."],
  ["Generate", "Specialized generators build the records; code keeps keys consistent."],
  ["Validate & Export", "Deterministic checks run, then download CSV, JSON or ZIP."],
];

const Soft = ({ children }: { children: ReactNode }) => <div className="rounded-lg border border-line bg-canvas/50 p-2.5">{children}</div>;
const CAPS: { icon: ReactNode; title: string; text: string; soon?: boolean; visual: ReactNode }[] = [
  { icon: <Database className="size-4" />, title: "Schema-aware generation", text: "Columns, types and keys are understood first, so values are never random fill.",
    visual: <Soft><div className="flex flex-wrap gap-1.5">{["id: int", "name: str", "signup: date", "amount: num"].map((c) => <Chip key={c}>{c}</Chip>)}</div></Soft> },
  { icon: <Bot className="size-4" />, title: "AI-powered analysis", text: "AI interprets what each field means and proposes a plan you can edit.",
    visual: <Soft><div className="mb-1.5 flex justify-between font-mono text-[10.5px] text-fg-dim"><span>domain: e-commerce</span><span>confidence</span></div><div className="h-1.5 rounded bg-line-strong"><div className="h-full w-4/5 rounded bg-accent" /></div></Soft> },
  { icon: <GitBranch className="size-4" />, title: "Relational integrity", text: "Parents first, children after. Orphan rows are caught and reported.",
    visual: <Soft><div className="flex items-center justify-between font-mono text-[10.5px] text-fg-dim"><span>orders → customers</span><Chip tone="ok">0 orphans</Chip></div></Soft> },
  { icon: <FileText className="size-4" />, title: "Document view", text: "Nested JSON documents from your records. Invoice and PDF output is coming soon.",
    visual: <Soft><div className="space-y-1.5 opacity-60">{[90, 60, 75].map((w, i) => <div key={i} className="h-1.5 rounded bg-line-strong" style={{ width: `${w}%` }} />)}</div></Soft> },
  { icon: <Layers className="size-4" />, title: "Edge-case generation", text: "None, Low, Medium, High or AI Recommended, tuned to your domain.",
    visual: <Soft><div className="flex gap-1">{["None", "Low", "Medium", "High"].map((l) => <span key={l} className={cn("flex-1 rounded px-1 py-0.5 text-center font-mono text-[10px]", l === "Medium" ? "bg-accent/20 text-accent-soft" : "bg-panel-2 text-fg-mute")}>{l}</span>)}</div></Soft> },
  { icon: <ShieldCheck className="size-4" />, title: "Privacy controls", text: "Identifying fields are synthesized by default; you choose the privacy mode.",
    visual: <Soft><div className="space-y-1 font-mono text-[10.5px] text-fg-dim">{["name → synthesize", "email → synthesize"].map((t) => <div key={t}>{t}</div>)}</div></Soft> },
  { icon: <Scale className="size-4" />, title: "Validation", text: "Deterministic checks for keys, relationships and totals after every run.",
    visual: <Soft>{["PK unique", "FK integrity", "Totals reconcile"].map((t) => <div key={t} className="flex items-center gap-1.5 font-mono text-[10.5px] text-fg-dim"><Check className="size-3 text-emerald-300" />{t}</div>)}</Soft> },
  { icon: <FileArchive className="size-4" />, title: "Multi-format export", text: "Download a single CSV, one JSON file, or a ZIP with a CSV per table.",
    visual: <Soft><div className="flex gap-2"><Chip><FileSpreadsheet className="mr-1 inline size-3" />CSV</Chip><Chip><Braces className="mr-1 inline size-3" />JSON</Chip><Chip><FileArchive className="mr-1 inline size-3" />ZIP</Chip></div></Soft> },
];


/* ---------------- Showcase (static, clearly labelled examples) ---------------- */
const SHOW = {
  Tabular: { note: "customers · 5 of 2,000 rows", body: (
    <table className="w-full font-mono text-[12px]"><thead><tr className="text-left text-fg-mute">{["customer_id", "name", "city", "signup_date", "plan"].map((h) => <th key={h} className="pb-2 pr-4 font-medium">{h}</th>)}</tr></thead>
      <tbody>{[["1001", "Ayesha Khan", "Lahore", "2024-03-11", "pro"], ["1002", "Hamza Raza", "Wah Cantt", "2024-03-14", "free"], ["1003", "Sana Malik", "Karachi", "2024-04-02", "pro"], ["1004", "Bilal Ahmed", "Islamabad", "2024-04-19", "team"], ["1005", "Mehwish Noor", "Multan", "2024-05-07", "free"]].map((r) => (
        <tr key={r[0]} className="border-t border-line text-fg-dim">{r.map((c, i) => <td key={i} className="py-1.5 pr-4">{c}</td>)}</tr>))}</tbody></table>) },
  Relational: { note: "3 tables · 2 relationships · 0 orphan rows", body: (
    <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]"><RelationalPreview />
      <div className="space-y-1.5 font-mono text-[12px] text-fg-dim">{["customers.customer_id → orders.customer_id  · 1:N", "orders.order_id → order_items.order_id  · 1:N", "Every order references an existing customer"].map((t, i) => (
        <div key={t} className="flex items-start gap-2">{i === 2 ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" /> : <GitBranch className="mt-0.5 size-3.5 shrink-0 text-accent" />}{t}</div>))}</div></div>) },
  Document: { note: "customers → orders, nested by foreign key", body: (
    <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-fg-dim">{`{
  "customer_id": 1001,
  "name": "Ayesha Khan",
  "orders": [
    { "order_id": 5001, "total": 12400, "status": "paid" },
    { "order_id": 5007, "total": 3150,  "status": "paid" }
  ]
}`}</pre>) },
} as const;
type ShowKey = keyof typeof SHOW;

function Showcase() {
  const [tab, setTab] = useState<ShowKey>("Tabular");
  const keys = Object.keys(SHOW) as ShowKey[];
  return (
    <section id="showcase" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8">
      <Heading eyebrow="See the output" title="Data that behaves like data" sub="Examples below are illustrative. In the app, every number comes from your own generation run." />
      <div className="glass rounded-2xl">
        <div role="tablist" aria-label="Data type examples" className="flex gap-1 border-b border-line p-2">
          {keys.map((k) => (
            <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => setTab(k)}
              className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === k ? "bg-accent/15 text-accent-soft" : "text-fg-mute hover:text-fg")}>{k}</button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-fg-mute"><span className="font-mono">{SHOW[tab].note}</span><Chip>Illustrative example</Chip></div>
          <div className="overflow-x-auto">{SHOW[tab].body}</div>
        </div>
      </div>
    </section>
  );
}

const AUDIENCE: [string, string][] = [
  ["Developers & QA", "Seed realistic databases for tests, demos and staging without copying production records."],
  ["Data & ML teams", "Prototype pipelines and dashboards with reproducible data, before the real data is available."],
  ["Product & demo teams", "Fill a product with believable content so screenshots and walkthroughs look right."],
  ["Educators & students", "Practise SQL, joins and analysis on connected tables that are safe to share."],
];

function Heading({ id, eyebrow, title, sub }: { id?: string; eyebrow: string; title: string; sub?: string }) {
  return (
    <div id={id} className="mb-10 max-w-2xl scroll-mt-24">
      <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">{eyebrow}</div>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-fg-dim">{sub}</p>}
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing-bg">
      <PublicHeader landing />
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_540px] lg:pt-24">
        <div className="animate-fade-up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-xs text-accent-soft"><Sparkles className="size-3.5" /> Synthetic data intelligence platform</div>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Your Data's <span className="bg-gradient-to-r from-accent-soft to-sky-300 bg-clip-text text-transparent">Future Starts Here.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-dim">
            Design, generate, validate and export realistic tabular, relational and document data from a single workspace, with integrity checks you can see and a plan you approve first.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app/input" className="group inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-canvas shadow-[0_10px_40px_-10px_var(--color-accent)] transition hover:bg-accent-soft">
              Start Generating <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#showcase" className="rounded-xl border border-line-strong px-6 py-3 font-semibold text-fg transition-colors hover:bg-panel-2">See it in action</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-mute">
            {["Guided 7-step workflow", "CSV · JSON · ZIP export", "Deterministic integrity checks", "Reproducible with a seed"].map((t) => <span key={t} className="flex items-center gap-1.5"><Check className="size-3.5 text-accent" />{t}</span>)}
          </div>
        </div>
        <SceneLoader label="Interactive 3D illustration: tables, relationships and documents flowing into a synthetic data engine" className="h-[340px] w-full lg:h-[520px]"
          fallback={<HeroScene />} />
      </section>

      <section id="platform" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-20 sm:px-8"><Pipeline /></section>

      <Showcase />

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Heading eyebrow="Insights" title="Why Synthetic Data?" />
        <div className="grid gap-4 md:grid-cols-6">
          {QUOTES.map((q, i) => (
            <figure key={q} className={cn("glass depth-card relative overflow-hidden rounded-2xl p-6", QSPAN[i])}>
              <Quote className="mb-4 size-6 text-accent/70" />
              <blockquote className="text-lg font-medium leading-snug text-fg">{q}</blockquote>
              <span className="pointer-events-none absolute -bottom-3 right-3 font-mono text-6xl font-bold text-fg/[0.04]">{String(i + 1).padStart(2, "0")}</span>
            </figure>
          ))}
        </div>
      </section>

      <section id="types" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
        <Heading eyebrow="Platform" title="One workspace. Three data types." sub="Pick what you need; the same plan, validation and export flow applies to all of them." />
        <div className="grid gap-5 md:grid-cols-3">
          {TYPES.map((t) => (
            <div key={t.title} className="glass depth-card flex flex-col rounded-2xl p-6">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">{t.icon}</div>
              <h3 className="text-xl font-semibold">{t.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-dim">{t.text}</p>
              <div className="my-5">{t.preview}</div>
              <div className="flex flex-wrap gap-1.5">{t.tags.map(([l, tone]) => <Chip key={l} tone={tone}>{l}</Chip>)}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="audience" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
        <Heading eyebrow="Who it's for" title="Made for people who build with data" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map(([t, d]) => <div key={t} className="glass depth-card rounded-2xl p-5"><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-fg-dim">{d}</p></div>)}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
        <Heading eyebrow="How it works" title="From idea to dataset in five steps" />
        <ol className="relative grid gap-8 md:grid-cols-5 md:gap-4">
          <div className="absolute left-5 top-5 hidden h-px w-[calc(100%-2.5rem)] bg-gradient-to-r from-accent/60 via-line-strong to-accent/10 md:block" aria-hidden="true" />
          {STEPS.map(([t, d], i) => (
            <li key={t} className="relative flex gap-4 md:block">
              <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-canvas font-mono text-sm text-accent shadow-[0_0_24px_-6px_var(--color-accent)]">{String(i + 1).padStart(2, "0")}</span>
              <div className="md:mt-4"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm leading-relaxed text-fg-dim">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section id="capabilities" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
        <Heading eyebrow="Capabilities" title="Built for data you can trust" sub="Previews below are illustrative examples." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPS.map((c) => (
            <div key={c.title} className="glass depth-card flex flex-col rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between"><span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">{c.icon}</span>{c.soon && <Chip tone="soon">Coming soon</Chip>}</div>
              <h3 className="font-semibold">{c.title}</h3>
              <p className="mb-4 mt-1.5 flex-1 text-sm leading-relaxed text-fg-dim">{c.text}</p>
              {c.visual}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8">
        <div className="glass relative overflow-hidden rounded-3xl p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"><SceneLoader subtle label="" className="size-full" /></div>
          <FileInput className="relative mx-auto mb-4 size-7 text-accent" /><ScanSearch className="hidden" />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Generate your first dataset.</h2>
          <p className="relative mx-auto mt-3 max-w-md text-fg-dim">Describe it or upload a sample. You review the plan before anything is generated.</p>
          {ACCOUNTS_ENABLED ? (
            <>
              <Link to="/signup" className="relative mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3 font-semibold text-canvas transition hover:bg-accent-soft">Create a free account <ArrowRight className="size-4" /></Link>
              <p className="relative mt-3 text-xs text-fg-mute">Or <Link to="/app/input" className="text-accent underline">try the generator without an account</Link>.</p>
            </>
          ) : (
            <Link to="/app/input" className="relative mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3 font-semibold text-canvas transition hover:bg-accent-soft">Start Generating <ArrowRight className="size-4" /></Link>
          )}
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
