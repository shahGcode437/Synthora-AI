import { useApp } from "../state/AppContext";
import { Badge, Card, CardHeader, SectionTitle } from "../components/ui";
import { APP_VERSION } from "../shell/AppFooter";

export function AboutContent({ embedded = false }: { embedded?: boolean }) {
  const { health, ws } = useApp();
  const status = health.status === "online" ? "Online" : health.status === "offline" ? "Offline" : "Checking…";
  const rows: [string, React.ReactNode][] = [
    ["Interface version", `v${APP_VERSION}`],
    ["API version", health.version ? `v${health.version}` : "Unavailable while offline"],
    ["AI engine", ws.state.ai ? `${ws.state.ai.provider} (last analysis)` : "Selected by the backend; shown after your first analysis"],
    ["Platform status", <Badge key="s" tone={health.status === "online" ? "success" : health.status === "offline" ? "danger" : "muted"}>{status}</Badge>],
  ];
  return (
    <div className="animate-fade-up space-y-6">
      {!embedded && <SectionTitle eyebrow="About" title="Synthora AI" description="From schema to trustworthy synthetic data." />}
      <Card className="p-6">
        <p className="max-w-3xl text-[15px] leading-relaxed text-fg-dim">
          Synthora AI is a schema-aware synthetic data platform designed to generate realistic tabular, relational and document data while
          preserving structural consistency and supporting validation. AI interprets what your data means, specialized generators create the
          values, and deterministic code checks that keys, relationships and totals hold.
        </p>
        <p className="mt-3 text-sm text-fg-mute">Built for developers, data engineers and AI teams.</p>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Supported data types" />
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between px-5 py-3"><span>Tabular</span><Badge tone="success">Available</Badge></li>
            <li className="flex items-center justify-between px-5 py-3"><span>Relational</span><Badge tone="success">Available</Badge></li>
            <li className="flex items-center justify-between px-5 py-3"><span>Documents (invoices, statements)</span><Badge tone="muted">Coming soon</Badge></li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Platform" />
          <dl className="divide-y divide-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-5 py-3"><dt className="text-fg-mute">{k}</dt><dd className="text-right text-fg-dim">{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
