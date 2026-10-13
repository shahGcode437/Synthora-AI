// The session token is NOT stored in the browser by scripts: it lives in an HttpOnly cookie that page code (and any
// injected script) cannot read. All that is kept here is a non-secret hint ("this browser was signed in") so the app
// knows whether to ask the server who you are, and so other tabs learn about sign-in / sign-out.
const KEY = "synthora.signedin.v1";
const LEGACY_TOKEN_KEY = "synthora.session.v1"; // earlier versions kept the bearer token here: delete it

export const SIGNED_IN_HINT_KEY = KEY;

/** Remove a token left behind by an older version of the app. Safe to call repeatedly. */
export function purgeLegacyToken(): void {
  try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* storage unavailable */ }
}

export function hasSignedInHint(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setSignedInHint(on: boolean): void {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
