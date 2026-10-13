import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { auth as authApi, type AuthResponse, type User } from "../api/accounts";
import { ApiError, onUnauthorized, setCsrfToken } from "../api/client";
import { useRouter } from "../router";
import { ACCOUNTS_ENABLED } from "./config";
import { hasSignedInHint, purgeLegacyToken, setSignedInHint, SIGNED_IN_HINT_KEY } from "./storage";

export type AuthStatus = "loading" | "authed" | "guest";

interface AuthCtx {
  status: AuthStatus;
  user: User | null;
  /** True when the Google client id is configured for this build. */
  googleEnabled: boolean;
  /** Set when a session ended on the server (expired or revoked); cleared on the next sign-in. */
  expired: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  /** Called after the account itself ended (deleted): drops the local session without a server round trip. */
  forget: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { path, go } = useRouter();
  const [status, setStatus] = useState<AuthStatus>(() => { purgeLegacyToken(); return ACCOUNTS_ENABLED && hasSignedInHint() ? "loading" : "guest"; });
  const [user, setUserState] = useState<User | null>(null);
  const [expired, setExpired] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const adopt = useCallback((r: AuthResponse) => {
    setCsrfToken(r.csrf_token);   // memory only; the session itself is an HttpOnly cookie
    setSignedInHint(true);
    setUserState(r.user);
    setStatus("authed");
    setExpired(false);
  }, []);

  const drop = useCallback(() => {
    setCsrfToken(null);
    setSignedInHint(false);
    setUserState(null);
    setStatus("guest");
  }, []);

  // Ask the server who we are. The cookie is invisible to scripts, so this is also how the CSRF token is obtained.
  const restore = useCallback(() => {
    let live = true;
    authApi.session().then((r) => { if (live) adopt(r); })
      .catch((e) => {
        if (!live) return;
        // A 401 means no valid session. A network error keeps the hint: the API may just be asleep.
        if (e instanceof ApiError && e.isNetwork) { setStatus("guest"); return; }
        drop();
      });
    return () => { live = false; };
  }, [adopt, drop]);

  useEffect(() => { if (ACCOUNTS_ENABLED && hasSignedInHint()) return restore(); }, [restore]);

  // Returning to the tab re-checks the session, so one revoked or expired elsewhere is noticed promptly.
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (!ACCOUNTS_ENABLED || !hasSignedInHint() || Date.now() - last < 60_000) return;
      last = Date.now();
      authApi.session().then(adopt).catch((e) => { if (e instanceof ApiError && !e.isNetwork) drop(); });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [adopt, drop]);

  // The server says our token is no longer valid: sign out locally and send the user to sign in again.
  useEffect(() => {
    onUnauthorized(() => {
      drop();
      setExpired(true);
      const here = pathRef.current;
      if (here.startsWith("/app/") && !PUBLIC_APP_PATHS.has(here)) go(`/login?next=${encodeURIComponent(here)}&expired=1`, true);
    });
    return () => onUnauthorized(null);
  }, [drop, go]);

  // Signing out (or in) in another tab applies here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SIGNED_IN_HINT_KEY) return;
      if (!e.newValue) { drop(); return; }
      restore();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [drop, restore]);

  const login = useCallback(async (email: string, password: string) => adopt(await authApi.login({ email, password })), [adopt]);
  const signup = useCallback(async (name: string, email: string, password: string) => adopt(await authApi.signup({ name, email, password })), [adopt]);
  const loginWithGoogle = useCallback(async (credential: string) => adopt(await authApi.google(credential)), [adopt]);
  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* the token may already be invalid: signing out locally is what matters */ }
    drop();
  }, [drop]);

  const value = useMemo<AuthCtx>(() => ({
    status, user, googleEnabled: !!GOOGLE_CLIENT_ID, expired, login, signup, loginWithGoogle, logout,
    setUser: setUserState, forget: drop,
  }), [status, user, expired, login, signup, loginWithGoogle, logout, drop]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** App pages that work without an account (the generator itself). Everything else under /app needs sign-in. */
export const PUBLIC_APP_PATHS = new Set([
  "/app", "/app/overview", "/app/input", "/app/analyze", "/app/plan", "/app/generate", "/app/validate", "/app/quality",
  "/app/export", "/app/tabular", "/app/relational", "/app/documents", "/app/settings", "/app/help", "/app/about",
]);
