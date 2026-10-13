import { Bell, BookOpen, ChevronDown, Info, Keyboard, LogIn, LogOut, Moon, Settings as Cog, Sun, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Avatar } from "../components/page";
import { cn } from "../lib/cn";
import { Link, useRouter } from "../router";
import { useApp, type EventTone } from "../state/AppContext";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, close]);
  return ref;
}

const DOT: Record<EventTone, string> = { success: "bg-emerald-400", danger: "bg-rose-400", warning: "bg-amber-400", info: "bg-sky-400" };
const iconBtn = "relative flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-fg-dim outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60";

export function ThemeToggle() {
  const { settings, setSettings } = useApp();
  const dark = settings.theme === "dark";
  return (
    <button aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}
      onClick={() => setSettings({ theme: dark ? "light" : "dark" })} className={iconBtn}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function NotificationBell() {
  const { events, clearEvents } = useApp();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(Date.now());
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const unread = events.filter((e) => e.ts > seen).length;
  return (
    <div className="relative" ref={ref}>
      <button aria-label={`Activity${unread ? `, ${unread} new` : ""}`} aria-expanded={open} onClick={() => { setOpen((o) => !o); setSeen(Date.now()); }} className={iconBtn}>
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-canvas">{unread}</span>}
      </button>
      {open && (
        <div className="glass absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl p-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-mute">Activity</span>
            {events.length > 0 && <button onClick={clearEvents} className="flex items-center gap-1 text-xs text-fg-mute hover:text-fg"><Trash2 className="size-3" /> Clear</button>}
          </div>
          {events.length === 0 ? (
            <p className="px-2 pb-3 pt-1 text-xs leading-relaxed text-fg-mute">Nothing yet. Analysis, generation, export and API connectivity events appear here as they happen.</p>
          ) : (
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-panel-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[e.tone])} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-fg">{e.title}</div>
                    {e.detail && <div className="truncate text-xs text-fg-mute">{e.detail}</div>}
                    <div className="text-[11px] text-fg-mute">{new Date(e.ts).toLocaleTimeString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function UserMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const { status, user, logout } = useAuth();
  const { path, go } = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg-dim outline-none transition-colors hover:bg-panel-2 hover:text-fg focus-visible:bg-panel-2";

  if (status === "loading") return <div className="size-8 animate-pulse rounded-full bg-panel-3" aria-label="Loading account" />;
  if (status !== "authed" || !user) {
    const next = `?next=${encodeURIComponent(path)}`;
    return (
      <div className="flex items-center gap-1.5">
        <Link to={`/login${next}`} className="flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-fg transition-colors hover:bg-panel-2"><LogIn className="size-3.5" />Sign in</Link>
        <Link to={`/signup${next}`} className="hidden h-8 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-canvas transition-colors hover:bg-accent-soft md:flex">Create account</Link>
      </div>
    );
  }
  return (
    <div className="relative" ref={ref}>
      <button aria-label="Account menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-transparent py-0.5 pl-0.5 pr-1.5 outline-none transition hover:border-line focus-visible:ring-2 focus-visible:ring-accent/60">
        <Avatar name={user.name} src={user.avatar_url} />
        <ChevronDown className="hidden size-3.5 text-fg-mute sm:block" />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 top-11 z-50 w-64 animate-fade-in rounded-xl p-2">
          <div className="flex items-center gap-3 border-b border-line px-2.5 pb-2.5 pt-1.5">
            <Avatar name={user.name} src={user.avatar_url} className="size-9" />
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-fg">{user.name}</div><div className="truncate text-xs text-fg-mute">{user.email}</div></div>
          </div>
          <div className="pt-1.5">
            <Link to="/app/profile" onClick={close} role="menuitem" className={item}><UserRound className="size-4" /> Profile</Link>
            <Link to="/app/settings" onClick={close} role="menuitem" className={item}><Cog className="size-4" /> Settings</Link>
            <button role="menuitem" className={item} onClick={() => { close(); onShortcuts(); }}><Keyboard className="size-4" /> Keyboard shortcuts</button>
            <Link to="/app/help" onClick={close} role="menuitem" className={item}><BookOpen className="size-4" /> Help</Link>
            <Link to="/app/about" onClick={close} role="menuitem" className={item}><Info className="size-4" /> About Synthora AI</Link>
          </div>
          <div className="mt-1.5 border-t border-line pt-1.5">
            <button role="menuitem" className={item} onClick={async () => { close(); await logout(); toast.push("info", "Signed out"); go("/", true); }}><LogOut className="size-4" /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
