import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import type { Json } from "../lib/documents";

const PAGE = 25; // children revealed at a time for long arrays/objects

/** Syntax-highlighted, collapsible JSON. Read-only: it renders exactly the value it is given. */
export function JsonView({ value, defaultDepth = 2 }: { value: Json; defaultDepth?: number }) {
  return <div className="font-mono text-[12.5px] leading-[1.65]" role="tree" aria-label="JSON document"><Node k={null} v={value} depth={0} open={defaultDepth} last /></div>;
}

const isObj = (v: Json): v is { [k: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);

function Scalar({ v }: { v: Json }) {
  if (v === null) return <span className="italic text-fg-mute">null</span>;
  if (typeof v === "string") return <span className="text-emerald-300 break-all">&quot;{v.length > 140 ? `${v.slice(0, 140)}…` : v}&quot;</span>;
  if (typeof v === "number") return <span className="text-violet-300">{v}</span>;
  return <span className="text-pink-300">{String(v)}</span>;
}

function Node({ k, v, depth, open, last }: { k: string | null; v: Json; depth: number; open: number; last: boolean }) {
  const container = typeof v === "object" && v !== null;
  const [expanded, setExpanded] = useState(depth < open);
  const [shown, setShown] = useState(PAGE);
  const key = k !== null && <><span className="text-sky-300">&quot;{k}&quot;</span><span className="text-fg-mute">: </span></>;
  const comma = last ? "" : ",";

  if (!container) return <div role="treeitem" className="pl-4">{key}<Scalar v={v} />{comma}</div>;

  const entries: [string | null, Json][] = Array.isArray(v) ? v.map((x) => [null, x]) : Object.entries(v);
  const [openB, closeB] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
  const label = `${entries.length} ${Array.isArray(v) ? (entries.length === 1 ? "item" : "items") : entries.length === 1 ? "key" : "keys"}`;

  if (entries.length === 0) return <div role="treeitem" className="pl-4">{key}<span className="text-fg-dim">{openB}{closeB}</span>{comma}</div>;

  return (
    <div role="treeitem" aria-expanded={expanded} className={depth ? "pl-4" : undefined}>
      <button onClick={() => setExpanded((e) => !e)} className="group -ml-4 inline-flex items-center rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        aria-label={`${expanded ? "Collapse" : "Expand"} ${k ?? "node"} (${label})`}>
        <ChevronRight className={cn("size-3.5 shrink-0 text-fg-mute transition-transform", expanded && "rotate-90")} />
        {key}<span className="text-fg-dim">{openB}</span>
        {!expanded && <span className="mx-1 text-fg-mute">{label}</span>}
        {!expanded && <span className="text-fg-dim">{closeB}{comma}</span>}
      </button>
      {expanded && (
        <>
          <div role="group">
            {entries.slice(0, shown).map(([ek, ev], i) => (
              <Node key={`${ek ?? i}`} k={Array.isArray(v) ? null : ek} v={ev} depth={depth + 1} open={open} last={i === Math.min(shown, entries.length) - 1 && shown >= entries.length} />
            ))}
            {entries.length > shown && (
              <button onClick={() => setShown((s) => s + PAGE)} className="ml-4 rounded px-1 text-xs text-accent hover:underline">… {entries.length - shown} more</button>
            )}
          </div>
          <div className="text-fg-dim">{closeB}{comma}</div>
        </>
      )}
    </div>
  );
}
