// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const go = async (to: string) => { await act(async () => { window.history.pushState(null, "", to); window.dispatchEvent(new PopStateEvent("popstate")); }); };
let urls: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_ACCOUNTS_ENABLED", "false");
  localStorage.clear(); urls = [];
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ status: "ok", service: "s", version: "1" }), { status: 200 }); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("with accounts off there is no sign in / sign up anywhere on the landing page", async () => {
  await go("/");
  const { default: App } = await import("../src/App");
  render(<App />);
  await screen.findByText("Why Synthetic Data?");
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).queryByText("Sign In")).toBeNull();
  expect(within(nav).getByText("Start Generating").getAttribute("href")).toBe("/app/input");
  expect(screen.queryByText(/Create a free account/)).toBeNull();
});

test("login, signup and account pages redirect to the generator, and no account request is made", async () => {
  const { default: App } = await import("../src/App");
  render(<App />);
  for (const p of ["/login", "/signup", "/app/history", "/app/profile", "/app/overview", "/app"]) {
    await go(p);
    await vi.waitFor(() => expect(window.location.pathname).toBe("/app/input"));
  }
  await screen.findByText("What data do you need?");
  expect(screen.queryByText("Generation History")).toBeNull();
  expect(screen.queryByLabelText("Account menu")).toBeNull();
  expect(screen.queryByText("Sign in")).toBeNull();
  expect(urls.some((u) => u.includes("/auth/"))).toBe(false);
});
