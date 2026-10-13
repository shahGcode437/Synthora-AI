// Document view: the generated relational data rendered as nested JSON documents (children embedded under parents).
// This is a view of real generated rows; it does not invent fields or rows.
import type { GeneratedData, GenerationPlan } from "../api/types";
import { relationsOf, type Relation } from "./integrity";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Row = Record<string, unknown>;

export interface DocModel {
  /** Tables nothing points at: natural document roots. */
  roots: string[];
  /** Direct child links per parent table. */
  links: Map<string, Relation[]>;
}

export function buildModel(data: GeneratedData, plan: GenerationPlan | null): DocModel {
  const names = Object.keys(data);
  const rels = relationsOf(plan).filter((r) => data[r.parentTable] && data[r.childTable] && r.parentTable !== r.childTable);
  const links = new Map<string, Relation[]>();
  for (const r of rels) links.set(r.parentTable, [...(links.get(r.parentTable) ?? []), r]);
  const children = new Set(rels.map((r) => r.childTable));
  const roots = names.filter((n) => !children.has(n));
  return { roots: roots.length ? roots : names, links };
}

export interface DocBuilder {
  total: number;
  /** Build the document at `index` (0-based) of the root table. */
  at: (index: number) => Json;
  /** Build every document (used for export). */
  all: () => Json[];
}

/**
 * Nested documents for `root`. `depth` 0 = flat rows; each extra level embeds the child tables under a key named after
 * the child table. Cycles are cut by never revisiting a table on the same path.
 */
export function makeDocBuilder(data: GeneratedData, model: DocModel, root: string, depth: number): DocBuilder {
  const rows = (data[root] ?? []) as Row[];
  const indexes = new Map<Relation, Map<unknown, Row[]>>();
  const index = (rel: Relation) => {
    let m = indexes.get(rel);
    if (!m) {
      m = new Map();
      for (const r of (data[rel.childTable] ?? []) as Row[]) {
        const k = r[rel.childColumn];
        if (k === null || k === undefined) continue;
        const list = m.get(k);
        if (list) list.push(r); else m.set(k, [r]);
      }
      indexes.set(rel, m);
    }
    return m;
  };

  const build = (table: string, row: Row, level: number, path: string[]): Json => {
    const doc: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(row)) doc[k] = (v ?? null) as Json;
    if (level >= depth) return doc;
    for (const rel of model.links.get(table) ?? []) {
      if (path.includes(rel.childTable)) continue;
      const kids = index(rel).get(row[rel.parentColumn]) ?? [];
      doc[rel.childTable] = kids.map((k) => build(rel.childTable, k, level + 1, [...path, rel.childTable]));
    }
    return doc;
  };

  return {
    total: rows.length,
    at: (i) => build(root, rows[i], 0, [root]),
    all: () => rows.map((_, i) => build(root, rows[i], 0, [root])),
  };
}

/** Counts of embedded child documents, to show how a nested view relates to the tables (all real). */
export function describeNesting(model: DocModel, root: string, depth: number): string[] {
  const out: string[] = [];
  const walk = (table: string, level: number, path: string[], indent: string) => {
    if (level >= depth) return;
    for (const rel of model.links.get(table) ?? []) {
      if (path.includes(rel.childTable)) continue;
      out.push(`${indent}${rel.childTable}[] (via ${rel.childColumn})`);
      walk(rel.childTable, level + 1, [...path, rel.childTable], `${indent}  `);
    }
  };
  walk(root, 0, [root], "");
  return out;
}
