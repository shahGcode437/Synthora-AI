import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

/** Button + floating panel. Closes on outside click and Esc; the trigger gets the right ARIA state. */
export function Popover({ label, trigger, children, align = "left", panelClassName }: {
  label: string; trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, close]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60">{trigger(open)}</button>
      {open && (
        <div role="dialog" aria-label={label}
          className={cn("glass absolute top-full z-30 mt-2 max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl p-3", align === "right" ? "right-0" : "left-0", panelClassName)}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
