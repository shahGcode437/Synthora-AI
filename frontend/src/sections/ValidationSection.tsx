import { AlertTriangle, CheckCircle2, CircleSlash, ShieldCheck, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { CheckResult, CheckStatus, ValidationReport } from "../api/types";
import { STATUS_TONE } from "../components/badges";
import { Badge, Callout, Card, CardHeader, Collapsible, Mono, SectionTitle } from "../components/ui";
import { cn } from "../lib/cn";
import { humanize } from "../lib/format";
import { ruleSummary, validationTiles } from "../lib/validation";

const ICON: Record<CheckStatus, ReactNode> = {
  passed: <CheckCircle2 className="size-4 text-emerald-400" />,
  warning: <AlertTriangle className="size-4 text-amber-400" />,
  error: <XCircle className="size-4 text-rose-400" />,
  skipped: <CircleSlash className="size-4 text-fg-mute" />,
};
const LABEL: Record<CheckStatus, string> = { passed: "Passed", warning: "Warning", error: "Error", skipped: "Skipped" };
const TILE: Record<CheckStatus, string> = {
  passed: "border-emerald-500/25 bg-emerald-500/[0.05]",
  warning: "border-amber-500/30 bg-amber-500/[0.06]",
  error: "border-rose-500/35 bg-rose-500/[0.07]",
  skipped: "border-line bg-panel",
};

function checkLabel(name: string): string {
  const map: Record<string, string> = {
    row_count: "Row count", required_columns: "Required columns", null_constraints: "Null constraints",
    primary_key_unique: "Primary key uniqueness", unique_columns: "Unique columns", foreign_keys: "Foreign key integrity",
    allowed_values: "Allowed values", data_types: "Data types", email_format: "Email format",
  };
  if (name.startsWith("derived:")) return `Derived consistency · ${name.slice(8)}`;
  return map[name] ?? humanize(name);
}

export function ValidationSection({ report }: { report: ValidationReport }) {
  const tiles = validationTiles(report);
  const rules = ruleSummary(report);
  const skippedRules = rules?.skipped ?? 0;
  const ruleStatus: CheckStatus = rules?.status ?? "skipped";
  const overall: CheckStatus = !report.passed ? "error" : report.warning_count ? "warning" : "passed";

  return (
    <section id="sec-validate" className="scroll-mt-32 animate-fade-up space-y-4">
      <SectionTitle eyebrow="Step 5" title="Validation"
        description="Deterministic checks run in code against the generated data — not by the AI." />

      <Callout tone={overall === "error" ? "error" : overall === "warning" ? "warning" : "success"}
        title={overall === "passed" ? "All checks passed" : overall === "warning" ? "Passed with warnings" : "Validation found errors"}>
        {report.error_count} error{report.error_count === 1 ? "" : "s"} · {report.warning_count} warning{report.warning_count === 1 ? "" : "s"} across{" "}
        {report.tables.length} table{report.tables.length === 1 ? "" : "s"}
        {report.rules.length > 0 && <> · {report.rules.length} business rule{report.rules.length === 1 ? "" : "s"} ({skippedRules} not machine-checkable)</>}
      </Callout>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.title} className={cn("rounded-xl border px-4 py-3.5 transition-colors", TILE[t.status])}>
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-fg-mute">
              <span className="truncate">{t.title}</span>{ICON[t.status]}
            </div>
            <div className={cn("mt-1.5 text-lg font-semibold",
              t.status === "passed" && "text-emerald-300", t.status === "warning" && "text-amber-300", t.status === "error" && "text-rose-300", t.status === "skipped" && "text-fg-mute")}>
              {t.na ? "N/A" : LABEL[t.status]}
            </div>
            <div className="text-xs text-fg-mute">{t.na ? "not applicable here" : `${t.checks.length} check${t.checks.length > 1 ? "s" : ""}`}</div>
          </div>
        ))}
        {report.rules.length > 0 && (
          <div className={cn("rounded-xl border px-4 py-3.5", TILE[ruleStatus])}>
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-fg-mute"><span>Business rules</span>{ICON[ruleStatus]}</div>
            <div className={cn("mt-1.5 text-lg font-semibold", ruleStatus === "passed" ? "text-emerald-300" : ruleStatus === "error" ? "text-rose-300" : ruleStatus === "warning" ? "text-amber-300" : "text-fg-mute")}>
              {ruleStatus === "skipped" ? "Skipped" : LABEL[ruleStatus]}
            </div>
            <div className="text-xs text-fg-mute">{report.rules.length - skippedRules} checked · {skippedRules} skipped</div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {report.tables.map((t) => (
          <Card key={t.table}>
            <CardHeader title={<span className="font-mono">{t.table}</span>} subtitle={`${t.rows.toLocaleString()} rows`}
              right={<Badge tone={t.passed ? "success" : "danger"}>{t.passed ? "Passed" : "Failed"}</Badge>} />
            <ul className="divide-y divide-line/70">
              {t.checks.map((c) => <CheckRow key={c.name} c={c} />)}
            </ul>
          </Card>
        ))}
      </div>

      {report.rules.length > 0 && (
        <Card>
          <CardHeader icon={<ShieldCheck className="size-4" />} title="Business rules"
            subtitle="Machine-checkable rules are verified; free-form rules are reported, not enforced" />
          <ul className="divide-y divide-line/70">
            {report.rules.map((r) => <CheckRow key={r.name} c={r} mono />)}
          </ul>
        </Card>
      )}
    </section>
  );
}

function CheckRow({ c, mono }: { c: CheckResult; mono?: boolean }) {
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ICON[c.status]}
        <span className={cn("text-sm font-medium text-fg", mono && "font-mono")}>{mono ? c.name : checkLabel(c.name)}</span>
        <Badge tone={STATUS_TONE[c.status]}>{LABEL[c.status]}</Badge>
        <span className="min-w-0 flex-1 text-[13px] text-fg-dim">{c.message}</span>
        {c.count != null && <Badge tone={c.status === "error" ? "danger" : "warning"}>{c.count} affected</Badge>}
      </div>
      {c.examples.length > 0 && (
        <Collapsible className="ml-7" title="Examples" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">{c.examples.map((e, i) => <Mono key={i}>{e}</Mono>)}</div>
        </Collapsible>
      )}
    </li>
  );
}
