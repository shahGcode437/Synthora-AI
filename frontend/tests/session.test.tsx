// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { auth } from "../src/api/accounts";
import { setCsrfToken } from "../src/api/client";
import App from "../src/App";

const USER = { id: "u1", email: "ada@example.com", name: "Ada Lovelace", avatar_url: null, has_password: true, has_google: false,
  email_verified: false, created_at: "2026-01-01T00:00:00Z", last_login_at: null, preferences: {} };
const SESSION = { user: USER, token: "", csrf_token: "csrf-abc", expires_at: "2099-01-01T00:00:00Z" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

let calls: { url: string; init?: RequestInit }[] = [];
const go = async (to: string) => { await act(async () => { window.history.pushState(null, "", to); window.dispatchEvent(new PopStateEvent("popstate")); }); };

beforeEach(() => {
  localStorage.clear(); calls = []; setCsrfToken(null);
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith("/health")) return json({ status: "ok", service: "s", version: "1" });
    if (u.endsWith("/api/v1/auth/session")) return json(SESSION);
    if (u.endsWith("/api/v1/auth/login")) return json({ ...SESSION, token: "BEARER-SHOULD-NOT-BE-STORED" });
    if (u.endsWith("/api/v1/overview")) return json({ generations: 0, rows_generated: 0, passed: 0, failed: 0, schemas: 0, datasets: 0, last_run: null, recent: [] });
    return json({}, 200);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("an older version's bearer token is deleted from localStorage on load", async () => {
  localStorage.setItem("synthora.session.v1", JSON.stringify({ token: "old-secret", expires_at: "2099-01-01T00:00:00Z" }));
  await go("/app/input");
  render(<App />);
  await screen.findByText("What data do you need?");
  expect(localStorage.getItem("synthora.session.v1")).toBeNull();
});

test("a guest makes no session request and holds no credentials", async () => {
  await go("/app/input");
  render(<App />);
  await screen.findByText("What data do you need?");
  expect(calls.some((c) => c.url.endsWith("/auth/session"))).toBe(false);
  expect(JSON.stringify({ ...localStorage })).not.toMatch(/token|csrf/i);
});

test("a returning browser asks the server who it is and keeps the secret out of storage", async () => {
  localStorage.setItem("synthora.signedin.v1", "1");
  await go("/app/overview");
  render(<App />);
  expect(await screen.findByText(/Hello, Ada/)).toBeTruthy();
  const stored = JSON.stringify({ ...localStorage });
  expect(stored).not.toContain("csrf-abc");
  expect(stored).not.toMatch(/Bearer|token/i);
});

test("API calls send cookies and the CSRF header on writes only, and never an Authorization header", async () => {
  localStorage.setItem("synthora.signedin.v1", "1");
  await go("/app/overview");
  render(<App />);
  await screen.findByText(/Hello, Ada/);
  await act(async () => { await auth.update({ name: "New Name" }); });
  const read = calls.find((c) => c.url.endsWith("/api/v1/overview"))!;
  const write = calls.find((c) => c.init?.method === "PATCH")!;
  expect(new Headers(read.init?.headers).get("X-CSRF-Token")).toBeNull();
  expect(new Headers(write.init?.headers).get("X-CSRF-Token")).toBe("csrf-abc");
  for (const c of calls) {
    expect(c.init?.credentials).toBe("include");
    expect(new Headers(c.init?.headers).get("Authorization")).toBeNull();
  }
});

test("an expired session is dropped: the hint is cleared and the user is sent to sign in", async () => {
  localStorage.setItem("synthora.signedin.v1", "1");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).endsWith("/auth/session")
    ? json({ error: { code: "not_authenticated", message: "expired" } }, 401)
    : json({ status: "ok", service: "s", version: "1" })));
  await go("/app/history");
  render(<App />);
  await vi.waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(localStorage.getItem("synthora.signedin.v1")).toBeNull();
});

test("signing in stores only a non-secret hint, not the token returned in the response", async () => {
  await go("/login");
  render(<App />);
  fireEvent.change(await screen.findByLabelText(/Email/i), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: "correct-horse-42" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sign in/i })); });
  await vi.waitFor(() => expect(localStorage.getItem("synthora.signedin.v1")).toBe("1"));
  expect(JSON.stringify({ ...localStorage })).not.toContain("BEARER-SHOULD-NOT-BE-STORED");
});
