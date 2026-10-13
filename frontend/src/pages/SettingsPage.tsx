import { Bot, Database, Download, Info, Palette, PlugZap, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { API_BASE, getHealth } from "../api/client";
import type { EdgeCaseMode, PrivacyMode } from "../api/types";
import { Badge, Button, Card, CardHeader, Input, Label, SectionTitle, Segmented, Select } from "../components/ui";
import { cn } from "../lib/cn";
import { EDGE, LOCALES, PRIVACY } from "../sections/ControlsFields";
import { useApp } from "../state/AppContext";
import { AboutContent } from "./AboutPage";

type Sec = "general" | "ai" | "privacy" | "data" | "export" | "appearance" | "api" | "about";
const SECS: { key: Sec; label: string; icon: ReactNode }[] = [
  { key: "general", label: "General", icon: <Settings2 className="size-4" /> },
  { key: "ai", label: "AI & Generation", icon: <Bot className="size-4" /> },
  { key: "privacy", label: "Privacy", icon: <ShieldCheck className="size-4" /> },
  { key: "data", label: "Data", icon: <Database className="size-4" /> },
  { key: "export", label: "Export", icon: <Download className="size-4" /> },
  { key: "appearance", label: "Appearance", icon: <Palette className="size-4" /> },
  { key: "api", label: "API", icon: <PlugZap className="size-4" /> },
  { key: "about", label: "About", icon: <Info className="size-4" /> },
];

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-sm"><div className="text-sm font-medium text-fg">{title}</div>{hint && <div className="mt-0.5 text-xs text-fg-mute">{hint}</div>}</div>
      <div className="sm:w-64">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 rounded-full border transition-colors", checked ? "border-accent bg-accent/80" : "border-line-strong bg-panel-3")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[1.375rem]" : "left-0.5")} />
    </button>
  );
}

export function SettingsPage() {
  const { settings: s, setSettings: set, resetSettings, health, recheck, ws } = useApp();
  const [sec, setSec] = useState<Sec>("general");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; ms: number; msg: string } | null>(null);
  const ai = ws.state.ai;

  const runTest = async () => {
    setTesting(true);
    const t = performance.now();
    try {
      const h = await getHealth();
      setTest({ ok: h.status === "ok", ms: Math.round(performance.now() - t), msg: `${h.service} v${h.version}` });
    } catch (e) {
      setTest({ ok: false, ms: Math.round(performance.now() - t), msg: e instanceof Error ? e.message : "Request failed" });
    }
    setTesting(false);
    recheck();
  };

  const body = (): ReactNode => {
    switch (sec) {
      case "general": return (
        <Card>
          <CardHeader title="General" subtitle="Defaults used to pre-fill a new session." />
          <Row title="Workspace name" hint="Shown in the dashboard."><Input maxLength={40} value={s.workspaceName} onChange={(e) => set({ workspaceName: e.target.value })} /></Row>
          <Row title="Default locale" hint="Sent as the locale of each request. Auto lets the AI decide.">
            <Select value={s.locale} onChange={(e) => set({ locale: e.target.value })}>
              {LOCALES.filter((l) => l.value !== "__custom").map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
          </Row>
          <Row title="Default row count" hint="Empty means Auto.">
            <Input inputMode="numeric" placeholder="Auto" value={s.rows} onChange={(e) => set({ rows: e.target.value.replace(/[^\d]/g, "") })} />
          </Row>
        </Card>);
      case "ai": return (
        <Card>
          <CardHeader title="AI & Generation" subtitle="The backend chooses the provider and fails over automatically." />
          <Row title="Last provider used" hint="From your most recent analysis in this session.">
            {ai ? <Badge tone="accent">{ai.provider} · {ai.fallbacks} fallback(s)</Badge> : <span className="text-sm text-fg-mute">No AI request yet</span>}
          </Row>
          <Row title="Default edge-case behavior" hint={EDGE.find((e) => e.value === s.edge)?.hint}>
            <Select value={s.edge} onChange={(e) => set({ edge: e.target.value as EdgeCaseMode })}>
              {EDGE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Row>
          <Row title="AI recommendations" hint="Choose “AI Recommended” above to let the AI pick domain-aware edge cases."><Badge tone="muted">Part of edge-case behavior</Badge></Row>
        </Card>);
      case "privacy": return (
        <Card>
          <CardHeader title="Privacy" subtitle="Applies to new requests." />
          <Row title="Default privacy mode" hint={PRIVACY.find((p) => p.value === s.privacy)?.hint}>
            <Select value={s.privacy} onChange={(e) => set({ privacy: e.target.value as PrivacyMode })}>
              {PRIVACY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Row>
          <Row title="Uploaded CSV handling" hint="As stated in the Input step: processed in memory, PII columns masked before anything reaches the AI."><Badge tone="success">Built in</Badge></Row>
          <Row title="Masking, hashing, differential noise" hint="Per-field controls are not exposed in the interface yet."><Badge tone="muted">Not available yet</Badge></Row>
        </Card>);
      case "data": return (
        <Card>
          <CardHeader title="Data" subtitle="Defaults and limits." />
          <Row title="Default random seed" hint="Same plan and same seed give the same rows. Empty means random.">
            <Input inputMode="numeric" placeholder="Random" value={s.seed} onChange={(e) => set({ seed: e.target.value.replace(/[^\d-]/g, "") })} />
          </Row>
          <Row title="Target rows limit" hint="Enforced by the Input form."><span className="text-sm text-fg-dim">1 to 1,000,000</span></Row>
          <Row title="Sample CSV limit" hint="Enforced by the Input form."><span className="text-sm text-fg-dim">10 MB · 200,000 rows</span></Row>
        </Card>);
      case "export": return (
        <Card>
          <CardHeader title="Export" subtitle="Which format is highlighted first on the Export step." />
          <Row title="Default format" hint="CSV needs a single table; with several tables the highlight falls back to ZIP.">
            <Segmented value={s.exportFormat} onChange={(v) => set({ exportFormat: v })}
              options={[{ value: "auto", label: "Auto" }, { value: "csv", label: "CSV" }, { value: "json", label: "JSON" }, { value: "zip", label: "ZIP" }]} />
          </Row>
          <Row title="SQL dump, PDF" hint="Not supported by the backend yet."><Badge tone="muted">Coming soon</Badge></Row>
        </Card>);
      case "appearance": return (
        <Card>
          <CardHeader title="Appearance" subtitle="Applied instantly and remembered in this browser." />
          <Row title="Theme"><Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} /></Row>
          <Row title="Density" hint="Compact scales the whole interface down slightly."><Segmented value={s.density} onChange={(v) => set({ density: v })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} /></Row>
          <Row title="Animations" hint="Page transitions and motion."><Toggle checked={s.animations} onChange={(v) => set({ animations: v })} label="Animations" /></Row>
          <Row title="3D effects" hint="Depth, tilt and floating cards on the landing page."><Segmented value={s.depth} onChange={(v) => set({ depth: v })} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }]} /></Row>
        </Card>);
      case "api": return (
        <Card>
          <CardHeader title="API" subtitle="Connection to the Synthora backend." />
          <Row title="Endpoint"><code className="break-all font-mono text-xs text-fg-dim">{API_BASE}</code></Row>
          <Row title="Status" hint={health.version ? `Backend version ${health.version}` : undefined}>
            <Badge tone={health.status === "online" ? "success" : health.status === "offline" ? "danger" : "muted"}>
              {health.status === "online" ? "Online" : health.status === "offline" ? "Offline" : "Checking…"}
            </Badge>
          </Row>
          <Row title="Connection test" hint={test ? `${test.ok ? "Reachable" : "Failed"} · ${test.ms} ms · ${test.msg}` : "Calls the health endpoint once."}>
            <Button variant="ghost" size="sm" loading={testing} onClick={runTest}>Test connection</Button>
          </Row>
          <Row title="API keys" hint="Provider keys live on the server and are never sent to the browser."><Badge tone="success">Server-side only</Badge></Row>
          <Row title="API reference"><a className="text-sm text-accent hover:underline" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">Open interactive docs</a></Row>
        </Card>);
      case "about": return <AboutContent embedded />;
    }
  };

  return (
    <div className="animate-fade-up">
      <SectionTitle eyebrow="Workspace" title="Settings" description="Preferences are saved automatically in this browser." />
      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {SECS.map((x) => (
            <button key={x.key} onClick={() => setSec(x.key)} aria-current={sec === x.key ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                sec === x.key ? "bg-accent/10 text-accent-soft ring-1 ring-accent/30" : "text-fg-dim hover:bg-panel-2 hover:text-fg")}>
              {x.icon}{x.label}
            </button>
          ))}
          <button onClick={resetSettings} className="mt-2 hidden items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-fg-mute hover:text-fg md:flex">
            <SlidersHorizontal className="size-3.5" /> Reset to defaults
          </button>
        </nav>
        <div key={sec} className="min-w-0 animate-fade-in">{body()}</div>
      </div>
    </div>
  );
}
