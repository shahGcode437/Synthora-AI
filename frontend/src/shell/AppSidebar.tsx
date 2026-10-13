import { BookOpen, Check, ChevronDown, FileText, Lock, PanelLeftClose, PanelLeftOpen, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { Tooltip } from "../components/Tooltip";
import { cn } from "../lib/cn";
import { Link, useRouter } from "../router";
import { useApp } from "../state/AppContext";
import { NAV, isActive, isGeneratorPath, type NavLeaf } from "./nav";
import { buildSteps } from "./steps";

const KEY = "synthora.sidebar.collapsed";
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(KEY, c ? "0" : "1"); } catch { /* not persisted */ }
    return !c;
  });
  return [collapsed, toggle];
}

function ItemShell({ collapsed, active, locked, label, children }: { collapsed: boolean; active: boolean; locked?: boolean; label: string; children: ReactNode }) {
  return (
    <div className={cn("group relative rounded-lg transition-colors", active ? "bg-accent/10" : "hover:bg-panel-2")}>
      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />}
      <Tooltip label={locked ? `${label} · sign in` : label} disabled={!collapsed} className="block w-full">{children}</Tooltip>
    </div>
  );
}

function NavLink({ item, collapsed, onNavigate, locked }: { item: NavLeaf; collapsed: boolean; onNavigate?: () => void; locked: boolean }) {
  const { path } = useRouter();
  const active = isActive(item, path);
  return (
    <ItemShell collapsed={collapsed} active={active} locked={locked} label={item.label}>
      <Link to={item.to} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined}
        className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
          collapsed && "justify-center px-0", active ? "text-accent-soft" : "text-fg-dim group-hover:text-fg")}>
        <span className={cn("shrink-0", active ? "text-accent" : "text-fg-mute group-hover:text-fg-dim")}>{item.icon}</span>
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!collapsed && locked && <Lock className="size-3.5 shrink-0 text-fg-mute" aria-label="Requires sign in" />}
      </Link>
    </ItemShell>
  );
}

function GeneratorGroup({ item, collapsed, onNavigate }: { item: NavLeaf; collapsed: boolean; onNavigate?: () => void }) {
  const { ws } = useApp();
  const { path } = useRouter();
  const steps = buildSteps(ws.state);
  const active = isGeneratorPath(path);
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const current = steps.find((s) => s.route === path) ?? steps.find((s) => s.status === "active") ?? steps[0];
  const target = active ? path : current.route;

  return (
    <div>
      <ItemShell collapsed={collapsed} active={active && collapsed} label={`${item.label} · ${current.label}`}>
        <div className="flex items-center">
          <Link to={target} onClick={onNavigate} aria-label={collapsed ? item.label : undefined}
            className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              collapsed && "justify-center px-0", active ? "text-accent-soft" : "text-fg-dim hover:text-fg")}>
            <span className={cn("shrink-0", active ? "text-accent" : "text-fg-mute")}>{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
          {!collapsed && (
            <button aria-label={open ? "Collapse generator steps" : "Expand generator steps"} aria-expanded={open} onClick={() => setOpen((o) => !o)}
              className="mr-1 flex size-7 items-center justify-center rounded-md text-fg-mute hover:text-fg"><ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} /></button>
          )}
        </div>
      </ItemShell>
      {!collapsed && open && (
        <ol aria-label="Generator steps" className="relative ml-[1.6rem] mt-0.5 space-y-0.5 border-l border-line pl-2">
          {steps.map((st, i) => {
            const locked = st.status === "locked";
            const cur = path === st.route;
            const body = (
              <>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  st.status === "done" && "border-accent/50 bg-accent/10 text-accent", st.status === "active" && "border-accent bg-accent text-canvas",
                  st.status === "todo" && "border-line-strong text-fg-dim", locked && "border-line text-fg-mute")}>
                  {st.status === "done" ? <Check className="size-3" /> : locked ? <Lock className="size-2.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12.5px]">{st.label}</span>
                  {st.note && !locked && <span className="block truncate text-[10.5px] text-fg-mute">{st.note}</span>}
                </span>
              </>
            );
            const cls = cn("flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors", cur ? "bg-accent/10 text-accent-soft" : locked ? "cursor-not-allowed text-fg-mute/60" : "text-fg-dim hover:bg-panel-2 hover:text-fg");
            return (
              <li key={st.key}>
                {locked ? <div className={cls} aria-disabled="true" title="Complete the previous step first">{body}</div>
                  : <Link to={st.route} onClick={onNavigate} className={cls} aria-current={cur ? "step" : undefined}>{body}</Link>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function SidebarNav({ collapsed = false, onNavigate, onToggle, showToggle }: {
  collapsed?: boolean; onNavigate?: () => void; onToggle?: () => void; showToggle?: boolean;
}) {
  const { newSession, ws } = useApp();
  const { status } = useAuth();
  const busy = ["analyzing", "generating", "exporting"].includes(ws.state.phase);
  const guest = status !== "authed";
  const foot = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-fg-dim outline-none transition-colors hover:bg-panel-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60";
  return (
    <nav aria-label="Primary" className="flex h-full flex-col justify-between gap-4">
      <div className="space-y-5 overflow-y-auto overflow-x-hidden pr-0.5">
        {NAV.map((g) => (
          <div key={g.title}>
            {collapsed ? <div className="mx-3 mb-2 h-px bg-line" aria-hidden="true" />
              : <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fg-mute">{g.title}</div>}
            <div className="space-y-0.5">
              {g.items.map((it) => it.key === "generator"
                ? <GeneratorGroup key={it.key} item={it} collapsed={collapsed} onNavigate={onNavigate} />
                : <NavLink key={it.key} item={it} collapsed={collapsed} onNavigate={onNavigate} locked={!!it.auth && guest} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-line pt-3">
        {[
          { to: "/app/help", label: "Help", icon: <BookOpen className="size-[18px]" /> },
          { to: "/docs", label: "Documentation", icon: <FileText className="size-[18px]" /> },
        ].map((l) => (
          <Tooltip key={l.to} label={l.label} disabled={!collapsed} className="block w-full">
            <Link to={l.to} onClick={onNavigate} aria-label={collapsed ? l.label : undefined} className={cn(foot, collapsed && "justify-center px-0")}>{l.icon}{!collapsed && l.label}</Link>
          </Tooltip>
        ))}
        <Tooltip label="New session" disabled={!collapsed} className="block w-full">
          <button disabled={busy} onClick={() => { newSession(); onNavigate?.(); }} aria-label={collapsed ? "New session" : undefined}
            className={cn(foot, "disabled:opacity-50", collapsed && "justify-center px-0")}><RotateCcw className="size-[18px]" />{!collapsed && "New session"}</button>
        </Tooltip>
        {showToggle && (
          <Tooltip label="Expand sidebar" disabled={!collapsed} className="block w-full">
            <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
              className={cn(foot, "text-fg-mute", collapsed && "justify-center px-0")}>
              {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}{!collapsed && "Collapse"}
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}
