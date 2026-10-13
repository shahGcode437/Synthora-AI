// Referential-integrity facts computed from the actual rows: nothing here is assumed or hard-coded.
import type { Cardinality, GeneratedData, GenerationPlan } from "../api/types";

export interface Relation { parentTable: string; parentColumn: string; childTable: string; childColumn: string; cardinality: Cardinality | null }

export interface RelationCheck extends Relation {
  /** Child rows whose reference was looked up. */
  checked: number;
  /** Child rows pointing at a parent value that does not exist. */
  orphans: number;
  /** Child rows with an empty reference (allowed only if the column is nullable). */
  emptyRefs: number;
  /** False when a table or column is absent from the data, so integrity cannot be judged. */
  verifiable: boolean;
  ok: boolean;
}

/** Relationships and per-table foreign keys, merged and de-duplicated. */
export function relationsOf(plan: GenerationPlan | null): Relation[] {
  if (!plan) return [];
  const out = new Map<string, Relation>();
  const key = (r: Relation) => `${r.parentTable}.${r.parentColumn}>${r.childTable}.${r.childColumn}`;
  for (const r of plan.relationships) {
    const rel = { parentTable: r.parent_table, parentColumn: r.parent_column, childTable: r.child_table, childColumn: r.child_column, cardinality: r.cardinality };
    out.set(key(rel), rel);
  }
  for (const t of plan.tables) {
    for (const fk of t.foreign_keys) {
      const rel = { parentTable: fk.references_table, parentColumn: fk.references_column, childTable: t.name, childColumn: fk.column, cardinality: null };
      if (!out.has(key(rel))) out.set(key(rel), rel);
    }
  }
  return [...out.values()];
}

export function checkIntegrity(data: GeneratedData, plan: GenerationPlan | null): RelationCheck[] {
  return relationsOf(plan).map((rel) => {
    const parent = data[rel.parentTable];
    const child = data[rel.childTable];
    if (!parent || !child || !parent.length && !child.length) {
      return { ...rel, checked: 0, orphans: 0, emptyRefs: 0, verifiable: false, ok: false };
    }
    const values = new Set(parent.map((r) => r[rel.parentColumn]));
    let orphans = 0, emptyRefs = 0, checked = 0;
    for (const row of child) {
      const v = row[rel.childColumn];
      if (v === null || v === undefined || v === "") { emptyRefs++; continue; }
      checked++;
      if (!values.has(v)) orphans++;
    }
    return { ...rel, checked, orphans, emptyRefs, verifiable: true, ok: orphans === 0 };
  });
}
