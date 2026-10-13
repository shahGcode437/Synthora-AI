// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../src/App";

const ex = (n: string) => fs.readFileSync(`../docs/examples/${n}`, "utf8");
const json = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "application/json" } });
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => {
  localStorage.clear();
  window.history.pushState(null, "", "/app/input");
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/health")) return json('{"status":"ok","service":"synthora","version":"9.9.9"}');
    if (u.endsWith("/api/v1/analyze")) return json(ex("analyze_prompt_response.json"));
    if (u.endsWith("/api/v1/generate")) return json(ex("generate_response.json"));
    return json("{}", 500);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("full journey: input -> analyze -> plan -> generate -> validate -> quality -> export", async () => {
  render(<App />);
  const box = await screen.findByLabelText(/Describe your dataset/);
  await act(async () => { fireEvent.change(box, { target: { value: "Generate 200 customers with orders" } }); });
  await click(screen.getByRole("button", { name: /Analyze with AI/ }));

  await click(await screen.findByRole("button", { name: /Review generation plan/ }));
  expect(window.location.pathname).toBe("/app/plan");

  const gen = (await screen.findAllByRole("button", { name: /^Generate/ }))[0];
  await click(gen);
  expect(window.location.pathname).toBe("/app/generate");

  await click(await screen.findByRole("button", { name: /Validate the data/ }));
  expect(window.location.pathname).toBe("/app/validate");
  await click(await screen.findByRole("button", { name: /See quality and fidelity/ }));
  await click(await screen.findByRole("button", { name: /Continue to export/ }));
  expect(window.location.pathname).toBe("/app/export");
  expect(await screen.findByText("Download")).toBeTruthy();

  // sidebar now reflects real state: every step is a link, none locked
  const nav = screen.getByRole("list", { name: "Generator steps" });
  expect(within(nav).queryAllByTitle("Complete the previous step first").length).toBe(0);
});

test("a failed analysis returns to Input with the error shown", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).endsWith("/health")
    ? json('{"status":"ok","service":"s","version":"1"}') : json('{"error":{"code":"ai_unavailable","message":"All providers failed"}}', 503)));
  render(<App />);
  const box = await screen.findByLabelText(/Describe your dataset/);
  await act(async () => { fireEvent.change(box, { target: { value: "Generate customers" } }); });
  await click(screen.getByRole("button", { name: /Analyze with AI/ }));
  await vi.waitFor(() => expect(window.location.pathname).toBe("/app/input"));
  expect(await screen.findByLabelText(/Describe your dataset/)).toBeTruthy();
});
