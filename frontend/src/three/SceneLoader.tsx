import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

// The WebGL bundle (three.js) is fetched only when a scene is actually going to be drawn.
const HeroCanvas = lazy(() => import("./HeroCanvas"));

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wantsLightWeight = () => {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return !!n.connection?.saveData || (n.deviceMemory !== undefined && n.deviceMemory <= 2);
};

/**
 * Draws the 3D scene when it can, and the supplied fallback when it can't (no WebGL, jsdom, data-saver, load failure).
 * It never blocks the page: the fallback is what first paints, and the scene fades in over it once ready.
 * Rendering pauses when the scene is off screen or the tab is hidden; reduced motion renders a single still frame.
 */
export function SceneLoader({ fallback, className, subtle = false, label }: { fallback?: ReactNode; className?: string; subtle?: boolean; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [mode, setMode] = useState<"fallback" | "webgl">("fallback");
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (wantsLightWeight() || !webglAvailable()) return;
    setMode("webgl");
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const move = (e: React.PointerEvent) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return;
    pointer.current = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 };
  };

  return (
    <div ref={host} className={cn("relative", className)} onPointerMove={move} onPointerLeave={() => (pointer.current = { x: 0, y: 0 })} role="img" aria-label={label}>
      {(mode === "fallback" || failed) && fallback}
      {mode === "webgl" && !failed && (
        <ErrorCatcher onError={() => setFailed(true)}>
          <Suspense fallback={fallback}>
            <div className="absolute inset-0 animate-fade-up"><HeroCanvas animate={!reduced} running={visible && tabVisible} pointer={pointer} subtle={subtle} /></div>
          </Suspense>
        </ErrorCatcher>
      )}
    </div>
  );
}

import { Component } from "react";
class ErrorCatcher extends Component<{ children: ReactNode; onError: () => void }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.bad ? null : this.props.children; }
}
