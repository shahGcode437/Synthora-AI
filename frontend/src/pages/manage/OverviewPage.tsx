import { Database, History, PlayCircle, Shapes, Sparkles } from "lucide-react";
import { history as api } from "../../api/library";
import { PageHeader, LocalStorageNote } from "../../components/page";
import { Badge, Button, Callout, Card, CardHeader, Skeleton, StatCard } from "../../components/ui";
import { fmtInt } from "../../lib/format";
import { useAsync } from "../../lib/useAsync";
import { Link, useRouter } from "../../router";
import { useApp } from "../../state/AppContext";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function OverviewPage() {
  const { go } = useRouter();
  const { ws } = useApp();
  const ov = useAsync(() => api.overview(), []);
  const hasSession = !!ws.state.plan || !!ws.state.result;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Workspace" title="Overview"
        description="Your activity in this browser's workspace: generations, saved schemas and saved datasets."
        actions={<Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => go("/app/input")}>{hasSession ? "Continue generating" : "New generation"}</Button>} />

      {hasSession && (
        <Callout tone="info" title="A generation is in progress in this session"
          action={<Button size="sm" variant="secondary" onClick={() => go(ws.state.result ? "/app/tabular" : "/app/plan")}>{ws.state.result ? "Open the data" : "Open the plan"}</Button>}>
          {ws.state.result ? "Generated data is ready to explore." : "A plan is ready to review."}
        </Callout>
      )}

      <LocalStorageNote />
      <div className="mt-5">
        {ov.loading && !ov.data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : ov.error ? (
          <Callout tone="warning" title="Activity summary unavailable" action={<Button size="sm" variant="secondary" onClick={ov.reload}>Try again</Button>}>{ov.error}</Callout>
        )
          : ov.data && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Generations" value={fmtInt(ov.data.generations)} icon={<History className="size-4" />} hint={`${ov.data.passed} passed · ${ov.data.failed} failed`} />
                <StatCard label="Rows generated" value={fmtInt(ov.data.rows_generated)} icon={<PlayCircle className="size-4" />} />
                <StatCard label="Saved schemas" value={fmtInt(ov.data.schemas)} icon={<Shapes className="size-4" />} />
                <StatCard label="Saved datasets" value={fmtInt(ov.data.datasets)} icon={<Database className="size-4" />} />
              </div>
              <Card>
                <CardHeader title="Recent generations" right={<Link to="/app/history" className="text-xs text-accent hover:underline">View all</Link>} />
                {ov.data.recent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-fg-mute">Nothing generated yet.</p> : (
                  <ul className="divide-y divide-line">
                    {ov.data.recent.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                        <span className="capitalize text-fg">{r.domain.replace(/[_-]+/g, " ")} <span className="text-fg-mute">· {r.tables} table{r.tables === 1 ? "" : "s"} · {fmtInt(r.rows)} rows</span></span>
                        <span className="flex items-center gap-2 text-xs text-fg-mute">{when(r.created_at)}<Badge tone={r.validation_passed ? "success" : "danger"}>{r.validation_passed ? "passed" : "failed"}</Badge></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
      </div>
    </div>
  );
}
