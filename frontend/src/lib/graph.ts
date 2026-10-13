// Layered layout for the relationship graph: parents on the left, children to the right.
import type { Relation } from "./integrity";

export interface GraphTable { name: string; columns: string[]; pk: string[]; fks: string[]; rows: number }
export interface Node extends GraphTable { x: number; y: number; w: number; h: number; level: number }
export interface Edge { rel: Relation; from: { x: number; y: number }; to: { x: number; y: number }; key: string }

export const NODE_W = 220;
export const HEADER_H = 34;
export const ROW_H = 20;
export const MAX_COLS = 7;
const GAP_X = 120, GAP_Y = 36, PAD = 24;

export const nodeHeight = (columns: number) => HEADER_H + Math.min(columns, MAX_COLS) * ROW_H + (columns > MAX_COLS ? ROW_H : 0) + 10;

/** Level = length of the longest chain of parents above a table (cycles are ignored). */
export function levels(names: string[], rels: Relation[]): Map<string, number> {
  const parents = new Map<string, Set<string>>(names.map((n) => [n, new Set()]));
  for (const r of rels) if (r.parentTable !== r.childTable && parents.has(r.childTable) && parents.has(r.parentTable)) parents.get(r.childTable)!.add(r.parentTable);
  const memo = new Map<string, number>();
  const visit = (n: string, stack: Set<string>): number => {
    if (memo.has(n)) return memo.get(n)!;
    if (stack.has(n)) return 0; // cycle
    stack.add(n);
    const lvl = [...parents.get(n)!].reduce((m, p) => Math.max(m, visit(p, stack) + 1), 0);
    stack.delete(n);
    memo.set(n, lvl);
    return lvl;
  };
  names.forEach((n) => visit(n, new Set()));
  return memo;
}

export function layoutGraph(tables: GraphTable[], rels: Relation[]): { nodes: Node[]; edges: Edge[]; width: number; height: number } {
  const lv = levels(tables.map((t) => t.name), rels);
  const byLevel = new Map<number, GraphTable[]>();
  for (const t of tables) byLevel.set(lv.get(t.name) ?? 0, [...(byLevel.get(lv.get(t.name) ?? 0) ?? []), t]);
  const nodes: Node[] = [];
  let height = 0;
  [...byLevel.keys()].sort((a, b) => a - b).forEach((level) => {
    let y = PAD;
    for (const t of byLevel.get(level)!) {
      const h = nodeHeight(t.columns.length);
      nodes.push({ ...t, level, x: PAD + level * (NODE_W + GAP_X), y, w: NODE_W, h });
      y += h + GAP_Y;
    }
    height = Math.max(height, y - GAP_Y + PAD);
  });
  const width = PAD * 2 + (Math.max(0, ...nodes.map((n) => n.level)) + 1) * NODE_W + Math.max(0, ...nodes.map((n) => n.level)) * GAP_X;
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const colY = (n: Node, col: string) => {
    const i = n.columns.indexOf(col);
    const shown = i >= 0 && i < MAX_COLS ? i : 0; // columns past the cap anchor to the header area
    return n.y + HEADER_H + shown * ROW_H + ROW_H / 2;
  };
  const edges: Edge[] = [];
  for (const rel of rels) {
    const p = byName.get(rel.parentTable), c = byName.get(rel.childTable);
    if (!p || !c || p === c) continue;
    const parentLeftOfChild = p.x <= c.x;
    edges.push({
      rel, key: `${rel.parentTable}.${rel.parentColumn}>${rel.childTable}.${rel.childColumn}`,
      from: { x: parentLeftOfChild ? p.x + p.w : p.x, y: colY(p, rel.parentColumn) },
      to: { x: parentLeftOfChild ? c.x : c.x + c.w, y: colY(c, rel.childColumn) },
    });
  }
  return { nodes, edges, width, height: Math.max(height, 120) };
}
