export const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

export const fmtPct = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const humanize = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : NaN;
}

export function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
