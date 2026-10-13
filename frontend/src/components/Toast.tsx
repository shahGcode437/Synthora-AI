import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

type Tone = "success" | "error" | "warning" | "info";
interface ToastItem { id: number; tone: Tone; title: string; detail?: string }
interface ToastApi { push: (tone: Tone, title: string, detail?: string) => void }

const Ctx = createContext<ToastApi>({ push: () => {} });
export const useToast = () => useContext(Ctx);

const ICON = {
  success: <CheckCircle2 className="size-4 text-emerald-400" />, error: <XCircle className="size-4 text-rose-400" />,
  warning: <AlertTriangle className="size-4 text-amber-400" />, info: <Info className="size-4 text-sky-400" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: Tone, title: string, detail?: string) => {
    const id = next.current++;
    setItems((l) => [...l.slice(-3), { id, tone, title, detail }]);
    setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
  }, [dismiss]);
  const api = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
            className={cn("glass pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl px-4 py-3",
              t.tone === "error" && "border-rose-500/40")}>
            <div className="mt-0.5 shrink-0">{ICON[t.tone]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-xs text-fg-dim">{t.detail}</div>}
            </div>
            <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-fg-mute hover:text-fg"><X className="size-3.5" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
