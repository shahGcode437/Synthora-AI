import { RotateCcw, X } from "lucide-react";
import type { ApiError } from "../api/client";
import { Button, Callout } from "../components/ui";

const STEP_LABEL = { analyze: "Analysis failed", generate: "Generation failed", export: "Export failed" } as const;

/** Friendly title + guidance per backend error code (docs/API_CONTRACT.md §6). */
function describe(err: ApiError): { title?: string; hint?: string } {
  switch (err.code) {
    case "network_error": return { title: "Can't reach the backend", hint: "Check that the API is running, then retry." };
    case "timeout": return { title: "The request timed out", hint: "The AI may be busy. Retry in a moment." };
    case "ai_providers_failed": return { title: "The AI is busy right now", hint: "Every configured AI provider failed (rate limit or overload are common). Retry in a few seconds." };
    case "ai_provider_not_configured": return { title: "No AI provider configured", hint: "Add an API key and model to backend/.env and restart the API." };
    case "file_too_large": return { title: "File is too large", hint: "The limit is 10 MB." };
    case "invalid_sample": return { title: "This CSV can't be used" };
    case "validation_error": return { title: "Some inputs are invalid" };
    default: return {};
  }
}

const RETRYABLE = new Set(["network_error", "timeout", "ai_providers_failed", "internal_error", "http_error", "unknown_error"]);

export function ErrorPanel({ step, err, onRetry, onDismiss, busy }: {
  step: "analyze" | "generate" | "export"; err: ApiError; onRetry: () => void; onDismiss: () => void; busy?: boolean;
}) {
  const d = describe(err);
  const details = Array.isArray(err.details) ? err.details : null;
  return (
    <Callout tone="error" title={d.title ?? STEP_LABEL[step]}
      action={
        <div className="flex items-center gap-1.5">
          {RETRYABLE.has(err.code) && (
            <Button size="sm" variant="danger" loading={busy} onClick={onRetry} icon={<RotateCcw className="size-3.5" />}>Retry</Button>
          )}
          <button aria-label="Dismiss error" onClick={onDismiss} className="rounded p-1 text-rose-200/70 hover:bg-rose-500/10 hover:text-rose-100"><X className="size-4" /></button>
        </div>
      }>
      <p>{err.message}</p>
      {d.hint && <p className="mt-1 text-rose-100/70">{d.hint}</p>}
      {details && details.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-rose-100/70">
          {details.slice(0, 6).map((x, i) => (
            <li key={i} className="font-mono">
              {typeof x === "string" ? x : `${(x as { field?: string }).field ?? ""}: ${(x as { message?: string }).message ?? JSON.stringify(x)}`}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 font-mono text-[11px] text-rose-100/40">{err.code}{err.status ? ` · HTTP ${err.status}` : ""}</p>
    </Callout>
  );
}
