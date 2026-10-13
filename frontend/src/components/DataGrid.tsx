import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Filter as FilterIcon, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  FILTER_LABEL, cellText, columnsOf, filterRows, needsValue, nextSort, paginate, sortRows,
  type Filter, type FilterOp, type Row, type SortState,
} from "../lib/datagrid";
import { fmtInt } from "../lib/format";
import { FKBadge, PKBadge } from "./badges";
import { Popover } from "./Popover";
import { Badge, Button, Input, Select } from "./ui";

export interface GridMeta { pk?: string[]; fks?: Record<string, string>; types?: Record<string, string> }

const SIZES = [25, 50, 100];

/** Searchable, filterable, sortable, paginated grid over in-memory rows. Only one page is ever rendered. */
export function DataGrid({ rows, meta, tableLabel, toolbarRight, maxHeight = "32rem", initialPageSize = 25 }: {
  rows: Row[]; meta?: GridMeta; tableLabel?: string; toolbarRight?: ReactNode; maxHeight?: string; initialPageSize?: number;
}) {
  const allColumns = useMemo(() => columnsOf(rows), [rows]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const deferred = useDeferredValue(search);

  // A different table/dataset resets the view.
  useEffect(() => { setSearch(""); setFilters([]); setSort(null); setHidden(new Set()); setPage(1); }, [rows]);
  useEffect(() => setPage(1), [deferred, filters, sort, size]);

  const columns = allColumns.filter((c) => !hidden.has(c));
  const filtered = useMemo(() => filterRows(rows, { search: deferred, columns: allColumns, filters }), [rows, deferred, allColumns, filters]);
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const pg = paginate(sorted, page, size);
  const narrowed = filtered.length !== rows.length;

  if (!rows.length) return <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-mute">This table has no rows.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-mute" />
          <Input aria-label={`Search ${tableLabel ?? "rows"}`} placeholder="Search all columns…" value={search} className="pl-9 pr-8" onChange={(e) => setSearch(e.target.value)} />
          {search && <button aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-mute hover:text-fg"><X className="size-3.5" /></button>}
        </div>
        <FilterPopover columns={allColumns} onAdd={(f) => setFilters((l) => [...l, f])} count={filters.length} />
        <ColumnsPopover columns={allColumns} hidden={hidden} onChange={setHidden} />
        <div className="ml-auto flex items-center gap-2">{toolbarRight}</div>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {filters.map((f) => (
            <Badge key={f.id} tone="accent" className="gap-1.5 py-1 pl-2 pr-1">
              <span className="font-mono">{f.column}</span> {FILTER_LABEL[f.op]}{needsValue(f.op) && <span className="font-medium">“{f.value}”</span>}
              <button aria-label={`Remove filter on ${f.column}`} onClick={() => setFilters((l) => l.filter((x) => x.id !== f.id))} className="rounded p-0.5 hover:bg-accent/20"><X className="size-3" /></button>
            </Badge>
          ))}
          <button onClick={() => setFilters([])} className="text-xs text-fg-mute hover:text-fg">Clear all</button>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-line" style={{ maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 w-12 border-b border-line bg-panel-2 px-3 py-2 text-right text-[11px] font-medium text-fg-mute">#</th>
              {columns.map((c) => {
                const active = sort?.column === c;
                return (
                  <th key={c} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                    className="sticky top-0 z-10 whitespace-nowrap border-b border-line bg-panel-2 px-3 py-2 font-medium">
                    <button onClick={() => setSort((s) => nextSort(s, c))} title={`Sort by ${c}`} className="group flex items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                      <span className="font-mono text-fg">{c}</span>
                      {meta?.pk?.includes(c) && <PKBadge />}
                      {meta?.fks?.[c] && <FKBadge to={meta.fks[c]} />}
                      <span className={cn("text-fg-mute", active ? "text-accent opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
                        {active && sort!.dir === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
                      </span>
                    </button>
                    {meta?.types?.[c] && <div className="text-[10px] font-normal text-fg-mute">{meta.types[c]}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((r, i) => (
              <tr key={pg.from + i} className="group">
                <td className="sticky left-0 border-b border-line/60 bg-panel px-3 py-1.5 text-right text-[11px] tabular-nums text-fg-mute group-hover:bg-panel-2">{fmtInt(pg.from + i)}</td>
                {columns.map((c) => <Cell key={c} v={r[c]} />)}
              </tr>
            ))}
          </tbody>
        </table>
        {pg.total === 0 && (
          <div className="px-6 py-10 text-center text-sm text-fg-mute">
            No rows match. <button className="text-accent hover:underline" onClick={() => { setSearch(""); setFilters([]); }}>Clear search and filters</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-fg-mute">
        <span aria-live="polite">
          {pg.total === 0 ? "0 rows" : `Showing ${fmtInt(pg.from)}–${fmtInt(pg.to)} of ${fmtInt(pg.total)}`}
          {narrowed && ` (filtered from ${fmtInt(rows.length)})`} · {columns.length}/{allColumns.length} columns
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">Rows
            <Select aria-label="Rows per page" value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 w-20 py-0 text-xs">
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </label>
          <div className="flex items-center gap-1">
            <Pager label="First page" disabled={pg.page <= 1} onClick={() => setPage(1)}><ChevronsLeft className="size-4" /></Pager>
            <Pager label="Previous page" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)}><ChevronLeft className="size-4" /></Pager>
            <span className="px-2 tabular-nums text-fg-dim">Page {pg.page} of {pg.pages}</span>
            <Pager label="Next page" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)}><ChevronRight className="size-4" /></Pager>
            <Pager label="Last page" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.pages)}><ChevronsRight className="size-4" /></Pager>
          </div>
        </div>
      </div>
    </div>
  );
}

const Pager = ({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) => (
  <button aria-label={label} disabled={disabled} onClick={onClick}
    className="flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-fg-dim outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40">{children}</button>
);

function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "")
    return <td className="border-b border-line/60 px-3 py-1.5 text-xs italic text-fg-mute/70">null</td>;
  const text = cellText(v);
  return (
    <td title={text.length > 32 ? text : undefined}
      className={cn("max-w-[18rem] truncate whitespace-nowrap border-b border-line/60 px-3 py-1.5 text-fg-dim group-hover:bg-panel-2/50",
        typeof v === "number" && "text-right tabular-nums text-fg", typeof v === "boolean" && "text-sky-300")}>{text}</td>
  );
}

const triggerBtn = (open: boolean, active?: boolean) => cn(
  "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
  open || active ? "border-accent/50 bg-accent/10 text-accent-soft" : "border-line-strong bg-panel-2 text-fg-dim hover:text-fg");

function FilterPopover({ columns, onAdd, count }: { columns: string[]; onAdd: (f: Filter) => void; count: number }) {
  const [column, setColumn] = useState(columns[0] ?? "");
  const [op, setOp] = useState<FilterOp>("contains");
  const [value, setValue] = useState("");
  useEffect(() => { if (!columns.includes(column)) setColumn(columns[0] ?? ""); }, [columns, column]);
  return (
    <Popover label="Add a filter" trigger={(open) => <span className={triggerBtn(open, count > 0)}><FilterIcon className="size-4" />Filter{count > 0 && <Badge tone="accent">{count}</Badge>}</span>}
      panelClassName="w-72">
      {(close) => (
        <form className="space-y-2.5" onSubmit={(e) => {
          e.preventDefault();
          if (needsValue(op) && !value.trim()) return;
          onAdd({ id: `${Date.now()}-${Math.random()}`, column, op, value: value.trim() });
          setValue(""); close();
        }}>
          <Select aria-label="Column" value={column} onChange={(e) => setColumn(e.target.value)}>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <Select aria-label="Condition" value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
            {(Object.keys(FILTER_LABEL) as FilterOp[]).map((o) => <option key={o} value={o}>{FILTER_LABEL[o]}</option>)}
          </Select>
          {needsValue(op) && <Input aria-label="Value" placeholder="Value" value={value} autoFocus onChange={(e) => setValue(e.target.value)} />}
          <Button type="submit" size="sm" variant="primary" className="w-full" disabled={needsValue(op) && !value.trim()}>Add filter</Button>
        </form>
      )}
    </Popover>
  );
}

function ColumnsPopover({ columns, hidden, onChange }: { columns: string[]; hidden: Set<string>; onChange: (s: Set<string>) => void }) {
  return (
    <Popover label="Choose visible columns" trigger={(open) => <span className={triggerBtn(open, hidden.size > 0)}><Columns3 className="size-4" />Columns{hidden.size > 0 && <Badge tone="accent">{columns.length - hidden.size}/{columns.length}</Badge>}</span>}
      panelClassName="w-60">
      {() => (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold uppercase tracking-wider text-fg-mute">Columns</span>
            <button className="text-accent hover:underline" onClick={() => onChange(new Set())}>Show all</button></div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {columns.map((c) => (
              <li key={c}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg-dim hover:bg-panel-2">
                  <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={!hidden.has(c)} disabled={!hidden.has(c) && hidden.size >= columns.length - 1}
                    onChange={(e) => { const n = new Set(hidden); if (e.target.checked) n.delete(c); else n.add(c); onChange(n); }} />
                  <span className="truncate font-mono text-[12.5px]">{c}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}
