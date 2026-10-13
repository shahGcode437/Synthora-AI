// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../src/App";

const go = async (to: string) => { await act(async () => { window.history.pushState(null, "", to); window.dispatchEvent(new PopStateEvent("popstate")); }); };

beforeEach(() => {
  localStorage.clear();
  window.history.pushState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/health")) return new Response(JSON.stringify({ status: "ok", service: "synthora", version: "9.9.9" }), { status: 200 });
    return new Response("{}", { status: 500 });
  }));
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("landing renders and CTA opens the app", async () => {
  render(<App />);
  expect(await screen.findByText("Why Synthetic Data?")).toBeTruthy();
  expect(screen.getByText(/Turn schemas into shippable datasets/)).toBeTruthy();
  expect(screen.getAllByText(/soon/i).length).toBeGreaterThan(0);
  await act(async () => { fireEvent.click(screen.getAllByText("Start Generating")[0]); });
  expect(window.location.pathname).toBe("/app/input");
  expect(await screen.findByText("What data do you need?")).toBeTruthy();
});

test("landing nav points only at real routes and the showcase tabs switch", async () => {
  render(<App />);
  await screen.findByText("Why Synthetic Data?");
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByText("Sign In").getAttribute("href")).toBe("/login");
  expect(within(nav).getByText("Get Started").getAttribute("href")).toBe("/signup");
  await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Document" })); });
  expect(screen.getByRole("tabpanel").textContent).toContain("orders");
});

test("app shell: header, 7-step sidebar, footer, real API status", async () => {
  await go("/app/input");
  render(<App />);
  expect((await screen.findAllByText("API Online")).length).toBeGreaterThan(0);
  const nav = screen.getByRole("list", { name: "Generator steps" });
  for (const l of ["Input", "Analyze", "Generation Plan", "Generate", "Validate", "Quality & Fidelity", "Export"]) expect(within(nav).getByText(l)).toBeTruthy();
});

test("locked steps are guarded, not faked", async () => {
  await go("/app/export");
  render(<App />);
  expect(await screen.findByText("This step is not available yet")).toBeTruthy();
  await go("/app/plan");
  expect(await screen.findByText("This step is not available yet")).toBeTruthy();
});

test("settings persist and change the theme", async () => {
  await go("/app/settings");
  render(<App />);
  await screen.findByText("Preferences are saved automatically in this browser.");
  await act(async () => { fireEvent.click(screen.getByText("Appearance")); });
  await act(async () => { fireEvent.click(screen.getByText("Light")); });
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(JSON.parse(localStorage.getItem("synthora.settings.v1")!).theme).toBe("light");
  await act(async () => { fireEvent.click(screen.getByText("Dark")); });
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("input draft survives a trip to settings and back", async () => {
  await go("/app/input");
  render(<App />);
  const box = (await screen.findByLabelText(/Describe your dataset/)) as HTMLTextAreaElement;
  await act(async () => { fireEvent.change(box, { target: { value: "500 customers" } }); });
  await act(async () => { fireEvent.click(screen.getAllByText("Settings")[0]); });
  await act(async () => { fireEvent.click(within(screen.getByRole("list", { name: "Generator steps" })).getByText("Input")); });
  expect(((await screen.findByLabelText(/Describe your dataset/)) as HTMLTextAreaElement).value).toBe("500 customers");
});

test("help search filters, public pages and 404 work", async () => {
  await go("/docs");
  render(<App />);
  const s = await screen.findByLabelText("Search documentation");
  await act(async () => { fireEvent.change(s, { target: { value: "orphan" } }); });
  expect(screen.getByText("Relational Data")).toBeTruthy();
  expect(screen.queryByText("Getting Started")).toBeNull();
  await go("/nope");
  expect(await screen.findByText("This page does not exist")).toBeTruthy();
});

test("API offline shows a production-aware message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
  await go("/app/input");
  render(<App />);
  expect(await screen.findByText("API Offline")).toBeTruthy();
  expect(await screen.findByText("Backend offline")).toBeTruthy();
});
