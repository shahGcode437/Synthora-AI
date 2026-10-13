import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "./AuthContext";

// Google Identity Services: Google renders the button and returns a signed ID token (credential).
// The token is sent to our backend, which verifies it; the browser never sees a client secret.
interface GsiApi {
  initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string; auto_select?: boolean }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
}
declare global { interface Window { google?: { accounts: { id: GsiApi } } } }

const SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Google Sign-In could not be loaded")); };
    document.head.appendChild(s);
  });
  return loading;
}

export function GoogleButton({ onCredential, mode, disabled }: { onCredential: (c: string) => void; mode: "signin" | "signup"; disabled?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let live = true;
    loadGsi().then(() => {
      if (!live || !holder.current) return;
      window.google!.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID, ux_mode: "popup", auto_select: false,
        callback: (r) => { if (r.credential) cb.current(r.credential); },
      });
      const width = Math.min(400, Math.max(200, holder.current.clientWidth || 320));
      window.google!.accounts.id.renderButton(holder.current, {
        type: "standard", theme: "outline", size: "large", shape: "pill", logo_alignment: "left", width,
        text: mode === "signup" ? "signup_with" : "signin_with",
      });
      setState("ready");
    }).catch(() => live && setState("failed"));
    return () => { live = false; };
  }, [mode]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div>
        <button type="button" disabled className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-panel-2 text-sm font-medium text-fg-mute opacity-70">
          <GoogleMark /> Continue with Google
        </button>
        <p className="mt-1.5 text-center text-[11.5px] text-fg-mute">Google sign-in isn't configured on this deployment.</p>
      </div>
    );
  }
  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <div ref={holder} className="flex min-h-11 w-full justify-center" aria-label="Continue with Google" />
      {state === "loading" && <p className="mt-1.5 text-center text-[11.5px] text-fg-mute">Loading Google sign-in…</p>}
      {state === "failed" && <p role="alert" className="mt-1.5 text-center text-[11.5px] text-rose-300">Google sign-in couldn't be loaded. Check your connection or use email instead.</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
