import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** CSS-only tooltip: shows on hover and keyboard focus of the wrapped control. The control keeps its own accessible name. */
export function Tooltip({ label, side = "right", children, className, disabled }: {
  label: ReactNode; side?: "right" | "bottom" | "top"; children: ReactNode; className?: string; disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[60] whitespace-nowrap rounded-md border border-line-strong bg-panel-3 px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition-opacity duration-150",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
          side === "bottom" && "left-1/2 top-full mt-2 -translate-x-1/2",
          side === "top" && "bottom-full left-1/2 mb-2 -translate-x-1/2")}>
        {label}
      </span>
    </span>
  );
}
