import { KeyRound, LogOut, MonitorSmartphone, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";
import { auth as api } from "../../api/accounts";
import { useAuth } from "../../auth/AuthContext";
import { ConfirmDialog } from "../../components/Dialog";
import { Avatar, ErrorState, PageHeader } from "../../components/page";
import { useToast } from "../../components/Toast";
import { Badge, Button, Callout, Card, CardHeader, Input, Label } from "../../components/ui";
import { passwordRules } from "../../lib/password";
import { errMsg, useAsync } from "../../lib/useAsync";
import { Link, useRouter } from "../../router";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const device = (ua: string | null) => {
  if (!ua) return "Unknown device";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b} on ${o}` : b;
};

export function ProfilePage() {
  const { status, user, setUser, logout, forget } = useAuth();
  const { go } = useRouter();
  const toast = useToast();
  const authed = status === "authed" && !!user;
  const sessions = useAsync(() => api.sessions(), [authed], authed);

  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameErr, setNameErr] = useState<string | null>(null);

  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [pwBusy, setPwBusy] = useState(false); const [pwErr, setPwErr] = useState<string | null>(null);

  const [delOpen, setDelOpen] = useState(false); const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false); const [delErr, setDelErr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  if (!authed || !user) {
    return <div className="animate-fade-up"><PageHeader title="Profile" /><Callout tone="info" title="Sign in to manage your profile"><Link to="/login?next=/app/profile" className="text-accent underline">Sign in</Link></Callout></div>;
  }

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setNameErr("Enter a name."); return; }
    setSavingName(true); setNameErr(null);
    try { setUser(await api.update({ name: n })); toast.push("success", "Name updated"); }
    catch (err) { setNameErr(errMsg(err)); } finally { setSavingName(false); }
  };

  const rules = passwordRules(next, user.email, user.name);
  const pwReady = rules.every((r) => r.ok) && (!user.has_password || cur.length > 0);
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true); setPwErr(null);
    try {
      await api.changePassword({ ...(user.has_password ? { current_password: cur } : {}), new_password: next });
      setCur(""); setNext(""); setUser({ ...user, has_password: true });
      toast.push("success", user.has_password ? "Password changed" : "Password set", "Your other sessions were signed out.");
      sessions.reload();
    } catch (err) { setPwErr(errMsg(err)); } finally { setPwBusy(false); }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try { await api.revokeSession(id); sessions.setData((l) => (l ?? []).filter((s) => s.id !== id)); toast.push("success", "Session signed out"); }
    catch (err) { toast.push("error", "Couldn't sign that session out", errMsg(err)); } finally { setRevoking(null); }
  };
  const revokeOthers = async () => {
    setRevoking("others");
    try { await api.revokeOthers(); sessions.reload(); toast.push("success", "Other sessions signed out"); }
    catch (err) { toast.push("error", "Couldn't sign out other sessions", errMsg(err)); } finally { setRevoking(null); }
  };

  const googleOnly = !user.has_password;
  const deleteAccount = async () => {
    setDelBusy(true); setDelErr(null);
    try {
      await api.deleteAccount(googleOnly ? { confirm_email: user.email } : { password: delPw });
      forget(); toast.push("success", "Account deleted", "Your data was removed."); go("/", true);
    } catch (err) { setDelErr(errMsg(err)); } finally { setDelBusy(false); }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader crumbs={[{ label: "Account", to: "/app/overview" }, { label: "Profile" }]} title="Profile" description="Your account details, sign-in methods and active sessions."
        actions={<Button variant="secondary" icon={<LogOut className="size-4" />} onClick={async () => { await logout(); go("/"); }}>Sign out</Button>} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<UserRound className="size-4" />} title="Account" />
          <form onSubmit={saveName} className="space-y-4 p-5" noValidate>
            <div className="flex items-center gap-3"><Avatar name={user.name} src={user.avatar_url} className="size-12 text-sm" />
              <div className="min-w-0"><div className="truncate font-medium text-fg">{user.name}</div><div className="truncate text-sm text-fg-mute">{user.email}</div></div></div>
            <div><Label htmlFor="pf-name">Display name</Label><Input id="pf-name" value={name} maxLength={80} invalid={!!nameErr} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              {nameErr && <p role="alert" className="mt-1 text-xs text-rose-300">{nameErr}</p>}</div>
            <div><Label htmlFor="pf-email" hint="cannot be changed">Email</Label><Input id="pf-email" value={user.email} readOnly disabled /></div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {user.has_password && <Badge tone="neutral">Password</Badge>}{user.has_google && <Badge tone="neutral">Google</Badge>}
              {user.email_verified ? <Badge tone="success">Email verified by Google</Badge> : <Badge tone="muted">Email not verified</Badge>}
            </div>
            <p className="text-xs text-fg-mute">Member since {when(user.created_at)}{user.last_login_at && <> · last sign-in {when(user.last_login_at)}</>}</p>
            <Button type="submit" variant="primary" loading={savingName} disabled={name.trim() === user.name}>Save name</Button>
          </form>
        </Card>

        <Card>
          <CardHeader icon={<KeyRound className="size-4" />} title={user.has_password ? "Change password" : "Set a password"} subtitle={user.has_password ? "Changing it signs out your other sessions." : "You signed in with Google. A password lets you also sign in with your email."} />
          <form onSubmit={changePw} className="space-y-4 p-5" noValidate>
            {user.has_password && <div><Label htmlFor="pf-cur">Current password</Label><Input id="pf-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>}
            <div><Label htmlFor="pf-new">New password</Label><Input id="pf-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-describedby="pf-rules" />
              <ul id="pf-rules" className="mt-2 space-y-0.5 text-xs">{rules.map((r) => <li key={r.id} className={r.ok ? "text-emerald-300" : "text-fg-mute"}>{r.ok ? "✓" : "○"} {r.label}</li>)}</ul></div>
            {pwErr && <p role="alert" className="text-sm text-rose-300">{pwErr}</p>}
            <Button type="submit" variant="primary" loading={pwBusy} disabled={!pwReady}>{user.has_password ? "Change password" : "Set password"}</Button>
          </form>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader icon={<MonitorSmartphone className="size-4" />} title="Active sessions" subtitle="Devices currently signed in to your account."
          right={(sessions.data?.length ?? 0) > 1 ? <Button size="sm" variant="secondary" loading={revoking === "others"} onClick={revokeOthers}>Sign out other sessions</Button> : undefined} />
        <div className="p-5">
          {sessions.loading && !sessions.data ? <p className="text-sm text-fg-mute">Loading sessions…</p> : sessions.error ? <ErrorState message={sessions.error} onRetry={sessions.reload} /> : (
            <ul className="divide-y divide-line">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><div className="flex items-center gap-2 text-sm text-fg">{device(s.user_agent)}{s.current && <Badge tone="success">This device</Badge>}</div>
                    <div className="text-xs text-fg-mute">Signed in {when(s.created_at)} · last active {when(s.last_used_at)} · expires {when(s.expires_at)}</div></div>
                  {!s.current && <Button size="sm" variant="ghost" loading={revoking === s.id} onClick={() => revoke(s.id)}>Sign out</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="mt-5 border-rose-500/30">
        <CardHeader icon={<ShieldAlert className="size-4 text-rose-300" />} title="Delete account" subtitle="Permanently removes your account, history, schemas and datasets. This cannot be undone." />
        <div className="p-5"><Button variant="danger" onClick={() => { setDelOpen(true); setDelErr(null); setDelPw(""); }}>Delete my account…</Button></div>
      </Card>

      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={deleteAccount} busy={delBusy} error={delErr} title="Delete your account?"
        description="All of your data will be permanently deleted." confirmLabel="Delete account" confirmText={googleOnly ? "DELETE" : "DELETE"}>
        {!googleOnly && <div className="mb-3"><Label htmlFor="del-pw">Your password</Label><Input id="del-pw" type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" /></div>}
      </ConfirmDialog>
    </div>
  );
}
