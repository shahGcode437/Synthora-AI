import { ArrowRight, Check, Eye, EyeOff, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { GoogleButton } from "../auth/GoogleButton";
import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/Logo";
import { useToast } from "../components/Toast";
import { Button, Callout, Input, Label } from "../components/ui";
import { cn } from "../lib/cn";
import { passwordRules, passwordStrength, validEmail } from "../lib/password";
import { Link, Redirect, safeNext, useRouter } from "../router";

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="landing-bg grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <Link to="/" className="flex items-center gap-3" aria-label="Synthora AI home">
          <Logo className="size-10" /><span className="text-lg font-semibold tracking-tight">Synthora <span className="text-accent">AI</span></span>
        </Link>
        <div className="relative max-w-md">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-xs text-accent-soft"><Sparkles className="size-3.5" /> Your datasets, your workspace</div>
          <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight">Where data takes shape, systems come to life.</h2>
          <ul className="mt-8 space-y-3 text-sm text-fg-dim">
            {["Keep every generation in your history", "Save schemas and reuse them with no AI call", "Store datasets you want to come back to", "Your preferences follow you across devices"].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><Check className="size-4 text-accent" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-xs text-fg-mute"><ShieldCheck className="size-3.5" /> Passwords are hashed with Argon2id. We never see or store them in plain text.</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md animate-fade-up">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="Synthora AI home"><Logo className="size-9" /><span className="font-semibold">Synthora <span className="text-accent">AI</span></span></Link>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-fg-dim">{subtitle}</p>
          <div className="mt-8 space-y-5">{children}</div>
          <div className="mt-8 text-center text-sm text-fg-dim">{footer}</div>
          <div className="mt-6 text-center"><Link to="/app" className="text-xs text-fg-mute hover:text-fg-dim">Continue without an account <ArrowRight className="inline size-3" /></Link></div>
        </div>
      </main>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, invalid, hint, onBlur }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; hint?: ReactNode; onBlur?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label htmlFor={id} hint={hint}>{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} value={value} autoComplete={autoComplete} invalid={invalid}
          maxLength={128} className="pr-11" onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-invalid={invalid || undefined} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-mute transition-colors hover:text-fg">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

const Divider = () => (
  <div className="flex items-center gap-3 text-xs text-fg-mute"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
);

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.isNetwork) return "Can't reach the server. If it was idle it may be waking up: wait a few seconds and try again.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

// ------------------------------------------------------------------ login
export function LoginPage() {
  const { status, login, loginWithGoogle, expired } = useAuth();
  const { go, params } = useRouter();
  const toast = useToast();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => { document.title = "Sign in · Synthora AI"; }, []);
  if (status === "authed") return <Redirect to={next} />;

  const emailBad = touched && !validEmail(email);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!validEmail(email) || !password) return;
    setBusy(true); setError(null);
    try { await login(email.trim(), password); toast.push("success", "Signed in"); go(next, true); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const google = async (credential: string) => {
    setBusy(true); setError(null);
    try { await loginWithGoogle(credential); toast.push("success", "Signed in with Google"); go(next, true); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to see your history, schemas and datasets."
      footer={<>New to Synthora? <Link to={`/signup${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent hover:underline">Create an account</Link></>}>
      {(expired || params.get("expired")) && !error && <Callout tone="info" title="Your session ended">Please sign in again to continue.</Callout>}
      {error && <Callout tone="error" title="Couldn't sign you in">{error}</Callout>}
      <GoogleButton mode="signin" onCredential={google} disabled={busy} />
      <Divider />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} invalid={emailBad} maxLength={254}
            onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={emailBad || undefined} aria-describedby={emailBad ? "email-err" : undefined} />
          {emailBad && <p id="email-err" className="mt-1 text-xs text-rose-300">Enter a valid email address.</p>}
        </div>
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={busy}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}

// ------------------------------------------------------------------ signup
export function SignupPage() {
  const { status, signup, loginWithGoogle } = useAuth();
  const { go, params } = useRouter();
  const toast = useToast();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ email?: string }>({});
  const [touched, setTouched] = useState({ name: false, email: false, confirm: false });

  useEffect(() => { document.title = "Create account · Synthora AI"; }, []);
  if (status === "authed") return <Redirect to={next} />;

  const rules = passwordRules(password, email, name);
  const strength = passwordStrength(password, email, name);
  const problems = {
    name: !name.trim() ? "Enter your name." : name.trim().length > 80 ? "Use at most 80 characters." : "",
    email: !validEmail(email) ? "Enter a valid email address." : fieldError.email ?? "",
    confirm: confirm !== password ? "Passwords don't match." : "",
  };
  const canSubmit = !problems.name && !problems.email && !problems.confirm && rules.every((r) => r.ok);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, confirm: true });
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try { await signup(name.trim(), email.trim(), password); toast.push("success", "Welcome to Synthora AI", "Your account is ready."); go(next, true); }
    catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") setFieldError({ email: err.message });
      else setError(errorText(err));
    } finally { setBusy(false); }
  };
  const google = async (credential: string) => {
    setBusy(true); setError(null);
    try { await loginWithGoogle(credential); toast.push("success", "Signed in with Google"); go(next, true); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  const bar = ["bg-rose-400", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-400"][strength.score];
  return (
    <AuthLayout title="Create your account" subtitle="Save your work and pick up where you left off."
      footer={<>Already have an account? <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent hover:underline">Sign in</Link></>}>
      {error && <Callout tone="error" title="Couldn't create your account">{error}</Callout>}
      <GoogleButton mode="signup" onCredential={google} disabled={busy} />
      <Divider />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" value={name} maxLength={80} invalid={touched.name && !!problems.name}
            onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))} />
          {touched.name && problems.name && <p className="mt-1 text-xs text-rose-300">{problems.name}</p>}
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} maxLength={254} invalid={touched.email && !!problems.email}
            onChange={(e) => { setEmail(e.target.value); setFieldError({}); }} onBlur={() => setTouched((t) => ({ ...t, email: true }))} />
          {touched.email && problems.email && <p role="alert" className="mt-1 text-xs text-rose-300">{problems.email}</p>}
        </div>
        <div>
          <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="new-password"
            hint={strength.label && <span className={cn(strength.score >= 3 ? "text-emerald-300" : strength.score === 2 ? "text-amber-300" : "text-rose-300")}>{strength.label}</span>} />
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full bg-panel-3 transition-colors", strength.score >= i && bar)} />)}
          </div>
          <ul className="mt-2.5 grid gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
            {rules.map((r) => (
              <li key={r.id} className={cn("flex items-center gap-1.5", r.ok ? "text-emerald-300" : "text-fg-mute")}>
                {r.ok ? <Check className="size-3" /> : <X className="size-3" />}{r.label}
              </li>
            ))}
          </ul>
        </div>
        <PasswordField id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password"
          invalid={touched.confirm && !!problems.confirm} onBlur={() => setTouched((t) => ({ ...t, confirm: true }))} />
        {touched.confirm && problems.confirm && <p className="-mt-2 text-xs text-rose-300">{problems.confirm}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
