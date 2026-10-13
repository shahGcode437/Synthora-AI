import { Bell, Info, Keyboard, Moon, Sun, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
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

export function ShortcutsButton({ onShortcuts }: { onShortcuts: () => void }) {
  return <button aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onShortcuts} className={iconBtn}><Keyboard className="size-4" /></button>;
}
