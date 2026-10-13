import { useMemo } from "react";
import { cn } from "../lib/cn";
import { HEADER_H, MAX_COLS, ROW_H, layoutGraph, type GraphTable } from "../lib/graph";
import type { RelationCheck } from "../lib/integrity";

const edgeColor = (c: RelationCheck | undefined) => (!c || !c.verifiable ? "var(--color-fg-mute)" : c.ok ? "#34d399" : "#fb7185");

/** Relationship graph: tables as nodes (PK/FK marked), relations as arrows coloured by their real integrity result. */
export function RelationshipGraph({ tables, checks, selected, onSelect }: {
  tables: GraphTable[]; checks: RelationCheck[]; selected: string | null; onSelect: (name: string) => void;
}) {
  const rels = useMemo(() => checks.map(({ parentTable, parentColumn, childTable, childColumn, cardinality }) => ({ parentTable, parentColumn, childTable, childColumn, cardinality })), [checks]);
  const g = useMemo(() => layoutGraph(tables, rels), [tables, rels]);
  const checkOf = (key: string) => checks.find((c) => `${c.parentTable}.${c.parentColumn}>${c.childTable}.${c.childColumn}` === key);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-canvas/40">
      <svg viewBox={`0 0 ${g.width} ${g.height}`} style={{ minWidth: Math.min(g.width, 880), width: "100%", maxHeight: 640 }} role="group" aria-label="Table relationship graph">
        <defs>
          {["ok", "bad", "unk"].map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={k === "ok" ? "#34d399" : k === "bad" ? "#fb7185" : "var(--color-fg-mute)"} />
            </marker>
          ))}
        </defs>

        {g.edges.map((e) => {
          const c = checkOf(e.key);
          const dx = Math.max(40, Math.abs(e.to.x - e.from.x) / 2) * (e.to.x >= e.from.x ? 1 : -1);
          const active = !selected || selected === e.rel.parentTable || selected === e.rel.childTable;
          const mx = (e.from.x + e.to.x) / 2, my = (e.from.y + e.to.y) / 2;
          const label = `${e.rel.cardinality ?? "ref"}${c?.verifiable ? (c.ok ? " ✓" : ` · ${c.orphans} orphan${c.orphans === 1 ? "" : "s"}`) : ""}`;
          return (
            <g key={e.key} opacity={active ? 1 : 0.28} className="transition-opacity">
              <title>{`${e.rel.parentTable}.${e.rel.parentColumn} → ${e.rel.childTable}.${e.rel.childColumn}${c?.verifiable ? ` · ${c.checked} references checked, ${c.orphans} orphans` : " · not verifiable from this data"}`}</title>
              <path d={`M${e.from.x} ${e.from.y} C${e.from.x + dx} ${e.from.y}, ${e.to.x - dx} ${e.to.y}, ${e.to.x} ${e.to.y}`} fill="none"
                stroke={edgeColor(c)} strokeWidth={1.8} strokeDasharray={c?.ok ? "6 6" : undefined} className={c?.ok ? "flow-line" : undefined}
                markerEnd={`url(#arrow-${!c?.verifiable ? "unk" : c.ok ? "ok" : "bad"})`} />
              <rect x={mx - 34} y={my - 9} width={68} height={18} rx={9} fill="var(--color-panel)" stroke={edgeColor(c)} strokeWidth={1} />
              <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={10} fontFamily="ui-monospace,monospace" fill={edgeColor(c)}>{label}</text>
            </g>
          );
        })}

        {g.nodes.map((n) => {
          const on = selected === n.name;
          const dim = selected && !on && !g.edges.some((e) => (e.rel.parentTable === selected && e.rel.childTable === n.name) || (e.rel.childTable === selected && e.rel.parentTable === n.name));
          return (
            <g key={n.name} transform={`translate(${n.x} ${n.y})`} role="button" tabIndex={0} aria-pressed={on} aria-label={`Table ${n.name}, ${n.rows} rows`}
              onClick={() => onSelect(n.name)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(n.name); } }}
              className={cn("cursor-pointer outline-none transition-opacity [&:focus-visible>rect:first-child]:stroke-[var(--color-accent)]")} opacity={dim ? 0.4 : 1}>
              <rect width={n.w} height={n.h} rx={10} fill="var(--color-panel-2)" stroke={on ? "var(--color-accent)" : "var(--color-line-strong)"} strokeWidth={on ? 2 : 1} />
              <path d={`M0 ${HEADER_H} V10 a10 10 0 0 1 10 -10 H${n.w - 10} a10 10 0 0 1 10 10 V${HEADER_H} z`} fill="var(--color-panel-3)" />
              <text x={12} y={21} fontSize={12.5} fontWeight={600} fill="var(--color-fg)" fontFamily="ui-monospace,monospace">{n.name.length > 20 ? `${n.name.slice(0, 19)}…` : n.name}</text>
              <text x={n.w - 12} y={21} fontSize={10} textAnchor="end" fill="var(--color-fg-mute)">{n.rows.toLocaleString()} rows</text>
              {n.columns.slice(0, MAX_COLS).map((c, i) => {
                const y = HEADER_H + i * ROW_H;
                const pk = n.pk.includes(c), fk = n.fks.includes(c);
                return (
                  <g key={c}>
                    <text x={12} y={y + 14} fontSize={11} fontFamily="ui-monospace,monospace" fill={pk || fk ? "var(--color-fg)" : "var(--color-fg-dim)"}>{c.length > 19 ? `${c.slice(0, 18)}…` : c}</text>
                    {pk && <g transform={`translate(${n.w - 52} ${y + 3})`}><rect width={20} height={13} rx={3} fill="rgb(245 158 11 / 0.15)" stroke="#f59e0b" strokeWidth={0.8} /><text x={10} y={10} textAnchor="middle" fontSize={8} fontWeight={700} fill="#f59e0b">PK</text></g>}
                    {fk && <g transform={`translate(${n.w - 28} ${y + 3})`}><rect width={20} height={13} rx={3} fill="rgb(56 189 248 / 0.15)" stroke="#38bdf8" strokeWidth={0.8} /><text x={10} y={10} textAnchor="middle" fontSize={8} fontWeight={700} fill="#38bdf8">FK</text></g>}
                  </g>
                );
              })}
              {n.columns.length > MAX_COLS && <text x={12} y={HEADER_H + MAX_COLS * ROW_H + 14} fontSize={10} fill="var(--color-fg-mute)">+{n.columns.length - MAX_COLS} more columns</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
