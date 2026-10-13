// Pure data-grid logic (search, filter, sort, paginate). Works on the real generated rows held in memory.
export type Row = Record<string, unknown>;
export type FilterOp = "contains" | "equals" | "gt" | "lt" | "empty" | "notempty";
export interface Filter { id: string; column: string; op: FilterOp; value: string }
export interface SortState { column: string; dir: "asc" | "desc" }

export const FILTER_LABEL: Record<FilterOp, string> = {
  contains: "contains", equals: "equals", gt: "greater than", lt: "less than", empty: "is empty", notempty: "is not empty",
};
export const needsValue = (op: FilterOp) => op !== "empty" && op !== "notempty";

export const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

export function cellText(v: unknown): string {
  if (isEmpty(v)) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function matchesFilter(row: Row, f: Filter): boolean {
  const v = row[f.column];
  switch (f.op) {
    case "empty": return isEmpty(v);
    case "notempty": return !isEmpty(v);
    case "contains": return cellText(v).toLowerCase().includes(f.value.toLowerCase());
    case "equals": return cellText(v).toLowerCase() === f.value.trim().toLowerCase();
    case "gt":
    case "lt": {
      if (isEmpty(v)) return false;
      const a = typeof v === "number" ? v : Number(v);
      const b = Number(f.value);
      if (!Number.isNaN(a) && !Number.isNaN(b) && f.value.trim() !== "") return f.op === "gt" ? a > b : a < b;
      return f.op === "gt" ? cellText(v) > f.value : cellText(v) < f.value; // ISO dates and plain text compare lexically
    }
  }
}

export function filterRows(rows: Row[], opts: { search?: string; columns: string[]; filters?: Filter[] }): Row[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  const filters = (opts.filters ?? []).filter((f) => !needsValue(f.op) || f.value.trim() !== "");
  if (!q && !filters.length) return rows;
  return rows.filter((r) => filters.every((f) => matchesFilter(r, f))
    && (!q || opts.columns.some((c) => cellText(r[c]).toLowerCase().includes(q))));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Stable sort; empty values always last; numbers compare numerically, everything else naturally. */
export function sortRows(rows: Row[], sort: SortState | null): Row[] {
  if (!sort) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return rows.map((r, i) => [r, i] as const).sort(([a, ia], [b, ib]) => {
    const x = a[sort.column], y = b[sort.column];
    if (isEmpty(x) || isEmpty(y)) return isEmpty(x) && isEmpty(y) ? ia - ib : isEmpty(x) ? 1 : -1; // not reversed by dir
    const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(cellText(x), cellText(y));
    return c !== 0 ? c * dir : ia - ib;
  }).map(([r]) => r);
}

export function nextSort(current: SortState | null, column: string): SortState | null {
  if (!current || current.column !== column) return { column, dir: "asc" };
  return current.dir === "asc" ? { column, dir: "desc" } : null;
}

export interface Page { slice: Row[]; total: number; pages: number; page: number; from: number; to: number }

export function paginate(rows: Row[], page: number, size: number): Page {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  const slice = rows.slice(start, start + size);
  return { slice, total: rows.length, pages, page: p, from: rows.length ? start + 1 : 0, to: start + slice.length };
}

export function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows.slice(0, 200)) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}
