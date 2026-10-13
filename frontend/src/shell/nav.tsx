import {
  Braces, Database, History, LayoutDashboard, Network, Settings, Shapes, Sparkles, Table2, UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Crumb } from "../components/page";

export interface NavLeaf { key: string; label: string; to: string; icon: ReactNode; auth?: boolean; match?: (path: string) => boolean }
export interface NavGroup { title: string; items: NavLeaf[] }

const ic = "size-[18px]";
export const GENERATOR_PATHS = ["input", "analyze", "plan", "generate", "validate", "quality", "export"];
export const isGeneratorPath = (path: string) => GENERATOR_PATHS.some((s) => path === `/app/${s}`);

/** Every entry maps to a real page. `auth` items are reachable only when signed in (guests are sent to Sign in). */
export const NAV: NavGroup[] = [
  { title: "Workspace", items: [
    { key: "overview", label: "Overview", to: "/app/overview", icon: <LayoutDashboard className={ic} /> },
    { key: "generator", label: "Data Generator", to: "/app/input", icon: <Sparkles className={ic} />, match: isGeneratorPath },
    { key: "tabular", label: "Tabular Data", to: "/app/tabular", icon: <Table2 className={ic} /> },
    { key: "relational", label: "Relational Data", to: "/app/relational", icon: <Network className={ic} /> },
    { key: "documents", label: "Document Data", to: "/app/documents", icon: <Braces className={ic} /> },
  ] },
  { title: "Management", items: [
    { key: "schemas", label: "Schemas", to: "/app/schemas", icon: <Shapes className={ic} />, auth: true },
    { key: "datasets", label: "Datasets", to: "/app/datasets", icon: <Database className={ic} />, auth: true },
    { key: "history", label: "Generation History", to: "/app/history", icon: <History className={ic} />, auth: true },
  ] },
  { title: "Account", items: [
    { key: "profile", label: "Profile", to: "/app/profile", icon: <UserRound className={ic} />, auth: true },
    { key: "settings", label: "Settings", to: "/app/settings", icon: <Settings className={ic} /> },
  ] },
];

export const isActive = (item: NavLeaf, path: string) => (item.match ? item.match(path) : path === item.to || path.startsWith(`${item.to}/`));

const STEP_LABEL: Record<string, string> = {
  input: "Input", analyze: "Analyze", plan: "Generation Plan", generate: "Generate", validate: "Validate", quality: "Quality & Fidelity", export: "Export",
};
const PAGE_LABEL: Record<string, string> = {
  overview: "Overview", tabular: "Tabular Data", relational: "Relational Data", documents: "Document Data", schemas: "Schemas",
  datasets: "Datasets", history: "Generation History", profile: "Profile", settings: "Settings", help: "Help", about: "About",
};

/** Breadcrumb trail and document title for an /app route, derived from the nav model. */
export function routeMeta(path: string): { crumbs: Crumb[]; title: string } {
  const seg = path.split("/")[2] ?? "";
  if (STEP_LABEL[seg]) return { title: STEP_LABEL[seg], crumbs: [{ label: "Workspace", to: "/app/overview" }, { label: "Data Generator", to: "/app/input" }, { label: STEP_LABEL[seg] }] };
  const label = PAGE_LABEL[seg] ?? "Workspace";
  const group = NAV.find((g) => g.items.some((i) => i.key === seg))?.title ?? "Workspace";
  const detail = path.split("/")[3];
  const crumbs: Crumb[] = [{ label: group, to: "/app/overview" }, detail ? { label, to: `/app/${seg}` } : { label }];
  if (detail) crumbs.push({ label: "Details" });
  return { title: label, crumbs };
}
