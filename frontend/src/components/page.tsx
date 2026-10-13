import { AlertCircle, ChevronRight, Inbox, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Link } from "../router";
import { Button, Skeleton } from "./ui";

export interface Crumb { label: string; to?: string }

/** Standard page header: breadcrumbs, title, description and right-aligned actions. */
export function PageHeader({ eyebrow, title, description, actions, crumbs }: {
  eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; crumbs?: Crumb[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-fg-mute md:hidden">
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
                {c.to && i < crumbs.length - 1 ? <Link to={c.to} className="hover:text-fg">{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "text-fg-dim" : undefined}>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>}
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-fg-dim">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: {
  icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-32 w-2/3 rounded-full bg-accent/5 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-line-strong bg-panel-2 text-fg-mute">{icon ?? <Inbox className="size-5" />}</div>
      <h3 className="relative text-base font-semibold text-fg">{title}</h3>
      {children && <p className="relative mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-mute">{children}</p>}
      {action && <div className="relative mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border border-rose-500/30 text-rose-300"><AlertCircle className="size-5" /></div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-dim">{message}</p>
      {onRetry && <div className="mt-4"><Button size="sm" variant="secondary" onClick={onRetry} icon={<RotateCcw className="size-3.5" />}>Try again</Button></div>}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-line bg-panel p-4">
          <Skeleton className="size-10 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
        </div>
      ))}
    </div>
  );
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = ((parts[0]?.[0] ?? "S") + (parts[1]?.[0] ?? "")).toUpperCase();
  if (src && !failed) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn("size-8 shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-sky-400 text-xs font-bold text-canvas", className)}>{text}</span>
  );
}
