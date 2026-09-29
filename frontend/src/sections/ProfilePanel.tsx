import { CalendarRange, Fingerprint, Hash, KeyRound, ListTree, Rows3, ShieldAlert, Type } from "lucide-react";
import type { ReactNode } from "react";
import type { ColumnProfile, DatasetProfile } from "../api/types";
import { Badge, Bar, Callout, Card, CardHeader, Collapsible, Mono, StatCard } from "../components/ui";
import { fmtInt, fmtNum } from "../lib/format";

const DTYPE_TONE = { string: "neutral", integer: "indigo", float: "indigo", boolean: "sky", date: "violet", datetime: "violet" } as const;

function ChipList({ icon, label, items, tone }: { icon: ReactNode; label: string; items: string[]; tone: "accent" | "sky" | "indigo" | "violet" | "danger" }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 flex w-36 shrink-0 items-center gap-2 text-xs text-fg-mute">{icon}{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? items.map((n) => <Badge key={n} tone={tone}>{n}</Badge>) : <span className="text-xs text-fg-mute/70">none detected</span>}
      </div>
    </div>
  );
}

export function ProfilePanel({ profile, warnings }: { profile: DatasetProfile; warnings: string[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<Rows3 className="size-4" />} title="Source profile"
          subtitle={`Computed locally from your CSV · table “${profile.table_name}” · delimiter ${profile.delimiter === "\t" ? "tab" : `“${profile.delimiter}”`}`} />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <StatCard label="Source rows" value={fmtInt(profile.total_rows)} />
          <StatCard label="Columns" value={profile.total_columns} />
          <StatCard label="PII columns" value={profile.likely_pii.length} tone={profile.likely_pii.length ? "warning" : undefined} hint="detected locally" />
        </div>
        <div className="divide-y divide-line border-t border-line px-5 py-2">
          <ChipList icon={<KeyRound className="size-3.5" />} label="Identifiers" items={profile.likely_identifiers} tone="accent" />
          <ChipList icon={<ListTree className="size-3.5" />} label="Categorical" items={profile.likely_categorical} tone="sky" />
          <ChipList icon={<Hash className="size-3.5" />} label="Numeric" items={profile.likely_numeric} tone="indigo" />
          <ChipList icon={<CalendarRange className="size-3.5" />} label="Dates" items={profile.likely_date} tone="violet" />
          <ChipList icon={<ShieldAlert className="size-3.5" />} label="PII" items={profile.likely_pii} tone="danger" />
        </div>
      </Card>

      {warnings.length > 0 && (
        <Callout tone="warning" title="Profile notes">
          <ul className="list-inside list-disc">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Callout>
      )}

      <div>
        <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-fg-mute">Column details</div>
        <div className="grid gap-3 xl:grid-cols-2 [&>*]:min-w-0">
          {profile.columns.map((c) => <ColumnCard key={c.name} c={c} />)}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-panel-2 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-fg-mute">{k}</div>
      <div className="text-[13px] font-medium tabular-nums text-fg">{v}</div>
    </div>
  );
}

function ColumnCard({ c }: { c: ColumnProfile }) {
  const cats = c.top_values.slice(0, 6);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium text-fg">{c.name}</span>
        <Badge tone={DTYPE_TONE[c.dtype]} icon={<Type className="size-3" />}>{c.dtype}</Badge>
        {c.is_identifier && <Badge tone="accent" icon={<KeyRound className="size-3" />}>identifier</Badge>}
        {c.id_repeat && <Badge tone="accent" title={`${c.id_repeat.unique} unique ids, ~${c.id_repeat.avg_rows_per_id} rows each`}>repeating id</Badge>}
        {c.is_categorical && <Badge tone="sky">categorical</Badge>}
        {c.pii_hint && <Badge tone="danger" icon={<Fingerprint className="size-3" />} title={c.pii_hint}>PII</Badge>}
        {c.candidate_primary_key && !c.is_identifier && <Badge tone="warning">unique</Badge>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-fg-mute"><span>Nulls</span><span className="tabular-nums text-fg-dim">{c.null_pct}% · {fmtInt(c.null_count)}</span></div>
          <Bar pct={c.null_pct} tone="amber" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-fg-mute"><span>Unique</span><span className="tabular-nums text-fg-dim">{(c.unique_ratio * 100).toFixed(0)}% · {fmtInt(c.unique_count)}</span></div>
          <Bar pct={c.unique_ratio * 100} />
        </div>
      </div>

      {c.sample_values.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-fg-mute">{c.pii_hint || c.is_identifier || c.id_repeat ? "Shape (masked)" : "Samples"}</span>
          {c.sample_values.slice(0, 4).map((v, i) => <Mono key={i} className="max-w-[10rem] truncate">{v}</Mono>)}
        </div>
      )}

      {c.is_numeric && c.min != null && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          <Stat k="Min" v={fmtNum(c.min)} /><Stat k="Max" v={fmtNum(c.max)} />
          <Stat k="Mean" v={fmtNum(c.mean)} /><Stat k="Median" v={fmtNum(c.median)} />
          <Stat k="Std" v={fmtNum(c.std)} />
          <Stat k="P5–P95" v={c.quantiles ? `${fmtNum(c.quantiles.p5, 1)}–${fmtNum(c.quantiles.p95, 1)}` : "—"} />
        </div>
      )}

      {c.is_date && c.date_min && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-panel-2 px-3 py-2 text-[13px]">
          <CalendarRange className="size-4 text-violet-300" />
          <span className="font-mono text-fg">{c.date_min.replace("T", " ")}</span>
          <span className="text-fg-mute">→</span>
          <span className="font-mono text-fg">{c.date_max?.replace("T", " ")}</span>
        </div>
      )}

      {cats.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {cats.map((v) => (
            <div key={v.value} className="grid grid-cols-[minmax(0,7rem)_1fr_3rem] items-center gap-2 text-xs">
              <span className="truncate text-fg-dim" title={v.value}>{v.value}</span>
              <Bar pct={v.pct} tone="sky" />
              <span className="text-right tabular-nums text-fg-mute">{v.pct.toFixed(1)}%</span>
            </div>
          ))}
          {c.top_values.length > cats.length && (
            <Collapsible title={`${c.top_values.length - cats.length} more values`}>
              <div className="space-y-1.5">
                {c.top_values.slice(cats.length).map((v) => (
                  <div key={v.value} className="grid grid-cols-[minmax(0,7rem)_1fr_3rem] items-center gap-2 text-xs">
                    <span className="truncate text-fg-dim">{v.value}</span><Bar pct={v.pct} tone="sky" />
                    <span className="text-right tabular-nums text-fg-mute">{v.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}
        </div>
      )}
      {c.str_len && !c.is_categorical && (
        <div className="mt-3 text-[11px] text-fg-mute">Length {c.str_len.min}–{c.str_len.max} chars · avg {c.str_len.mean}</div>
      )}
    </Card>
  );
}
