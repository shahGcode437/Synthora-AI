import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button, Input, Label } from "./ui";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal: labelled, Esc and backdrop close, focus moves in, is trapped, and returns to the trigger. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", busy }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl"; busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    (root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE) ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [open, onClose, busy]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/65" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
        className={cn("glass relative flex max-h-[92vh] w-full animate-fade-up flex-col rounded-t-2xl outline-none sm:rounded-2xl",
          size === "sm" && "sm:max-w-sm", size === "md" && "sm:max-w-md", size === "lg" && "sm:max-w-2xl", size === "xl" && "sm:max-w-5xl")}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-fg-dim">{description}</p>}
          </div>
          <button aria-label="Close dialog" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-fg-mute hover:bg-panel-2 hover:text-fg disabled:opacity-40"><X className="size-4" /></button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation for destructive actions. `confirmText` makes the user type a phrase before the button enables. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Delete", confirmText, busy, error, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmLabel?: string;
  confirmText?: string; busy?: boolean; error?: string | null; children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  const ready = !confirmText || typed.trim().toLowerCase() === confirmText.toLowerCase();
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm" busy={busy}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={busy} disabled={!ready || busy} data-autofocus={!confirmText || undefined}>{confirmLabel}</Button>
      </>}>
      {children}
      {confirmText && (
        <div className="mt-1">
          <Label htmlFor="confirm-phrase">Type <span className="font-mono text-fg">{confirmText}</span> to confirm</Label>
          <Input id="confirm-phrase" data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </Dialog>
  );
}
