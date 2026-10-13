// Interactive WebGL hero. Loaded lazily by SceneLoader; nothing here is imported by the app shell.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const ACCENT = "#38bdf8";
const VIOLET = "#a78bfa";
const MINT = "#34d399";

/** Small deterministic PRNG so the scene looks identical on every load (and in tests). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function Core({ animate }: { animate: boolean }) {
  const ico = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!animate) return;
    if (ico.current) { ico.current.rotation.y += dt * 0.35; ico.current.rotation.x += dt * 0.12; }
    if (ring.current) ring.current.rotation.z += dt * 0.5;
  });
  return (
    <group>
      <mesh ref={ico}>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.45} wireframe />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshStandardMaterial color="#0b1220" emissive={ACCENT} emissiveIntensity={0.25} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.25, 0.012, 8, 96]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/** Tabular: a grid of small slabs. */
function GridCluster({ animate }: { animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  const cells = useMemo(() => {
    const r = rng(7), out: { p: [number, number, number]; s: number }[] = [];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) out.push({ p: [x * 0.26, -y * 0.2, 0], s: 0.5 + r() * 0.5 });
    return out;
  }, []);
  useFrame(({ clock }) => { if (animate && g.current) g.current.position.y = 1.0 + Math.sin(clock.elapsedTime * 0.8) * 0.06; });
  return (
    <group ref={g} position={[-2.5, 1.0, 0.2]} rotation={[0, 0.5, 0]}>
      {cells.map((c, i) => (
        <mesh key={i} position={c.p}>
          <boxGeometry args={[0.2 * c.s + 0.04, 0.12, 0.04]} />
          <meshStandardMaterial color={i % 5 === 0 ? ACCENT : "#64748b"} emissive={i % 5 === 0 ? ACCENT : "#1e293b"} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Relational: nodes joined by lines. */
function NodeCluster({ animate }: { animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  const nodes: [number, number, number][] = [[0, 0, 0], [0.8, 0.5, 0.2], [0.9, -0.5, -0.1], [-0.2, -0.8, 0.3], [-0.7, 0.4, -0.2]];
  const lines = useMemo(() => {
    const pairs = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2]];
    const pts: number[] = [];
    pairs.forEach(([a, b]) => pts.push(...nodes[a], ...nodes[b]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame(({ clock }) => { if (animate && g.current) { g.current.rotation.y = clock.elapsedTime * 0.3; g.current.position.y = -1.3 + Math.sin(clock.elapsedTime * 0.7 + 1) * 0.06; } });
  return (
    <group ref={g} position={[2.5, -1.3, 0.2]}>
      <lineSegments geometry={lines}><lineBasicMaterial color={VIOLET} transparent opacity={0.8} /></lineSegments>
      {nodes.map((p, i) => (
        <mesh key={i} position={p}><sphereGeometry args={[i === 0 ? 0.14 : 0.09, 16, 16]} /><meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={0.8} /></mesh>
      ))}
    </group>
  );
}

/** Document: stacked translucent sheets. */
function DocCluster({ animate }: { animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (animate && g.current) g.current.position.y = 1.2 + Math.sin(clock.elapsedTime * 0.9 + 2) * 0.07; });
  return (
    <group ref={g} position={[2.4, 1.2, -0.2]} rotation={[0, -0.5, 0.08]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 0.1, -i * 0.06, -i * 0.12]}>
          <planeGeometry args={[0.8, 1.0]} />
          <meshBasicMaterial color={i === 0 ? MINT : "#94a3b8"} transparent opacity={i === 0 ? 0.28 : 0.14} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[0.3, 0.12, -0.06, -0.24].map((y, i) => (
        <mesh key={i} position={[-0.05, y, 0.01]}><planeGeometry args={[0.5 - i * 0.07, 0.03]} /><meshBasicMaterial color={MINT} transparent opacity={0.7} /></mesh>
      ))}
    </group>
  );
}

/** Stream of points flowing from the clusters toward the core. */
function Particles({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { geo, base } = useMemo(() => {
    const r = rng(42), n = 240, pos = new Float32Array(n * 3), base = new Float32Array(n * 4);
    const src = [[-2.5, 1, 0], [2.5, -1.3, 0], [2.4, 1.2, 0]];
    for (let i = 0; i < n; i++) {
      const s = src[i % 3];
      base.set([s[0] + (r() - 0.5) * 0.8, s[1] + (r() - 0.5) * 0.8, s[2] + (r() - 0.5) * 0.8, r()], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo, base };
  }, []);
  useFrame(({ clock }) => {
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const t = animate ? clock.elapsedTime * 0.12 : 0;
    for (let i = 0; i < attr.count; i++) {
      const k = (base[i * 4 + 3] + t) % 1, e = k * k * (3 - 2 * k);
      attr.setXYZ(i, base[i * 4] * (1 - e), base[i * 4 + 1] * (1 - e), base[i * 4 + 2] * (1 - e));
    }
    attr.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo}><pointsMaterial color={ACCENT} size={0.035} sizeAttenuation transparent opacity={0.85} depthWrite={false} /></points>;
}

/** Keeps the clusters (about +-3.1 wide, +-2.1 tall) inside the frame whatever shape the container is. */
function Fit() {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const aspect = size.width / Math.max(1, size.height);
  const t = Math.tan((cam.fov * Math.PI) / 360);
  cam.position.z = Math.max(3.1 / (t * aspect), 2.3 / t);
  cam.updateProjectionMatrix();
  return null;
}

/** Eases the whole scene toward the pointer. */
function Rig({ animate, pointer, children }: { animate: boolean; pointer: React.RefObject<{ x: number; y: number }>; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!g.current || !animate) return;
    const p = pointer.current ?? { x: 0, y: 0 };
    const k = 1 - Math.exp(-dt * 4);
    g.current.rotation.y += (p.x * 0.35 - g.current.rotation.y) * k;
    g.current.rotation.x += (-p.y * 0.2 - g.current.rotation.x) * k;
  });
  return <group ref={g}>{children}</group>;
}

export interface HeroCanvasProps { animate: boolean; running: boolean; pointer: React.RefObject<{ x: number; y: number }>; subtle?: boolean }

export default function HeroCanvas({ animate, running, pointer, subtle = false }: HeroCanvasProps) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 6.2], fov: 42 }} frameloop={running ? (animate ? "always" : "demand") : "never"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }} style={{ background: "transparent" }}>
      <Fit />
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 4, 5]} intensity={40} color="#ffffff" />
      <pointLight position={[-4, -3, 3]} intensity={22} color={VIOLET} />
      <Rig animate={animate} pointer={pointer}>
        <Core animate={animate} />
        {!subtle && <><GridCluster animate={animate} /><NodeCluster animate={animate} /><DocCluster animate={animate} /></>}
        <Particles animate={animate} />
      </Rig>
    </Canvas>
  );
}
