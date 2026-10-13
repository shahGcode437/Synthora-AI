import { ChevronRight, Cpu, Menu, PanelLeft, RefreshCw } from "lucide-react";
import { API_BASE } from "../api/client";
import { Logo } from "../components/Logo";
import { cn } from "../lib/cn";
import { fmtMs } from "../lib/format";
import { Link, useRouter } from "../router";
import { useApp } from "../state/AppContext";
import { NotificationBell, ThemeToggle, UserMenu } from "./HeaderMenus";
import { routeMeta } from "./nav";

export function ApiStatus() {
  const { health, recheck } = useApp();
  const online = health.status === "online";
  const checking = health.status === "checking";
  return (
    <button onClick={recheck} title={`${API_BASE}${health.version ? ` · v${health.version}` : ""} — click to re-check`}
      className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
        online && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15",
        health.status === "offline" && "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15",
        checking && "border-line bg-panel text-fg-mute")}>
      <span className="relative flex size-2">
        {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", online ? "bg-emerald-400" : checking ? "bg-fg-mute" : "bg-rose-400")} />
      </span>
      <span className="hidden sm:inline">{checking ? "Checking…" : online ? "API Online" : "API Offline"}</span>
      <span className="sm:hidden sr-only">{online ? "API Online" : "API Offline"}</span>
      {health.status === "offline" && <RefreshCw className="size-3" />}
    </button>
  );
}

export function AppHeader({ onMenu, onShortcuts, onToggleSidebar, sidebarCollapsed }: {
  onMenu: () => void; onShortcuts: () => void; onToggleSidebar: () => void; sidebarCollapsed: boolean;
}) {
  const { ws } = useApp();
  const { path } = useRouter();
  const ai = ws.state.ai;
  const { crumbs } = routeMeta(path);
  const iconBtn = "flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-fg-dim outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
        <button aria-label="Open navigation" onClick={onMenu} className={cn(iconBtn, "lg:hidden")}><Menu className="size-4" /></button>
        <button aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} onClick={onToggleSidebar} className={cn(iconBtn, "hidden lg:flex")}><PanelLeft className="size-4" /></button>
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Synthora AI home">
          <Logo className="size-8" />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Synthora <span className="text-accent">AI</span></span>
        </Link>

        <nav aria-label="Breadcrumb" className="ml-2 hidden min-w-0 items-center gap-1 text-[13px] text-fg-mute md:flex">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />}
              {c.to && i < crumbs.length - 1 ? <Link to={c.to} className="truncate hover:text-fg">{c.label}</Link>
                : <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={cn("truncate", i === crumbs.length - 1 && "font-medium text-fg")}>{c.label}</span>}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div title={ai ? `Last analysis · model ${ai.model ?? "n/a"} · ${ai.fallbacks} fallback(s)` : "No AI request has run in this session yet"}
            className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-dim xl:flex">
            <Cpu className="size-3.5 text-accent" />
            {ai ? (<><span className="font-medium text-fg">{ai.provider}</span><span className="text-fg-mute">· {fmtMs(ai.latency_ms)}</span>
              {ai.fallbacks > 0 && <span className="text-amber-300">· {ai.fallbacks} fallback{ai.fallbacks > 1 ? "s" : ""}</span>}</>) : <span className="text-fg-mute">AI: idle</span>}
          </div>
          <ApiStatus />
          <NotificationBell />
          <ThemeToggle />
          <UserMenu onShortcuts={onShortcuts} />
        </div>
      </div>
    </header>
  );
}
