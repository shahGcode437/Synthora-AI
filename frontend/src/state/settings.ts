import type { Preferences } from "../api/accounts";
import type { EdgeCaseMode, ExportFormat, PrivacyMode } from "../api/types";

/** Browser-side preferences. Every field either feeds a real request parameter or changes the UI. */
export interface Settings {
  workspaceName: string;
  locale: string;            // "" = Auto
  rows: string;              // "" = Auto
  edge: EdgeCaseMode;
  privacy: PrivacyMode;
  seed: string;              // "" = random
  exportFormat: "auto" | ExportFormat;
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  animations: boolean;
  depth: "full" | "reduced";
}

export const defaultSettings: Settings = {
  workspaceName: "My Workspace", locale: "", rows: "", edge: "ai_recommended", privacy: "auto", seed: "",
  exportFormat: "auto", theme: "dark", density: "comfortable", animations: true, depth: "full",
};

const KEY = "synthora.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory only */ }
}

export function applyAppearance(s: Settings) {
  const r = document.documentElement;
  r.dataset.theme = s.theme;
  r.dataset.density = s.density;
  r.dataset.motion = s.animations ? "on" : "off";
  r.dataset.depth = s.depth;
  r.style.colorScheme = s.theme;
}

/** Local settings <-> the server's preference record (snake_case). Unknown/invalid server values fall back to defaults. */
export function toServerPrefs(s: Settings): Preferences {
  return {
    workspace_name: s.workspaceName, locale: s.locale, rows: s.rows, edge: s.edge, privacy: s.privacy, seed: s.seed,
    export_format: s.exportFormat, theme: s.theme, density: s.density, animations: s.animations, depth: s.depth,
  };
}

export function fromServerPrefs(p: Partial<Preferences>): Settings {
  const d = defaultSettings;
  return {
    workspaceName: p.workspace_name ?? d.workspaceName, locale: p.locale ?? d.locale, rows: p.rows ?? d.rows,
    edge: p.edge ?? d.edge, privacy: p.privacy ?? d.privacy, seed: p.seed ?? d.seed,
    exportFormat: p.export_format ?? d.exportFormat, theme: p.theme ?? d.theme, density: p.density ?? d.density,
    animations: p.animations ?? d.animations, depth: p.depth ?? d.depth,
  };
}
