import { Database, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Callout, Select } from "../../components/ui";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, type Crumb } from "../../components/page";
import { fmtInt } from "../../lib/format";
import { Link } from "../../router";
import type { ActiveDataset } from "./useActiveDataset";
import { useActiveDataset } from "./useActiveDataset";

type Ctl = ReturnType<typeof useActiveDataset>;

/** Shared frame for the three data views: header, dataset picker, and honest loading / empty / error states. */
export function DataModule({ title, description, crumbs, ctl, actions, children }: {
  title: string; description: string; crumbs: Crumb[]; ctl: Ctl; actions?: ReactNode; children: (d: ActiveDataset) => ReactNode;
}) {
  const { active, loading, error, selected, saved, sessionAvailable } = ctl;
  const options = [
    ...(sessionAvailable ? [{ value: "session", label: "Current session (just generated)" }] : []),
    ...saved.map((d) => ({ value: d.id, label: `${d.name} · ${fmtInt(d.total_rows)} rows · saved` })),
  ];
  const picker = options.length > 1 || (selected !== "session" && options.length > 0) ? (
    <label className="flex items-center gap-2 text-xs text-fg-mute">Dataset
      <Select aria-label="Dataset" className="h-9 w-64 text-sm" value={options.some((o) => o.value === selected) ? selected : options[0]?.value} onChange={(e) => ctl.select(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </label>
  ) : null;

  let body: ReactNode;
  if (loading) {
    body = <ListSkeleton rows={3} />;
  } else if (error) {
    body = <ErrorState message={error} onRetry={ctl.retry} />;
  } else if (!active) {
    body = (
      <EmptyState icon={<Database className="size-5" />} title="No data to show yet"
        action={<>
          <Link to="/app/input" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-canvas hover:bg-accent-soft"><Sparkles className="size-4" />Open the generator</Link>
          <Link to="/app/datasets" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-panel-2">Saved datasets</Link>
        </>}>
        Generate a dataset in the Data Generator, or open one you saved earlier. It appears here as soon as it exists.
      </EmptyState>
    );
  } else {
    body = (
      <>
        {active.id !== "session" && <Callout tone="info" title={`Saved dataset: ${active.name}`}>Showing the rows saved in this browser's workspace.</Callout>}
        {children(active)}
      </>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader crumbs={crumbs} title={title} description={description} actions={<>{picker}{actions}</>} />
      {body}
    </div>
  );
}
