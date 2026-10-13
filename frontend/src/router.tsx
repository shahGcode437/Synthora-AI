import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type AnchorHTMLAttributes, type MouseEvent, type ReactNode,
} from "react";

/** Tiny History-API router: no dependency, real URLs (/app/analyze), query strings, back/forward support. */
interface Location { path: string; search: string }
interface RouterCtx extends Location { go: (to: string, replace?: boolean) => void; params: URLSearchParams }
const Ctx = createContext<RouterCtx>({ path: "/", search: "", params: new URLSearchParams(), go: () => {} });
export const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
const read = (): Location => ({ path: normalize(window.location.pathname), search: window.location.search });

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(read);
  useEffect(() => {
    const onPop = () => setLoc(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((to: string, replace = false) => {
    const url = new URL(to, window.location.origin);
    const next = { path: normalize(url.pathname), search: url.search };
    if (next.path === normalize(window.location.pathname) && next.search === window.location.search) return;
    window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}${url.hash}`);
    setLoc(next);
    if (!url.hash) window.scrollTo({ top: 0 });
  }, []);
  const value = useMemo(() => ({ ...loc, go, params: new URLSearchParams(loc.search) }), [loc, go]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { go } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    go(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}

export function Redirect({ to }: { to: string }) {
  const { go } = useRouter();
  useEffect(() => go(to, true), [go, to]);
  return null;
}

/** Only same-site relative paths are accepted as a post-login destination (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/app/overview"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
