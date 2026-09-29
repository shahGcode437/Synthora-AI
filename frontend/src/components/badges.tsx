import { Fingerprint, Key, Link2, ShieldAlert } from "lucide-react";
import type { GeneratorStrategy, PIIClass, PrivacyAction, CheckStatus } from "../api/types";
import { Badge, type Tone } from "./ui";
import { humanize } from "../lib/format";

const STRATEGY: Record<GeneratorStrategy, { label: string; tone: Tone }> = {
  faker: { label: "Faker", tone: "accent" },
  derived: { label: "Derived", tone: "violet" },
  categorical: { label: "Categorical", tone: "sky" },
  statistical: { label: "Statistical", tone: "indigo" },
  deterministic_id: { label: "Deterministic", tone: "neutral" },
  foreign_key: { label: "Foreign key", tone: "sky" },
  ai_text: { label: "AI text", tone: "pink" },
  constant: { label: "Constant", tone: "muted" },
};

export function StrategyBadge({ strategy }: { strategy: GeneratorStrategy }) {
  const s = STRATEGY[strategy] ?? { label: humanize(strategy), tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const PKBadge = () => <Badge tone="warning" icon={<Key className="size-3" />}>PK</Badge>;
export const FKBadge = ({ to }: { to?: string }) => (
  <Badge tone="sky" icon={<Link2 className="size-3" />} title={to ? `References ${to}` : undefined}>FK</Badge>
);

const PII: Record<PIIClass, { label: string; tone: Tone } | null> = {
  none: null,
  direct_identifier: { label: "PII", tone: "danger" },
  quasi_identifier: { label: "Quasi-ID", tone: "warning" },
  sensitive: { label: "Sensitive", tone: "pink" },
};

export function PIIBadge({ cls, reason }: { cls: PIIClass; reason?: string | null }) {
  const p = PII[cls];
  if (!p) return null;
  return <Badge tone={p.tone} icon={<ShieldAlert className="size-3" />} title={reason ?? undefined}>{p.label}</Badge>;
}

export function PrivacyActionBadge({ action }: { action: PrivacyAction }) {
  if (action === "none") return <span className="text-fg-mute">—</span>;
  return <Badge tone={action === "synthesize" ? "success" : action === "keep" ? "warning" : "neutral"}
    icon={<Fingerprint className="size-3" />}>{humanize(action)}</Badge>;
}

export const STATUS_TONE: Record<CheckStatus, Tone> = { passed: "success", warning: "warning", error: "danger", skipped: "muted" };

export function ConfidenceMeter({ value }: { value: number | null }) {
  if (value == null) return <span className="text-fg-mute">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 55 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2" title={`Confidence ${pct}%`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-panel-3"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-xs tabular-nums text-fg-dim">{pct}%</span>
    </div>
  );
}
