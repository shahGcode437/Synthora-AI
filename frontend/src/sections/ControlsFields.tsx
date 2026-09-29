import { ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";
import type { EdgeCaseMode, PrivacyMode } from "../api/types";
import { Input, Label, Select } from "../components/ui";
import { cn } from "../lib/cn";
import { parseIntOrNull } from "../lib/format";

export interface Controls {
  targetRows: string;
  locale: string; // "" = Auto, "__custom" = free text
  customLocale: string;
  edge: EdgeCaseMode;
  privacy: PrivacyMode;
  seed: string;
}

export const defaultControls: Controls = {
  targetRows: "", locale: "", customLocale: "", edge: "ai_recommended", privacy: "auto", seed: "",
};

const LOCALES: { value: string; label: string }[] = [
  { value: "", label: "Auto (AI decides)" },
  { value: "en_PK", label: "Pakistan · en_PK" },
  { value: "en_US", label: "United States · en_US" },
  { value: "en_GB", label: "United Kingdom · en_GB" },
  { value: "en_IN", label: "India · en_IN" },
  { value: "en_CA", label: "Canada · en_CA" },
  { value: "en_AU", label: "Australia · en_AU" },
  { value: "de_DE", label: "Germany · de_DE" },
  { value: "fr_FR", label: "France · fr_FR" },
  { value: "es_ES", label: "Spain · es_ES" },
  { value: "ar_SA", label: "Saudi Arabia · ar_SA" },
  { value: "__custom", label: "Other…" },
];

const EDGE: { value: EdgeCaseMode; label: string; hint: string }[] = [
  { value: "ai_recommended", label: "AI Recommended", hint: "Domain-aware cases chosen by the AI" },
  { value: "none", label: "None", hint: "Only clean, typical records" },
  { value: "low", label: "Low", hint: "~2% edge cases" },
  { value: "medium", label: "Medium", hint: "~5% edge cases" },
  { value: "high", label: "High", hint: "~10% edge cases" },
  { value: "custom", label: "Custom", hint: "Uses the AI's proposed rates as-is" },
];

const PRIVACY: { value: PrivacyMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Synthesize identifying fields by default" },
  { value: "safe_default", label: "Safe default", hint: "Force synthesis for direct identifiers and sensitive data" },
  { value: "none", label: "None", hint: "Plan no privacy actions (values are still synthetic)" },
  { value: "custom", label: "Custom", hint: "Keep the AI's per-field privacy actions" },
];

export type ParsedControls =
  | { ok: true; value: { target_rows: number | null; locale: string | null; edge_case_mode: EdgeCaseMode; privacy_mode: PrivacyMode; seed: number | null } }
  | { ok: false; errors: Partial<Record<"targetRows" | "locale" | "seed", string>> };

export function parseControls(c: Controls): ParsedControls {
  const errors: Partial<Record<"targetRows" | "locale" | "seed", string>> = {};
  const rows = parseIntOrNull(c.targetRows);
  if (rows !== null && (Number.isNaN(rows) || rows < 1 || rows > 1_000_000)) errors.targetRows = "Whole number from 1 to 1,000,000";
  const seed = parseIntOrNull(c.seed);
  if (seed !== null && Number.isNaN(seed)) errors.seed = "Must be a whole number";
  const locale = c.locale === "__custom" ? c.customLocale.trim() : c.locale;
  if (c.locale === "__custom" && (!locale || locale.length > 16)) errors.locale = "Enter a locale code, e.g. fr_CA";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { target_rows: rows, locale: locale || null, edge_case_mode: c.edge, privacy_mode: c.privacy, seed },
  };
}

export function ControlsFields({ value, onChange, errors, disabled, rowsHint }: {
  value: Controls; onChange: (c: Controls) => void; disabled?: boolean; rowsHint?: string;
  errors?: Partial<Record<"targetRows" | "locale" | "seed", string>>;
}) {
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof Controls>(k: K, v: Controls[K]) => onChange({ ...value, [k]: v });
  const edgeHint = EDGE.find((e) => e.value === value.edge)?.hint;
  const privacyHint = PRIVACY.find((e) => e.value === value.privacy)?.hint;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="rows" hint="empty = Auto">Target rows</Label>
          <Input id="rows" inputMode="numeric" placeholder={rowsHint ?? "Auto"} value={value.targetRows} disabled={disabled}
            invalid={!!errors?.targetRows} onChange={(e) => set("targetRows", e.target.value.replace(/[^\d]/g, ""))} />
          {errors?.targetRows && <p className="mt-1 text-xs text-rose-300">{errors.targetRows}</p>}
        </div>
        <div>
          <Label htmlFor="locale">Locale</Label>
          <Select id="locale" value={value.locale} disabled={disabled} onChange={(e) => set("locale", e.target.value)}>
            {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
          {value.locale === "__custom" && (
            <Input className="mt-2" placeholder="e.g. fr_CA" value={value.customLocale} disabled={disabled}
              invalid={!!errors?.locale} onChange={(e) => set("customLocale", e.target.value)} />
          )}
          {errors?.locale && <p className="mt-1 text-xs text-rose-300">{errors.locale}</p>}
        </div>
        <div>
          <Label htmlFor="edge">Edge cases</Label>
          <Select id="edge" value={value.edge} disabled={disabled} onChange={(e) => set("edge", e.target.value as EdgeCaseMode)}>
            {EDGE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <p className="mt-1 text-[11px] text-fg-mute">{edgeHint}</p>
        </div>
        <div>
          <Label htmlFor="privacy">Privacy</Label>
          <Select id="privacy" value={value.privacy} disabled={disabled} onChange={(e) => set("privacy", e.target.value as PrivacyMode)}>
            {PRIVACY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <p className="mt-1 text-[11px] text-fg-mute">{privacyHint}</p>
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}
          className="flex items-center gap-1.5 text-xs font-medium text-fg-mute transition-colors hover:text-fg-dim">
          <Settings2 className="size-3.5" /> Advanced
          <ChevronDown className={cn("size-3.5 transition-transform", advanced && "rotate-180")} />
        </button>
        {advanced && (
          <div className="mt-3 grid max-w-xs animate-fade-in gap-4">
            <div>
              <Label htmlFor="seed" hint="reproducibility">Random seed</Label>
              <Input id="seed" inputMode="numeric" placeholder="Random" value={value.seed} disabled={disabled}
                invalid={!!errors?.seed} onChange={(e) => set("seed", e.target.value.replace(/[^\d-]/g, ""))} />
              {errors?.seed && <p className="mt-1 text-xs text-rose-300">{errors.seed}</p>}
              <p className="mt-1 text-[11px] text-fg-mute">Same plan + same seed = same rows.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
