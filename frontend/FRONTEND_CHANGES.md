# Synthora AI frontend: architecture update

## What changed

The single scrolling page was rebuilt as a routed application. Existing working code (API client, reducer, all section components) was kept; it is now wired into a shell.

### Routes

| Path | Page |
|---|---|
| `/` | Landing page (lazy-loaded) |
| `/about`, `/docs` | Public About and Documentation |
| `/app` | Redirects to `/app/input` |
| `/app/input` `analyze` `plan` `generate` `validate` `quality` `export` | The seven workflow workspaces |
| `/app/settings` `help` `about` | Settings, Help, About |

Routing is a small History-API router (`src/router.tsx`), no new dependency. `vercel.json` rewrites every path to `index.html` so refreshing `/app/plan` does not 404. If your Vercel project root is the repo root (not `frontend/`), move `vercel.json` there.

### New structure

- `src/router.tsx`: Router, Link, Redirect
- `src/state/AppContext.tsx`: one provider for workspace state, health, settings, input draft and activity events
- `src/state/settings.ts`: browser-saved preferences (localStorage)
- `src/shell/`: AppShell, AppHeader, SidebarNav, AppFooter, HeaderMenus (notifications, profile), ShortcutsModal, steps
- `src/pages/`: Landing, Workspaces, SettingsPage, HelpPage, AboutPage, PublicLayout
- `src/components/Logo.tsx`
- Removed: `components/Header.tsx`, `components/Sidebar.tsx` (replaced by `shell/`)

### Edited existing files

- `sections/InputSection.tsx`: draft lives in app state (typed text survives navigation); offline message is now production-aware instead of always saying "run uvicorn"
- `sections/ExportSection.tsx`: optional `defaultFormat` prop
- `sections/ControlsFields.tsx`: exports `LOCALES`, `EDGE`, `PRIVACY`
- `state/workspace.ts`: health polling every 15 s online, 5 s offline, re-check on window focus
- `api/client.ts`: health timeout 6 s to 20 s so a sleeping hosted backend is not reported offline too early
- `index.css`: light theme tokens, glass and depth utilities, route transitions, user preference switches
- `main.tsx`: saved theme applied before first paint
- `App.tsx`: now only the router and route table

## Truthfulness rules followed

- API status, AI provider and latency, step status and notifications all come from real state or real responses.
- Landing, Settings and Help mark Documents, Excel, SQL and PDF as "Coming soon"; the backend does not support them.
- There is no login, plan or Sign Out. The profile menu is a local workspace menu.
- Footer shows only links to pages that exist (Documentation, API reference, About).
- Settings only contains controls that change a real request parameter or a real UI preference. Privacy controls beyond the four privacy modes are shown as "Not available yet".

## Preferences (Settings)

General (workspace name, default locale, default rows), AI & Generation (default edge-case mode), Privacy (default mode), Data (default seed), Export (default highlighted format), Appearance (dark/light, density, animations, 3D effects), API (endpoint, status, connection test). Defaults apply to new sessions.

## Keyboard shortcuts

`1`-`7` jump to an unlocked step, `?` opens the shortcut list, `Esc` closes dialogs.

## Tests (optional, not part of the build)

`tests/` holds a smoke suite (landing, shell, route guards, settings, draft persistence, offline message, and the full journey using `docs/examples/*.json`). To run it:

```
cd frontend
npm i -D vitest jsdom @testing-library/react @testing-library/dom
npx vitest run tests
```

The folder is outside `src/`, so it never affects `npm run build`.
