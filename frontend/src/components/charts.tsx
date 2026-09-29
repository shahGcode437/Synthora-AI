// Lightweight, dependency-free charts (CSS + SVG) in the Synthora visual language.
import type { ReactNode } from "react";
import type { NumericStats } from "../lib/fidelity";
import { fmtNum } from "../lib/format";
import { cn } from "../lib/cn";

export const ORIG = "#a5b4fc"; // indigo-300 — the source
export const SYNTH = "#2dd4bf"; // accent teal — the synthetic data

export function Legend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 text-xs text-fg-dim", className)}>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: ORIG }} />Original</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SYNTH }} />Synthetic</span>
    </div>
  );
}

const fmtP = (n: number) => `${n < 10 && n > 0 ? n.toFixed(1) : n.toFixed(n === 0 ? 0 : 1)}%`;

function BarLine({ pct, max, color, label }: { pct: number; max: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label}: ${pct.toFixed(2)}%`}>
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-panel-3">
        <div className="h-full rounded-sm transition-[width] duration-500" style={{ width: `${max ? (pct / max) * 100 : 0}%`, background: color }} />
      </div>
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-fg-dim">{fmtP(pct)}</span>
    </div>
  );
}

/** One category: original bar above synthetic bar, sharing a scale. */
export function DualBar({ label, orig, synth, max, badge }: {
  label: string; orig: number; synth: number; max: number; badge?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[13px] text-fg" title={label}>{label}</span>
        {badge}
      </div>
      <div className="space-y-1">
        <BarLine pct={orig} max={max} color={ORIG} label="Original" />
        <BarLine pct={synth} max={max} color={SYNTH} label="Synthetic" />
      </div>
    </div>
  );
}

/**
 * Quantile strip for one numeric column: thin line = min..max, light band = p5..p95, box = p25..p75,
 * white tick = median, dot = mean. Built only from real summary statistics.
 */
export function RangeStrip({ orig, synth }: { orig: NumericStats; synth: NumericStats | null }) {
  const W = 640, L = 84, R = 624, ROW = [24, 62];
  const lo = Math.min(orig.min, synth?.min ?? orig.min);
  let hi = Math.max(orig.max, synth?.max ?? orig.max);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.03;
  const a = lo - pad, b = hi + pad;
  const x = (v: number) => L + ((v - a) / (b - a)) * (R - L);

  const strip = (s: NumericStats, y: number, color: string, name: string) => (
    <g key={name}>
      <title>{`${name}: min ${fmtNum(s.min)} · p25 ${fmtNum(s.p25)} · median ${fmtNum(s.median)} · mean ${fmtNum(s.mean)} · p75 ${fmtNum(s.p75)} · max ${fmtNum(s.max)}`}</title>
      <text x={0} y={y + 4} fontSize={11} fill="#8b95a3">{name}</text>
      <line x1={x(s.min)} x2={x(s.max)} y1={y} y2={y} stroke={color} strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      <line x1={x(s.min)} x2={x(s.min)} y1={y - 5} y2={y + 5} stroke={color} strokeOpacity={0.7} />
      <line x1={x(s.max)} x2={x(s.max)} y1={y - 5} y2={y + 5} stroke={color} strokeOpacity={0.7} />
      <rect x={x(s.p5)} y={y - 5} width={Math.max(1, x(s.p95) - x(s.p5))} height={10} rx={3} fill={color} fillOpacity={0.22} />
      <rect x={x(s.p25)} y={y - 8} width={Math.max(2, x(s.p75) - x(s.p25))} height={16} rx={3} fill={color} fillOpacity={0.5} stroke={color} strokeOpacity={0.9} />
      <line x1={x(s.median)} x2={x(s.median)} y1={y - 8} y2={y + 8} stroke="#fff" strokeWidth={2} />
      <circle cx={x(s.mean)} cy={y} r={4} fill={color} stroke="#0f1216" strokeWidth={1.5} />
    </g>
  );

  return (
    <div>
      <svg viewBox={`0 0 ${W} 100`} className="w-full" role="img" aria-label="Distribution comparison by quantiles">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={L + t * (R - L)} x2={L + t * (R - L)} y1={6} y2={80} stroke="#1e232b" strokeDasharray="2 4" />
        ))}
        {strip(orig, ROW[0], ORIG, "Original")}
        {synth ? strip(synth, ROW[1], SYNTH, "Synthetic") : (
          <text x={L} y={ROW[1] + 4} fontSize={11} fill="#6c7582">No synthetic values to compare</text>
        )}
        <text x={L} y={96} fontSize={10.5} fill="#6c7582" textAnchor="start">{fmtNum(a + pad)}</text>
        <text x={(L + R) / 2} y={96} fontSize={10.5} fill="#6c7582" textAnchor="middle">{fmtNum((a + pad + b - pad) / 2)}</text>
        <text x={R} y={96} fontSize={10.5} fill="#6c7582" textAnchor="end">{fmtNum(b - pad)}</text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-mute">
        <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-fg-mute" />min–max</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-fg-mute/30" />p5–p95</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-fg-mute/70 bg-fg-mute/40" />p25–p75</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-white" />median</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-fg-mute" />mean</span>
      </div>
    </div>
  );
}

/** Two horizontal bars on a shared time axis. Inputs are ISO strings. */
export function Timeline({ origMin, origMax, synthMin, synthMax }: {
  origMin: string; origMax: string; synthMin: string | null; synthMax: string | null;
}) {
  const t = (s: string) => Date.parse(s.trim().replace(" ", "T"));
  const points = [origMin, origMax, synthMin, synthMax].filter((s): s is string => !!s).map(t);
  const lo = Math.min(...points), hi = Math.max(...points);
  const span = hi - lo || 1;
  const pos = (a: string, b: string) => {
    const left = ((t(a) - lo) / span) * 100;
    return { left: `${left}%`, width: `${Math.max(0.8, ((t(b) - t(a)) / span) * 100)}%` };
  };
  const row = (label: string, a: string | null, b: string | null, color: string) => (
    <div className="grid grid-cols-[4.75rem_1fr] items-center gap-3">
      <span className="text-xs text-fg-mute">{label}</span>
      <div className="relative h-3 rounded-full bg-panel-3">
        {a && b && <div className="absolute top-0 h-full rounded-full" style={{ ...pos(a, b), background: color, opacity: 0.85 }} />}
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      {row("Original", origMin, origMax, ORIG)}
      {row("Synthetic", synthMin, synthMax, SYNTH)}
    </div>
  );
}
