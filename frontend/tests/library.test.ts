// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const PLAN = { domain: "retail", source_mode: "prompt", tables: [{ name: "customers", columns: [{ name: "id" }, { name: "name" }] }] } as never;
const RESULT = { data: {}, validation: { passed: true, error_count: 0, warning_count: 1, tables: [], rules: [] }, warnings: [],
  metadata: { tables_generated: 1, rows_generated: 20, rows_per_table: {}, generation_order: [], seed: 7, seed_source: "request", locale: null, faker_locale: "en_US", edge_cases_applied: [], duration_ms: 12 } } as never;

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function load(serverHasSavedWork: boolean) {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    serverHasSavedWork ? reply([]) : String(url).includes("/api/v1/") ? reply({ detail: "Not Found" }, 404) : reply({})));
  return import("../src/api/library");
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test("an older server without saved-work routes: everything works in this browser", async () => {
  const lib = await load(false);
  expect(lib.libraryMode()).toBe("unknown");
  expect((await lib.schemas.list())).toEqual([]);
  expect(lib.libraryMode()).toBe("local");

  const s = await lib.schemas.create({ name: "Shop", plan: PLAN });
  expect((await lib.schemas.list())[0]).toMatchObject({ id: s.id, name: "Shop", domain: "retail", tables: ["customers"], columns: 2 });
  expect((await lib.schemas.get(s.id)).plan).toEqual(PLAN);
  expect((await lib.schemas.update(s.id, { name: "Renamed" })).name).toBe("Renamed");
  await lib.schemas.remove(s.id);
  expect(await lib.schemas.list()).toEqual([]);
  await expect(lib.schemas.get(s.id)).rejects.toMatchObject({ status: 404 });
});

test("local datasets: save, preview, full data, delete, and honest limits", async () => {
  const lib = await load(false);
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: i, name: `n${i}` }));
  const d = await lib.datasets.create({ name: "Rows", data: { customers: rows }, plan: PLAN, validation: { passed: true, error_count: 0, warning_count: 2, junk: "x" }, seed: 5 });
  expect(d).toMatchObject({ name: "Rows", total_rows: 120, seed: 5, validation: { passed: true, error_count: 0, warning_count: 2 } });
  expect(d.tables).toEqual([{ name: "customers", rows: 120, columns: ["id", "name"] }]);
  const detail = await lib.datasets.get(d.id);
  expect(detail.preview.customers).toHaveLength(50);
  expect((await lib.datasets.data(d.id)).customers).toHaveLength(120);
  await expect(lib.datasets.create({ name: "x", data: { t: [] } })).rejects.toMatchObject({ code: "invalid_dataset" });
  const huge = Array.from({ length: 30_000 }, (_, i) => ({ id: i, text: "x".repeat(60) }));
  await expect(lib.datasets.create({ name: "big", data: { t: huge } })).rejects.toMatchObject({ code: "dataset_too_large" });
  await lib.datasets.remove(d.id);
  expect(await lib.datasets.list()).toEqual([]);
  expect(localStorage.getItem(`synthora.local.dataset.${d.id}`)).toBeNull();
});

test("local history: runs are recorded after generating, filtered, re-openable, and drive the overview", async () => {
  const lib = await load(false);
  await lib.recordRun(PLAN, RESULT);
  await lib.recordRun(PLAN, { ...(RESULT as object), validation: { passed: false, error_count: 2, warning_count: 0, tables: [], rules: [] } } as never);
  const all = await lib.history.list();
  expect(all.total).toBe(2);
  expect(all.items[0]).toMatchObject({ validation_passed: false, rows: 20, seed: 7, domain: "retail" });
  expect((await lib.history.list({ status: "passed" })).total).toBe(1);
  expect((await lib.history.get(all.items[0].id)).plan).toEqual(PLAN);
  const ov = await lib.history.overview();
  expect(ov).toMatchObject({ generations: 2, rows_generated: 40, passed: 1, failed: 1, schemas: 0, datasets: 0 });
  await lib.history.remove(all.items[0].id);
  expect((await lib.history.list()).total).toBe(1);
  await lib.history.clear();
  expect((await lib.history.list()).total).toBe(0);
});

test("a server that has saved work is used, and nothing is written to the browser", async () => {
  const lib = await load(true);
  await lib.schemas.list();
  expect(lib.libraryMode()).toBe("server");
  await lib.recordRun(PLAN, RESULT);   // the server records its own runs while generating
  expect(localStorage.getItem("synthora.local.history.v1")).toBeNull();
});

test("a network failure is an error, not a silent switch to local storage", async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
  const lib = await import("../src/api/library");
  await expect(lib.schemas.list()).rejects.toMatchObject({ code: "network_error" });
  expect(lib.libraryMode()).toBe("unknown");
});
