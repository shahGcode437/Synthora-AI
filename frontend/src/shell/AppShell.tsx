import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "../components/Logo";
import { cn } from "../lib/cn";
import { useRouter } from "../router";
import { useApp } from "../state/AppContext";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { SidebarNav, useSidebarCollapsed } from "./AppSidebar";
import { routeMeta } from "./nav";
import { ShortcutsModal } from "./ShortcutsModal";
import { buildSteps } from "./steps";

export function AppShell({ children }: { children: ReactNode }) {
  const { path, go } = useRouter();
  const { ws } = useApp();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [drawer, setDrawer] = useState(false);
  const [keys, setKeys] = useState(false);

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { document.title = `${routeMeta(path).title} · Synthora AI`; }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrawer(false); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input,textarea,select,[contenteditable='true'],[role='dialog']")) return;
      if (e.key === "?") { setKeys(true); return; }
      if (e.key.toLowerCase() === "b") { toggleCollapsed(); return; }
      if (/^[1-7]$/.test(e.key)) {
        const st = buildSteps(ws.state)[Number(e.key) - 1];
        if (st && st.status !== "locked") go(st.route);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws.state, go, toggleCollapsed]);

  return (
    <div className="app-bg flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-canvas">Skip to content</a>
      <AppHeader onMenu={() => setDrawer(true)} onShortcuts={() => setKeys(true)} onToggleSidebar={toggleCollapsed} sidebarCollapsed={collapsed} />
      <div className="flex flex-1">
        <aside aria-label="Sidebar" data-collapsed={collapsed}
          className={cn("sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r border-line bg-panel/40 px-3 py-4 transition-[width] duration-200 ease-out lg:block",
            collapsed ? "w-[4.75rem]" : "w-64")}>
          <SidebarNav collapsed={collapsed} onToggle={toggleCollapsed} showToggle />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1280px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
            <div key={path} className="route-enter">{children}</div>
          </main>
          <AppFooter />
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawer(false)} />
          <div className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-line bg-canvas p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><Logo className="size-8" /><span className="font-semibold">Synthora <span className="text-accent">AI</span></span></div>
              <button aria-label="Close navigation" onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-fg-mute hover:text-fg"><X className="size-4" /></button>
            </div>
            <div className="min-h-0 flex-1"><SidebarNav onNavigate={() => setDrawer(false)} /></div>
          </div>
        </div>
      )}
      {keys && <ShortcutsModal onClose={() => setKeys(false)} />}
    </div>
  );
}
