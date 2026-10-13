import { Dialog } from "../components/Dialog";

const KEYS: [string, string][] = [
  ["1 – 7", "Jump to a generator step (if it is unlocked)"],
  ["B", "Collapse or expand the sidebar"],
  ["?", "Open this dialog"],
  ["Esc", "Close dialogs, menus and the navigation drawer"],
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Keyboard shortcuts" size="sm">
      <ul className="space-y-2.5">
        {KEYS.map(([k, d]) => (
          <li key={k} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-fg-dim">{d}</span>
            <kbd className="rounded-md border border-line-strong bg-panel-2 px-2 py-0.5 font-mono text-xs text-fg">{k}</kbd>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-fg-mute">Shortcuts are ignored while you are typing in a field.</p>
    </Dialog>
  );
}
