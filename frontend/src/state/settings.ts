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

