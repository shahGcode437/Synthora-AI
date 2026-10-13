// Each browser gets a random workspace id (no account, no password). It is sent with every API request so saved
// schemas, datasets and history belong to this browser. It is an identifier, not a secret credential.
const KEY = "synthora.workspace.v1";
const ID = /^[0-9a-f]{32}$/;
let memory: string | null = null;

function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function getWorkspaceId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && ID.test(saved)) return (memory = saved);
  } catch { /* storage blocked: fall through to the in-memory id */ }
  memory ??= randomId();
  try { localStorage.setItem(KEY, memory); } catch { /* the workspace then lasts for this tab only */ }
  return memory;
}
