// Original-vs-synthetic comparison. Pure functions: every number is computed from the source profile
// (facts computed by the backend from the uploaded CSV) and the generated rows. Nothing is estimated
// or scored heuristically, and no raw source values are used (only aggregated statistics/frequencies).
import type { ColumnProfile, DatasetProfile, EdgeCaseApplied, GenerationPlan } from "../api/types";

type Row = Record<string, unknown>;

export const isNull = (v: unknown): boolean => v === null || v === undefined || v === "";

// ------------------------------------------------------------------ numeric helpers
/** Linear-interpolated percentile (same method as numpy's default, used by the backend profiler). */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface NumericStats {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
}

/** Sample statistics (std uses n-1, matching the profiler). Needs at least 2 values. */
export function numericStats(values: number[]): NumericStats | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1);
  return {
    n: v.length, mean, median: percentile(v, 50), min: v[0], max: v[v.length - 1], std: Math.sqrt(variance),
    p5: percentile(v, 5), p25: percentile(v, 25), p75: percentile(v, 75), p95: percentile(v, 95),
  };
}

function profileStats(p: ColumnProfile): NumericStats | null {
  if (p.min == null || p.max == null || p.mean == null || p.median == null) return null;
  const q = p.quantiles;
  return {
    n: p.row_count - p.null_count, mean: p.mean, median: p.median, min: p.min, max: p.max, std: p.std ?? 0,
    p5: q?.p5 ?? p.min, p25: q?.p25 ?? p.min, p75: q?.p75 ?? p.max, p95: q?.p95 ?? p.max,
  };
}

// ------------------------------------------------------------------ result types
export type Gap = "small" | "moderate" | "large";
/** Largest single-category gap in percentage points. Thresholds are display hints, not statistical tests. */
export const gapLevel = (pp: number): Gap => (pp <= 5 ? "small" : pp <= 10 ? "moderate" : "large");

export interface CategoryBar { label: string; orig: number; synth: number; isNew: boolean; isOther: boolean }
export interface CategoricalComparison {
  column: string;
  bars: CategoryBar[];
  totalCategories: number;
  maxGap: number; // percentage points
  maxGapLabel: string;
  newCategories: string[]; // present in synthetic, absent from source (e.g. requested by the user)
  missingCategories: string[]; // in source, absent from synthetic
  nSynthetic: number;
}
export interface NumericComparison {
  column: string;
  orig: NumericStats;
  synth: NumericStats | null;
  reason?: string; // set when synth is null
  outlierInjected: boolean;
}
export interface NullComparison { column: string; orig: number; synth: number; origCount: number; synthCount: number }
export interface DateComparison {
  column: string;
  origMin: string; origMax: string;
  synthMin: string | null; synthMax: string | null;
  withinRange: boolean;
  coveragePct: number | null; // share of the source time span covered by the synthetic span
  reason?: string;
}
export interface SchemaComparison {
  source: string[]; generated: string[]; matched: string[]; missing: string[]; unexpected: string[];
  matchPct: number;
  typeMismatches: { column: string; expected: string; got: string }[];
}
export interface SkippedColumn { column: string; reason: string }

export interface FidelityReport {
  sourceRows: number;
  syntheticRows: number;
  schema: SchemaComparison;
  categorical: CategoricalComparison[];
  numeric: NumericComparison[];
  nulls: NullComparison[];
  dates: DateComparison[];
  skipped: SkippedColumn[];
  comparedColumns: number;
  largestGap: { column: string; label: string; pp: number } | null;
}

// ------------------------------------------------------------------ per-type comparisons
const MAX_BARS = 8;

function compareCategorical(p: ColumnProfile, rows: Row[]): CategoricalComparison | { skip: string } {
  const values = rows.filter((r) => !isNull(r[p.name])).map((r) => String(r[p.name]));
  if (!values.length) return { skip: "All synthetic values are empty." };
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const orig = new Map(p.top_values.map((t) => [t.value, t.pct]));
  const labels = [...new Set([...orig.keys(), ...counts.keys()])];
  const all: CategoryBar[] = labels.map((l) => ({
    label: l, orig: orig.get(l) ?? 0, synth: ((counts.get(l) ?? 0) / values.length) * 100,
    isNew: !orig.has(l), isOther: false,
  })).sort((a, b) => Math.max(b.orig, b.synth) - Math.max(a.orig, a.synth));

  let worstGap = { pp: 0, label: "" };
  for (const b of all) {
    const d = Math.abs(b.orig - b.synth);
    if (d > worstGap.pp) worstGap = { pp: d, label: b.label };
  }
  let bars = all;
  if (all.length > MAX_BARS) {
    const rest = all.slice(MAX_BARS - 1);
    bars = [...all.slice(0, MAX_BARS - 1), {
      label: `Other (${rest.length} more)`, orig: rest.reduce((s, b) => s + b.orig, 0),
      synth: rest.reduce((s, b) => s + b.synth, 0), isNew: false, isOther: true,
    }];
  }
  return {
    column: p.name, bars, totalCategories: all.length, maxGap: worstGap.pp, maxGapLabel: worstGap.label,
    newCategories: all.filter((b) => b.isNew).map((b) => b.label),
    missingCategories: all.filter((b) => b.synth === 0 && b.orig > 0).map((b) => b.label),
    nSynthetic: values.length,
  };
}

function compareNumeric(p: ColumnProfile, rows: Row[], edge: EdgeCaseApplied[]): NumericComparison | { skip: string } {
  const orig = profileStats(p);
  if (!orig) return { skip: "The source has too few numeric values." };
  const nums = rows.map((r) => r[p.name]).filter((v): v is number => typeof v === "number");
  const synth = numericStats(nums);
  return {
    column: p.name, orig, synth,
    reason: synth ? undefined : "Too few numeric values were generated to compare.",
    outlierInjected: edge.some((e) => e.column === p.name && e.kind === "outlier" && e.rows_affected > 0),
  };
}

const toMs = (s: string) => Date.parse(s.trim().replace(" ", "T"));

function compareDate(p: ColumnProfile, rows: Row[]): DateComparison | null {
  if (!p.date_min || !p.date_max) return null;
  const vals = rows.map((r) => r[p.name]).filter((v): v is string => typeof v === "string" && !isNull(v))
    .map((v) => ({ v, t: toMs(v) })).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const oMin = toMs(p.date_min);
  const oMax = toMs(p.date_max);
  if (!vals.length) {
    return { column: p.name, origMin: p.date_min, origMax: p.date_max, synthMin: null, synthMax: null, withinRange: false,
      coveragePct: null, reason: "No parsable synthetic dates." };
  }
  const sMin = vals[0], sMax = vals[vals.length - 1];
  const span = oMax - oMin;
  const overlap = Math.max(0, Math.min(oMax, sMax.t) - Math.max(oMin, sMin.t));
  return {
    column: p.name, origMin: p.date_min, origMax: p.date_max, synthMin: sMin.v, synthMax: sMax.v,
    withinRange: sMin.t >= oMin && sMax.t <= oMax,
    coveragePct: span > 0 ? Math.min(100, (overlap / span) * 100) : null,
  };
}

// ------------------------------------------------------------------ schema
function generatedType(values: unknown[], expected: ColumnProfile["dtype"]): string | null {
  const v = values.filter((x) => !isNull(x));
  if (!v.length) return null; // cannot judge an empty column
  const ok = (() => {
    switch (expected) {
      case "integer": return v.every((x) => typeof x === "number" && Number.isInteger(x));
      case "float": return v.every((x) => typeof x === "number");
      case "boolean": return v.every((x) => typeof x === "boolean" || typeof x === "string");
      case "date": return v.every((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x));
      case "datetime": return v.every((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(x));
      default: return v.every((x) => typeof x === "string");
    }
  })();
  if (ok) return null;
  const t = typeof v[0];
  return t === "string" ? "text" : t;
}

function compareSchema(profile: DatasetProfile, rows: Row[]): SchemaComparison {
  const source = profile.columns.map((c) => c.name);
  const generated = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))];
  const gen = new Set(generated);
  const matched = source.filter((c) => gen.has(c));
  const typeMismatches = matched.flatMap((name) => {
    const p = profile.columns.find((c) => c.name === name)!;
    const got = generatedType(rows.map((r) => r[name]), p.dtype);
    return got ? [{ column: name, expected: p.dtype, got }] : [];
  });
  return {
    source, generated, matched,
    missing: source.filter((c) => !gen.has(c)),
    unexpected: generated.filter((c) => !source.includes(c)),
    matchPct: source.length ? (matched.length / source.length) * 100 : 0,
    typeMismatches,
  };
}

// ------------------------------------------------------------------ entry point
export function compareFidelity(profile: DatasetProfile, rows: Row[], plan: GenerationPlan | null,
  edgeApplied: EdgeCaseApplied[] = []): FidelityReport {
  const planCols = new Map(plan?.tables.flatMap((t) => t.columns).map((c) => [c.name, c]) ?? []);
  const report: FidelityReport = {
    sourceRows: profile.total_rows, syntheticRows: rows.length, schema: compareSchema(profile, rows),
    categorical: [], numeric: [], nulls: [], dates: [], skipped: [], comparedColumns: 0, largestGap: null,
  };
  const compared = new Set<string>();

  for (const p of profile.columns) {
    if (p.null_count === p.row_count) {
      report.skipped.push({ column: p.name, reason: "Empty in the source" });
      report.nulls.push({ column: p.name, orig: 100, origCount: p.null_count,
        synth: rows.length ? (rows.filter((r) => isNull(r[p.name])).length / rows.length) * 100 : 0,
        synthCount: rows.filter((r) => isNull(r[p.name])).length });
      continue;
    }

    // null rates: every column that has nulls on either side
    const synthNulls = rows.filter((r) => isNull(r[p.name])).length;
    const synthPct = rows.length ? (synthNulls / rows.length) * 100 : 0;
    if (p.null_pct > 0 || synthNulls > 0) {
      report.nulls.push({ column: p.name, orig: p.null_pct, synth: synthPct, origCount: p.null_count, synthCount: synthNulls });
      compared.add(p.name);
    }

    // aggregated frequencies of direct identifiers are withheld
    const planned = planCols.get(p.name);
    if (p.pii_hint || planned?.pii.classification === "direct_identifier") {
      report.skipped.push({ column: p.name, reason: "Personal data — not charted" });
      continue;
    }
    if (p.is_identifier || p.id_repeat) {
      report.skipped.push({ column: p.name, reason: "Identifier — regenerated, not comparable" });
      continue;
    }

    if (p.is_categorical && p.top_values.length) {
      const c = compareCategorical(p, rows);
      if ("skip" in c) report.skipped.push({ column: p.name, reason: c.skip });
      else { report.categorical.push(c); compared.add(p.name); }
    } else if (p.is_numeric) {
      const c = compareNumeric(p, rows, edgeApplied);
      if ("skip" in c) report.skipped.push({ column: p.name, reason: c.skip });
      else { report.numeric.push(c); compared.add(p.name); }
    } else if (p.is_date) {
      const c = compareDate(p, rows);
      if (c) { report.dates.push(c); compared.add(p.name); }
      else report.skipped.push({ column: p.name, reason: "No date range in the source" });
    } else {
      report.skipped.push({ column: p.name, reason: p.dtype === "string" ? "Free text / high cardinality" : "No comparable statistics" });
    }
  }

  for (const c of report.categorical) {
    if (!report.largestGap || c.maxGap > report.largestGap.pp) {
      report.largestGap = { column: c.column, label: c.maxGapLabel, pp: c.maxGap };
    }
  }
  report.comparedColumns = compared.size;
  return report;
}
