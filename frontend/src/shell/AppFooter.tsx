import { API_BASE } from "../api/client";
import { cn } from "../lib/cn";
import { Link } from "../router";
import { useApp } from "../state/AppContext";

export const APP_VERSION = "0.1.0";

export function AppFooter() {
  const { health, ws } = useApp();
  const provider = ws.state.ai?.provider;
  const tone = health.status === "online" ? "text-emerald-300" : health.status === "offline" ? "text-rose-300" : "text-fg-mute";
  return (
    <footer className="border-t border-line bg-canvas/70">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-xs text-fg-mute sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-fg-dim">Synthora AI</span>
          <span className="hidden sm:inline">From schema to trustworthy synthetic data.</span>
        </div>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link to="/docs" className="hover:text-fg">Documentation</Link>
          <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" className="hover:text-fg">API</a>
          <Link to="/app/about" className="hover:text-fg">About</Link>
        </nav>
        <div className="flex items-center gap-4">
          <span>AI engine: <span className="text-fg-dim">{provider ?? "not used yet"}</span></span>
          <span>API: <span className={cn("font-medium", tone)}>{health.status === "checking" ? "Checking…" : health.status === "online" ? "Online" : "Offline"}</span></span>
          <span>v{APP_VERSION}</span>
        </div>
      </div>
    </footer>
  );
}
