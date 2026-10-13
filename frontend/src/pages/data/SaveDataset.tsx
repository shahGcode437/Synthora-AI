import { Save } from "lucide-react";
import { useState } from "react";
import { datasets, schemas } from "../../api/accounts";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ACCOUNTS_ENABLED } from "../../auth/config";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { Button, Callout, Input, Label } from "../../components/ui";
import { fmtInt } from "../../lib/format";
import { useRouter } from "../../router";
import { useApp } from "../../state/AppContext";

/** Saves the session's generated dataset to the account (explicit action: rows are never stored automatically). */
export function SaveDatasetButton({ size = "sm", variant = "secondary" }: { size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const { ws } = useApp();
  const { status } = useAuth();
  const { go, path, search } = useRouter();
  const toast = useToast();
  const result = ws.state.result, plan = ws.state.plan;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!result || !plan) return null;

  const click = () => {
    if (status !== "authed") { go(`/login?next=${encodeURIComponent(path + search)}`); return; }
    setName(`${plan.domain} · ${new Date().toLocaleDateString()}`); setError(null); setOpen(true);
  };
  const save = async () => {
    if (!name.trim()) { setError("Give the dataset a name."); return; }
    setBusy(true); setError(null);
    try {
      await datasets.create({ name: name.trim(), data: result.data, plan, validation: result.validation, seed: result.metadata.seed, source_mode: plan.source_mode });
      setSaved(true); setOpen(false); toast.push("success", "Dataset saved", `${fmtInt(result.metadata.rows_generated)} rows in your Datasets.`);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save the dataset."); }
    finally { setBusy(false); }
  };

  if (!ACCOUNTS_ENABLED) return null;
  return (
    <>
      <Button size={size} variant={variant} icon={<Save className="size-3.5" />} onClick={click} disabled={saved}>{saved ? "Saved" : status === "authed" ? "Save dataset" : "Sign in to save"}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save this dataset" busy={busy} size="sm"
        description="Keeps the generated rows in your account so you can reopen, explore and export them later."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save dataset</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3">
          <div><Label htmlFor="ds-name">Name</Label><Input id="ds-name" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
          <p className="text-xs text-fg-mute">{fmtInt(result.metadata.rows_generated)} rows · {result.metadata.tables_generated} table{result.metadata.tables_generated === 1 ? "" : "s"}. Large datasets may exceed your storage limit.</p>
          {error && <Callout tone="error">{error}</Callout>}
        </form>
      </Dialog>
    </>
  );
}

/** Saves the session's current plan as a reusable schema. */
export function SaveSchemaButton({ size = "sm", variant = "secondary" }: { size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const { ws } = useApp();
  const { status } = useAuth();
  const { go, path, search } = useRouter();
  const toast = useToast();
  const plan = ws.state.plan;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!plan) return null;

  const click = () => {
    if (status !== "authed") { go(`/login?next=${encodeURIComponent(path + search)}`); return; }
    setName(`${plan.domain} schema`); setError(null); setOpen(true);
  };
  const save = async () => {
    if (!name.trim()) { setError("Give the schema a name."); return; }
    setBusy(true); setError(null);
    try { await schemas.create({ name: name.trim(), plan }); setSaved(true); setOpen(false); toast.push("success", "Schema saved", "Find it under Schemas."); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not save the schema."); }
    finally { setBusy(false); }
  };
  if (!ACCOUNTS_ENABLED) return null;
  return (
    <>
      <Button size={size} variant={variant} icon={<Save className="size-3.5" />} onClick={click} disabled={saved}>{saved ? "Schema saved" : status === "authed" ? "Save as schema" : "Sign in to save"}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save as schema" busy={busy} size="sm"
        description="Saves this Generation Plan, including your row-count edits. You can reload it later and generate again without any AI call."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save schema</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3">
          <div><Label htmlFor="sc-name">Name</Label><Input id="sc-name" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
          {error && <Callout tone="error">{error}</Callout>}
        </form>
      </Dialog>
    </>
  );
}
