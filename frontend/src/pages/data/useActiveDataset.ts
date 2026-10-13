import { useCallback, useEffect, useMemo, useState } from "react";
import { datasets as datasetsApi, type DatasetSummary } from "../../api/accounts";
import { ApiError } from "../../api/client";
import type { GeneratedData, GenerationPlan, ValidationReport } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { useRouter } from "../../router";
import { useApp } from "../../state/AppContext";

export interface ActiveDataset {
  id: "session" | string;
  name: string;
  data: GeneratedData;
  plan: GenerationPlan | null;
  /** Only the current session has the full validation report; saved datasets keep a three-number summary. */
  validation: ValidationReport | null;
  savedValidation: DatasetSummary["validation"];
  seed: number | null;
}

/**
 * The dataset the Tabular / Relational / Document modules show: the generated data of this session, or a saved dataset
 * chosen with ?dataset=<id>. Everything shown downstream is computed from these real rows.
 */
export function useActiveDataset() {
  const { ws } = useApp();
  const { status } = useAuth();
  const { path, go, params } = useRouter();
  const selected = params.get("dataset") ?? "session";
  const [saved, setSaved] = useState<DatasetSummary[]>([]);
  const [remote, setRemote] = useState<ActiveDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (status !== "authed") { setSaved([]); return; }
    let live = true;
    datasetsApi.list().then((l) => live && setSaved(l)).catch(() => live && setSaved([]));
    return () => { live = false; };
  }, [status]);

  useEffect(() => {
    if (selected === "session") { setRemote(null); setError(null); setLoading(false); return; }
    if (status !== "authed") { setLoading(false); return; }
    let live = true;
    setLoading(true); setError(null);
    Promise.all([datasetsApi.get(selected), datasetsApi.data(selected)]).then(([meta, data]) => {
      if (!live) return;
      setRemote({ id: meta.id, name: meta.name, data, plan: meta.plan, validation: null, savedValidation: meta.validation, seed: meta.seed });
    }).catch((e) => {
      if (live) setError(e instanceof ApiError && e.status === 404 ? "That dataset no longer exists." : e instanceof Error ? e.message : "Could not load the dataset.");
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [selected, status, reload]);

  const session = ws.state.result;
  const sessionDataset = useMemo<ActiveDataset | null>(() => session && ws.state.plan ? {
    id: "session", name: ws.state.plan.domain, data: session.data, plan: ws.state.plan, validation: session.validation, savedValidation: null, seed: session.metadata.seed,
  } : null, [session, ws.state.plan]);

  const active = selected === "session" ? sessionDataset : remote;
  const select = useCallback((id: string) => go(id === "session" ? path : `${path}?dataset=${id}`), [go, path]);

  return {
    active, selected, saved, loading, error, select, retry: () => setReload((n) => n + 1),
    sessionAvailable: !!sessionDataset, signedIn: status === "authed", authLoading: status === "loading",
  };
}
