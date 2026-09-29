import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "../lib/cn";

// ------------------------------------------------------------------ Button
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]";
const btnVariants: Record<BtnVariant, string> = {
  primary:
    "bg-gradient-to-b from-accent to-accent-strong text-[#04231f] shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_18px_-8px_rgb(45_212_191/0.6)] hover:brightness-110 disabled:shadow-none",
  secondary: "border border-line-strong bg-panel-2 text-fg hover:border-fg-mute hover:bg-panel-3",
  ghost: "text-fg-dim hover:bg-panel-2 hover:text-fg",
  danger: "border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};
const btnSizes: Record<BtnSize, string> = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", lg: "h-11 px-6 text-sm" };

export function Button({
  variant = "secondary", size = "md", loading, icon, children, className, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: ReactNode }) {
  return (
    <button {...rest} disabled={disabled || loading} className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Badge
export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "sky" | "violet" | "indigo" | "pink" | "muted";
const tones: Record<Tone, string> = {
  neutral: "border-line-strong bg-panel-3 text-fg-dim",
  muted: "border-line bg-transparent text-fg-mute",
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  indigo: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  pink: "border-pink-500/30 bg-pink-500/10 text-pink-300",
};

export function Badge({ tone = "neutral", children, icon, title, className }: {
  tone?: Tone; children: ReactNode; icon?: ReactNode; title?: string; className?: string;
}) {
  return (
    <span title={title} className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
      tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Card
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-gradient-to-b from-panel to-panel/80 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right, icon }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-accent">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-fg-mute">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, right }: {
  eyebrow: string; title: string; description?: string; right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-dim">{description}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatCard({ label, value, hint, tone, icon }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "success" | "warning" | "danger"; icon?: ReactNode;
}) {
  const color = tone === "success" ? "text-emerald-300" : tone === "warning" ? "text-amber-300" : tone === "danger" ? "text-rose-300" : "text-fg";
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-fg-mute">
        <span>{label}</span>
        {icon}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums tracking-tight", color)}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-fg-mute">{hint}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Form fields
export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-fg-dim">
      <span>{children}</span>
      {hint && <span className="font-normal text-fg-mute">{hint}</span>}
    </label>
  );
}

const fieldBase =
  "w-full rounded-lg border border-line-strong bg-canvas/60 px-3 text-sm text-fg placeholder:text-fg-mute " +
  "transition-colors hover:border-fg-mute/60 focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, invalid, ...p }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...p} className={cn(fieldBase, "h-9", invalid && "border-rose-500/60", className)} />;
}

export function Textarea({ className, invalid, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...p} className={cn(fieldBase, "resize-y py-2.5 leading-relaxed", invalid && "border-rose-500/60", className)} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...p} className={cn(fieldBase, "h-9 appearance-none pr-8", className)}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-mute" />
    </div>
  );
}

// ------------------------------------------------------------------ Feedback
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-accent", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

const calloutTones = {
  info: { box: "border-sky-500/25 bg-sky-500/[0.06]", icon: <Info className="size-4 text-sky-300" />, text: "text-sky-100" },
  warning: { box: "border-amber-500/25 bg-amber-500/[0.06]", icon: <AlertTriangle className="size-4 text-amber-300" />, text: "text-amber-100" },
  error: { box: "border-rose-500/30 bg-rose-500/[0.07]", icon: <XCircle className="size-4 text-rose-300" />, text: "text-rose-100" },
  success: { box: "border-emerald-500/25 bg-emerald-500/[0.06]", icon: <CheckCircle2 className="size-4 text-emerald-300" />, text: "text-emerald-100" },
};

export function Callout({ tone = "info", title, children, action }: {
  tone?: keyof typeof calloutTones; title?: ReactNode; children?: ReactNode; action?: ReactNode;
}) {
  const t = calloutTones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 animate-fade-in", t.box)}>
      <div className="mt-0.5 shrink-0">{t.icon}</div>
      <div className={cn("min-w-0 flex-1 text-sm", t.text)}>
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn("text-[13px] opacity-90", title ? "mt-0.5" : "")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Collapsible + Tabs
export function Collapsible({ title, badge, defaultOpen = false, children, className }: {
  title: ReactNode; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md py-1.5 text-left text-xs font-medium text-fg-dim hover:text-fg">
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
        {title}
        {badge}
      </button>
      {open && <div className="animate-fade-in pt-2">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; disabled?: boolean;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-line bg-canvas/60 p-0.5">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
            value === o.value ? "bg-panel-3 text-fg shadow-sm" : "text-fg-mute hover:text-fg-dim")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ pct, tone = "accent", className }: { pct: number; tone?: "accent" | "amber" | "sky"; className?: string }) {
  const c = tone === "amber" ? "bg-amber-400/80" : tone === "sky" ? "bg-sky-400/80" : "bg-accent/80";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel-3", className)}>
      <div className={cn("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-dim", className)}>{children}</code>;
}
