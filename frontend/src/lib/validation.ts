import type { CheckResult, CheckStatus, ValidationReport } from "../api/types";

export const RANK: Record<CheckStatus, number> = { error: 3, warning: 2, passed: 1, skipped: 0 };

export function worst(checks: CheckResult[]): CheckStatus {
  return checks.reduce<CheckStatus>((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), "skipped");
}

interface Category { title: string; match: (name: string) => boolean }
export const VALIDATION_CATEGORIES: Category[] = [
  { title: "Primary key uniqueness", match: (n) => n === "primary_key_unique" || n === "unique_columns" },
  { title: "Foreign key integrity", match: (n) => n === "foreign_keys" },
  { title: "Null constraints", match: (n) => n === "null_constraints" },
  { title: "Allowed values", match: (n) => n === "allowed_values" },
  { title: "Row count", match: (n) => n === "row_count" },
  { title: "Derived consistency", match: (n) => n.startsWith("derived:") },
  { title: "Schema & types", match: (n) => ["required_columns", "data_types", "email_format"].includes(n) },
];

export interface ValidationTile {
  title: string;
  checks: CheckResult[];
  status: CheckStatus;
  /** True when the check does not apply (e.g. a single table has no foreign keys). */
  na: boolean;
}

/** One tile per check category that has at least one check, aggregated across all tables. */
export function validationTiles(report: ValidationReport): ValidationTile[] {
  const all = report.tables.flatMap((t) => t.checks);
  return VALIDATION_CATEGORIES.map((cat) => {
    const checks = all.filter((c) => cat.match(c.name));
    const na = checks.length > 0 && checks.every((c) => /^no foreign keys/i.test(c.message));
    return { title: cat.title, checks, status: (na ? "skipped" : worst(checks)) as CheckStatus, na };
  }).filter((t) => t.checks.length > 0);
}

export interface RuleSummary {
  status: CheckStatus;
  total: number;
  checked: number;
  skipped: number;
}

export function ruleSummary(report: ValidationReport): RuleSummary | null {
  if (!report.rules.length) return null;
  const skipped = report.rules.filter((r) => r.status === "skipped").length;
  return {
    status: worst(report.rules.filter((r) => r.status !== "skipped")),
    total: report.rules.length,
    checked: report.rules.length - skipped,
    skipped,
  };
}

/** Real counts of individual checks (tables + rules) by status. */
export function checkCounts(report: ValidationReport) {
  const all = [...report.tables.flatMap((t) => t.checks), ...report.rules];
  const count = (s: CheckStatus) => all.filter((c) => c.status === s).length;
  return { total: all.length, passed: count("passed"), warning: count("warning"), error: count("error"), skipped: count("skipped") };
}
