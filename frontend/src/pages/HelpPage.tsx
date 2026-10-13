import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { API_BASE } from "../api/client";
import { Card, SectionTitle } from "../components/ui";

interface Doc { id: string; title: string; body: string[] }

const DOCS: Doc[] = [
  { id: "getting-started", title: "Getting Started", body: [
    "Synthora works in seven steps: Input, Analyze, Generation Plan, Generate, Validate, Quality & Fidelity, Export.",
    "Start by describing a dataset in plain language or uploading a sample CSV. Each later step unlocks when the one before it is done." ] },
  { id: "input", title: "Input", body: [
    "Prompt mode: describe the data you need (up to 8,000 characters). CSV mode: upload a file with a header row, up to 10 MB and 200,000 rows.",
    "Optional controls: target rows (1 to 1,000,000), locale, edge cases, privacy mode and a random seed. Your controls override the AI's assumptions." ] },
  { id: "schema-analysis", title: "Schema Analysis", body: [
    "For a CSV, the file is profiled first and only a compact summary goes to the AI.",
    "The analysis shows the inferred domain, tables, column meanings, PII fields, relationships and any warnings or low-confidence assumptions." ] },
  { id: "generation-plans", title: "Generation Plans", body: [
    "The plan lists tables, columns, relationships, privacy actions and edge cases before anything is generated.",
    "You can change the target row count of each table. Editing the plan discards earlier output, so you always export data that matches the plan you see." ] },
  { id: "relational-data", title: "Relational Data", body: [
    "Plans can contain several tables linked by keys. Relationships are described as 1:1, 1:N or N:N.",
    "Keys are enforced by code, and the Validate step reports duplicate keys and orphan rows. Multi-table results export as a ZIP with one CSV per table." ] },
  { id: "documents", title: "Documents", body: [
    "Invoices, bank statements and PDF documents are not available yet. They are on the roadmap and will reuse the same generated records." ] },
  { id: "validation", title: "Validation", body: [
    "Every generation ends with deterministic checks. The Validate step shows whether they passed and lists any errors.",
    "Quality & Fidelity adds charts that compare original and synthetic data when you started from a CSV." ] },
  { id: "export", title: "Export", body: [
    "CSV (one table), JSON (all tables in one file) and ZIP (one CSV per table plus data.json). Files are built in memory and not stored.",
    "SQL dumps and PDF export are not available yet." ] },
  { id: "api", title: "API", body: [
    `The backend is a REST API at ${API_BASE}. Endpoints: GET /health, POST /api/v1/analyze, POST /api/v1/analyze/sample, POST /api/v1/generate, POST /api/v1/export.`,
    "Interactive reference is served at /docs on the API host. The browser never talks to AI providers directly." ] },
];

export function HelpContent({ pub = false }: { pub?: boolean }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? DOCS.filter((d) => (d.title + " " + d.body.join(" ")).toLowerCase().includes(t)) : DOCS;
  }, [q]);
  return (
    <div className="animate-fade-up">
      <SectionTitle eyebrow={pub ? "Documentation" : "Help"} title={pub ? "Documentation" : "Help"} description="Short, accurate guides to every part of the workflow." />
      <label className="relative mb-6 block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs" aria-label="Search documentation"
          className="w-full rounded-lg border border-line-strong bg-panel py-2.5 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-mute focus:border-accent/60" />
      </label>
      {list.length === 0 ? (
        <p className="text-sm text-fg-mute">No guide matches “{q}”.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((d) => (
            <Card key={d.id} className="depth-card p-5">
              <h3 id={d.id} className="text-base font-semibold text-fg">{d.title}</h3>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-fg-dim">{d.body.map((p, i) => <p key={i}>{p}</p>)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
