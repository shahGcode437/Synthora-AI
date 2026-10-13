// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../src/App";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const go = async (to: string) => { await act(async () => { window.history.pushState(null, "", to); window.dispatchEvent(new PopStateEvent("popstate")); }); };
let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  localStorage.clear(); calls = [];
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); calls.push({ url: u, init });
    if (u.endsWith("/health")) return json({ status: "ok", service: "s", version: "1" });
    if (u.endsWith("/api/v1/overview")) return json({ generations: 3, rows_generated: 120, passed: 3, failed: 0, schemas: 1, datasets: 2, last_run: null, recent: [] });
    if (u.includes("/api/v1/history")) return json({ items: [], total: 0 });
    return json([]);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("every page opens directly: no sign-in wall on any module", async () => {
  render(<App />);
  for (const [path, heading] of [["/app/overview", "Overview"], ["/app/schemas", "Schemas"], ["/app/datasets", "Datasets"], ["/app/history", "Generation history"],
    ["/app/tabular", "Tabular Data"], ["/app/relational", "Relational Data"], ["/app/documents", "Document Data"], ["/app/input", "What data do you need?"]] as const) {
    await go(path);
    expect((await screen.findAllByText(heading)).length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe(path);
  }
});

test("there are no login or signup routes, buttons or account menu", async () => {
  render(<App />);
  await go("/login");
  expect(await screen.findByText("This page does not exist")).toBeTruthy();
  await go("/app/overview");
  await screen.findAllByText("Overview");
  expect(screen.queryByLabelText("Account menu")).toBeNull();
  expect(screen.queryByText(/sign in|sign up|log in|log out|create account|profile/i)).toBeNull();
});

test("the browser gets one stable anonymous workspace id and sends it, with no credentials", async () => {
  render(<App />);
  await go("/app/overview");
  await screen.findByText("120");  // rows generated, from the stubbed overview
  const ids = new Set(calls.map((c) => new Headers(c.init?.headers).get("X-Workspace-Id")));
  expect(ids.size).toBe(1);
  const id = [...ids][0]!;
  expect(id).toMatch(/^[0-9a-f]{32}$/);
  expect(localStorage.getItem("synthora.workspace.v1")).toBe(id);
  for (const c of calls) {
    expect(new Headers(c.init?.headers).get("Authorization")).toBeNull();
    expect(c.init?.credentials).toBeUndefined();
  }
  expect(JSON.stringify({ ...localStorage })).not.toMatch(/token|password|session/i);
});
