import { Cpu, RefreshCw } from "lucide-react";
import type { AIRunMeta } from "../api/types";
import type { HealthState } from "../state/workspace";
import { API_BASE } from "../api/client";
import { fmtMs } from "../lib/format";
import { cn } from "../lib/cn";

function Logo() {
  return (
    <div className="flex size-9 items-center justify-center rounded-lg border border-accent/30 bg-gradient-to-br from-accent/20 to-sky-400/10 shadow-[0_0_24px_-6px_rgb(45_212_191/0.5)]">
      <svg viewBox="0 0 32 32" className="size-5" fill="none" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5eead4" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M9 21c0 2 2 3.5 7 3.5s7-1.5 7-3.5-2.5-3-7-3-7-1-7-3 2-3.5 7-3.5 7 1.5 7 3.5" />
      </svg>
    </div>
  );
}

export function Header({ health, onRecheck, ai }: { health: HealthState; onRecheck: () => void; ai: AIRunMeta | null }) {
  const online = health.status === "online";
  const checking = health.status === "checking";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <div className="min-w-0 leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Synthora <span className="text-accent">AI</span></div>
            <div className="hidden truncate text-[11.5px] text-fg-mute sm:block">From schema to trustworthy synthetic data.</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {ai && (
            <div title={`Last analysis · model ${ai.model ?? "n/a"} · ${ai.fallbacks} fallback(s)`}
              className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-dim md:flex">
              <Cpu className="size-3.5 text-accent" />
              <span className="font-medium text-fg">{ai.provider}</span>
              <span className="text-fg-mute">· {fmtMs(ai.latency_ms)}</span>
              {ai.fallbacks > 0 && <span className="text-amber-300">· {ai.fallbacks} fallback{ai.fallbacks > 1 ? "s" : ""}</span>}
            </div>
          )}
          <button onClick={onRecheck} title={`${API_BASE}${health.version ? ` · v${health.version}` : ""} — click to re-check`}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              online && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15",
              health.status === "offline" && "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15",
              checking && "border-line bg-panel text-fg-mute")}>
            <span className="relative flex size-2">
              {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />}
              <span className={cn("relative inline-flex size-2 rounded-full",
                online ? "bg-emerald-400" : checking ? "bg-fg-mute" : "bg-rose-400")} />
            </span>
            {checking ? "Checking…" : online ? "API Online" : "API Offline"}
            {health.status === "offline" && <RefreshCw className="size-3" />}
          </button>
        </div>
      </div>
    </header>
  );
}
