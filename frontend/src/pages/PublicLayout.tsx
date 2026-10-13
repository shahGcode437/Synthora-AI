import type { ReactNode } from "react";
import { API_BASE } from "../api/client";
import { Logo } from "../components/Logo";
import { Link } from "../router";

export function PublicHeader({ landing = false }: { landing?: boolean }) {
  const nav = "text-sm text-fg-dim transition-colors hover:text-fg";
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Synthora AI home">
          <Logo className="size-9" />
          <span className="text-[17px] font-semibold tracking-tight">Synthora <span className="text-accent">AI</span></span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5">
          {landing && <a href="#platform" className={`${nav} hidden lg:inline`}>Product</a>}
          {landing && <a href="#audience" className={`${nav} hidden lg:inline`}>Solutions</a>}
          {landing && <a href="#types" className={`${nav} hidden lg:inline`}>Data Types</a>}
          {landing && <a href="#capabilities" className={`${nav} hidden lg:inline`}>Features</a>}
          <Link to="/docs" className={nav}>Docs</Link>
          <Link to="/app/overview" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-soft">Open Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-fg-mute sm:px-8">
        <div><span className="font-medium text-fg-dim">Synthora AI</span> · From schema to trustworthy synthetic data.</div>
        <nav aria-label="Footer" className="flex gap-5">
          <Link to="/docs" className="hover:text-fg">Documentation</Link>
          <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" className="hover:text-fg">API</a>
          <Link to="/about" className="hover:text-fg">About</Link>
          <Link to="/app/overview" className="hover:text-fg">Open the dashboard</Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="app-bg flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8"><div className="route-enter">{children}</div></main>
      <PublicFooter />
    </div>
  );
}

export function NotFound() {
  return (
    <PublicPage>
      <div className="py-16 text-center">
        <div className="font-mono text-sm text-accent">404</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="mt-2 text-fg-mute">Check the address, or head back to the start.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/" className="rounded-lg border border-line-strong px-4 py-2 text-sm hover:bg-panel-2">Home</Link>
          <Link to="/app/overview" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas">Open the dashboard</Link>
        </div>
      </div>
    </PublicPage>
  );
}
