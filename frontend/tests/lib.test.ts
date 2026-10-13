import { describe, expect, test } from "vitest";
import type { GeneratedData, GenerationPlan } from "../src/api/types";
import { cellText, columnsOf, filterRows, nextSort, paginate, sortRows, type Filter } from "../src/lib/datagrid";
import { buildModel, describeNesting, makeDocBuilder } from "../src/lib/documents";
import { levels, layoutGraph } from "../src/lib/graph";
import { checkIntegrity, relationsOf } from "../src/lib/integrity";
import { normalize } from "../src/router";

const plan = (over: Partial<GenerationPlan> = {}): GenerationPlan => ({
  plan_version: "1.0", source_mode: "prompt", domain: "shop", summary: null, locale: null, seed: null, confidence: null,
  warnings: [], assumptions: [], business_rules: [], privacy: { mode: "auto" },
  edge_cases: { mode: "none", null_rate: null, outlier_rate: null, rare_category_rate: null, recommendations: [] },
  relationships: [{ parent_table: "customers", parent_column: "id", child_table: "orders", child_column: "customer_id", cardinality: "1:N", confidence: null },
    { parent_table: "orders", parent_column: "id", child_table: "items", child_column: "order_id", cardinality: "1:N", confidence: null }],
  tables: [
    { name: "customers", description: null, target_rows: 2, columns: [], primary_key: ["id"], foreign_keys: [] },
    { name: "orders", description: null, target_rows: 3, columns: [], primary_key: ["id"], foreign_keys: [{ column: "customer_id", references_table: "customers", references_column: "id" }] },
    { name: "items", description: null, target_rows: 3, columns: [], primary_key: ["id"], foreign_keys: [] },
  ],
  ...over,
});

const data: GeneratedData = {
  customers: [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }],
  orders: [{ id: 10, customer_id: 1, total: 5 }, { id: 11, customer_id: 1, total: 9.5 }, { id: 12, customer_id: 2, total: 7 }],
  items: [{ id: 100, order_id: 10, sku: "A" }, { id: 101, order_id: 10, sku: "B" }, { id: 102, order_id: 12, sku: "C" }],
};

describe("data grid", () => {
  const rows = [
    { id: 3, name: "carol", city: "Lahore", note: null },
    { id: 1, name: "Alice", city: "karachi", note: "x" },
    { id: 12, name: "bob", city: "Lahore", note: "" },
    { id: 2, name: "Dave", city: null, note: "y" },
  ];
  const cols = columnsOf(rows);

  test("columns come from the rows", () => expect(cols).toEqual(["id", "name", "city", "note"]));
  test("cellText renders empties as blank and objects as JSON", () => {
    expect(cellText(null)).toBe(""); expect(cellText(0)).toBe("0"); expect(cellText({ a: 1 })).toBe('{"a":1}');
  });
  test("search is case-insensitive across all columns", () => {
    expect(filterRows(rows, { search: "LAHORE", columns: cols }).map((r) => r.id)).toEqual([3, 12]);
    expect(filterRows(rows, { search: "  ", columns: cols })).toBe(rows);
  });
  test("filters combine with AND and support every operator", () => {
    const f = (column: string, op: Filter["op"], value = ""): Filter => ({ id: column + op, column, op, value });
    expect(filterRows(rows, { columns: cols, filters: [f("city", "equals", "lahore")] }).map((r) => r.id)).toEqual([3, 12]);
    expect(filterRows(rows, { columns: cols, filters: [f("id", "gt", "2")] }).map((r) => r.id)).toEqual([3, 12]);
    expect(filterRows(rows, { columns: cols, filters: [f("id", "lt", "3")] }).map((r) => r.id)).toEqual([1, 2]);
    expect(filterRows(rows, { columns: cols, filters: [f("note", "empty")] }).map((r) => r.id)).toEqual([3, 12]);
    expect(filterRows(rows, { columns: cols, filters: [f("note", "notempty"), f("city", "contains", "kar")] }).map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, { columns: cols, filters: [f("name", "contains", "")] })).toBe(rows);   // a blank value filter is inert
  });
  test("sort is numeric/natural, stable, and keeps empties last in both directions", () => {
    expect(sortRows(rows, { column: "id", dir: "asc" }).map((r) => r.id)).toEqual([1, 2, 3, 12]);
    expect(sortRows(rows, { column: "id", dir: "desc" }).map((r) => r.id)).toEqual([12, 3, 2, 1]);
    expect(sortRows(rows, { column: "city", dir: "asc" }).map((r) => r.id)).toEqual([1, 3, 12, 2]);
    expect(sortRows(rows, { column: "city", dir: "desc" }).map((r) => r.id)).toEqual([3, 12, 1, 2]);
    expect(sortRows(rows, null)).toBe(rows);
  });
  test("sort toggles asc -> desc -> off", () => {
    const a = nextSort(null, "id"); const b = nextSort(a, "id"); const c = nextSort(b, "id");
    expect([a, b, c]).toEqual([{ column: "id", dir: "asc" }, { column: "id", dir: "desc" }, null]);
    expect(nextSort(b, "name")).toEqual({ column: "name", dir: "asc" });
  });
  test("pagination clamps and reports real ranges", () => {
    const many = Array.from({ length: 53 }, (_, i) => ({ i }));
    expect(paginate(many, 1, 25)).toMatchObject({ pages: 3, from: 1, to: 25, total: 53 });
    expect(paginate(many, 3, 25)).toMatchObject({ from: 51, to: 53 });
    expect(paginate(many, 99, 25).page).toBe(3);
    expect(paginate([], 1, 25)).toMatchObject({ pages: 1, from: 0, to: 0 });
  });
});

describe("relational integrity", () => {
  test("relationships and foreign keys merge without duplicates", () => {
    const rels = relationsOf(plan());
    expect(rels).toHaveLength(2);
    expect(rels.find((r) => r.childTable === "orders")?.cardinality).toBe("1:N");
    const fkOnly = plan({ relationships: [] });
    expect(relationsOf(fkOnly)).toEqual([{ parentTable: "customers", parentColumn: "id", childTable: "orders", childColumn: "customer_id", cardinality: null }]);
    expect(relationsOf(null)).toEqual([]);
  });
  test("valid data has zero orphans", () => {
    const res = checkIntegrity(data, plan());
    expect(res.every((r) => r.ok && r.verifiable && r.orphans === 0)).toBe(true);
    expect(res[0]).toMatchObject({ checked: 3, emptyRefs: 0 });
  });
  test("orphans and empty references are counted from the rows", () => {
    const bad: GeneratedData = { ...data, orders: [...data.orders, { id: 13, customer_id: 99, total: 1 }, { id: 14, customer_id: null, total: 1 }] };
    const r = checkIntegrity(bad, plan()).find((x) => x.childTable === "orders")!;
    expect(r).toMatchObject({ orphans: 1, emptyRefs: 1, checked: 4, ok: false });
  });
  test("a missing table makes a relation unverifiable, not 'ok'", () => {
    const r = checkIntegrity({ customers: data.customers }, plan());
    expect(r.every((x) => !x.verifiable && !x.ok)).toBe(true);
  });
});

describe("document view", () => {
  const model = buildModel(data, plan());
  test("roots are the tables nothing references", () => expect(model.roots).toEqual(["customers"]));
  test("nested documents embed children by foreign key", () => {
    const b = makeDocBuilder(data, model, "customers", 2);
    expect(b.total).toBe(2);
    const ada = b.at(0) as { id: number; orders: { id: number; items: { sku: string }[] }[] };
    expect(ada.orders.map((o) => o.id)).toEqual([10, 11]);
    expect(ada.orders[0].items.map((i) => i.sku)).toEqual(["A", "B"]);
    expect(ada.orders[1].items).toEqual([]);
    expect((b.at(1) as { orders: { items: unknown[] }[] }).orders[0].items).toHaveLength(1);
  });
  test("depth limits nesting; depth 0 is the flat row", () => {
    expect(makeDocBuilder(data, model, "customers", 0).at(0)).toEqual({ id: 1, name: "Ada" });
    const one = makeDocBuilder(data, model, "customers", 1).at(0) as { orders: Record<string, unknown>[] };
    expect(one.orders[0]).not.toHaveProperty("items");
  });
  test("every embedded row exists exactly once (no invented or duplicated rows)", () => {
    const all = makeDocBuilder(data, model, "customers", 2).all() as { orders: { items: unknown[] }[] }[];
    expect(all.flatMap((c) => c.orders)).toHaveLength(3);
    expect(all.flatMap((c) => c.orders.flatMap((o) => o.items))).toHaveLength(3);
  });
  test("cycles are cut and null values survive", () => {
    const cyc = plan({ relationships: [...plan().relationships, { parent_table: "items", parent_column: "id", child_table: "customers", child_column: "id", cardinality: "1:1", confidence: null }] });
    const m = buildModel(data, cyc);
    expect(() => makeDocBuilder(data, m, m.roots[0], 5).all()).not.toThrow();
    expect(makeDocBuilder({ t: [{ a: null }] }, buildModel({ t: [{ a: null }] }, null), "t", 1).at(0)).toEqual({ a: null });
  });
  test("nesting description lists the real child tables", () => {
    expect(describeNesting(model, "customers", 2)).toEqual(["orders[] (via customer_id)", "  items[] (via order_id)"]);
  });
});

describe("graph layout", () => {
  const tables = [
    { name: "items", columns: ["id", "order_id"], pk: ["id"], fks: ["order_id"], rows: 3 },
    { name: "customers", columns: ["id", "name"], pk: ["id"], fks: [], rows: 2 },
    { name: "orders", columns: ["id", "customer_id"], pk: ["id"], fks: ["customer_id"], rows: 3 },
  ];
  const rels = relationsOf(plan());
  test("parents sit left of children", () => {
    const lv = levels(tables.map((t) => t.name), rels);
    expect([lv.get("customers"), lv.get("orders"), lv.get("items")]).toEqual([0, 1, 2]);
    const g = layoutGraph(tables, rels);
    const x = Object.fromEntries(g.nodes.map((n) => [n.name, n.x]));
    expect(x.customers).toBeLessThan(x.orders);
    expect(x.orders).toBeLessThan(x.items);
    expect(g.edges).toHaveLength(2);
    expect(g.edges[0].from.x).toBeLessThan(g.edges[0].to.x);
  });
  test("a cycle does not loop forever", () => {
    const cyc = [...rels, { parentTable: "items", parentColumn: "id", childTable: "customers", childColumn: "id", cardinality: null }];
    expect(() => layoutGraph(tables, cyc)).not.toThrow();
  });
  test("tables with no relations still get positions", () => {
    const g = layoutGraph([tables[1]], []);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toEqual([]);
  });
});


describe("router helpers", () => {
  test("normalize strips trailing slashes", () => {
    expect(normalize("/app/")).toBe("/app"); expect(normalize("/")).toBe("/"); expect(normalize("///")).toBe("/");
  });
});
