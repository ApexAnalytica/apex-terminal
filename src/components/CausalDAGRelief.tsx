"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { useApexStore } from "@/stores/useApexStore";
import { compute2DForceLayout } from "@/lib/graph-layout-2d";
import {
  computeFusedReliefField,
  computeNodeAnchors,
  computeReliefField,
  pickNearestNode,
  type FusedReliefField,
  type NodeAnchor,
  type ReliefField,
} from "@/lib/graph-relief-field";

/* ─── Topo shader ──────────────────────────────────────────────────
 *
 * The earlier path baked elevation colour + iso-contour rings into per-vertex
 * RGB and let meshStandardMaterial linearly interpolate them across triangles.
 * That's why the surface looked pixelated: a contour band drawn at norm=0.5
 * would only land *exactly* on triangle interiors that crossed 0.5, so its
 * apparent width followed the triangle grid, not the screen.
 *
 * Moving the colour + band math to the fragment shader fixes that — the
 * varying `vNorm` is interpolated across each triangle, then every pixel
 * computes its own colour and its own distance-to-band-edge. Result is
 * pixel-smooth gradients and crisp anti-aliased contour lines, regardless
 * of geometry resolution.
 */
const TOPO_VERTEX_SHADER = /* glsl */ `
  attribute float aNorm;
  varying float vNorm;
  varying vec3 vNormal;

  void main() {
    vNorm = aNorm;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TOPO_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying float vNorm;
  varying vec3 vNormal;

  uniform vec3 uLightDir;
  uniform float uBands;
  uniform float uLineWidth;

  // Mirror of elevationColor() in graph-relief-field.ts. Keep in sync.
  vec3 elevationColor(float t) {
    float n = clamp(t, 0.0, 1.0);
    if (n < 0.25) {
      float k = n / 0.25;
      return vec3(
        mix(0.04, 0.0, k),
        mix(0.05, 0.9, k),
        mix(0.18, 1.0, k)
      );
    }
    if (n < 0.55) {
      float k = (n - 0.25) / 0.30;
      return vec3(
        mix(0.0, 1.0, k),
        mix(0.9, 0.67, k),
        mix(1.0, 0.0, k)
      );
    }
    float k = clamp((n - 0.55) / 0.45, 0.0, 1.0);
    return vec3(
      1.0,
      mix(0.67, 0.09, k),
      mix(0.0, 0.27, k)
    );
  }

  void main() {
    float n = clamp(vNorm, 0.0, 1.0);
    vec3 baseColor = elevationColor(n);

    // Iso-contour lines. Distance from band-edge in [0, 0.5]; smooth-step
    // across uLineWidth gives an anti-aliased dark line at every band edge.
    float band = fract(n * uBands);
    float distToEdge = min(band, 1.0 - band);
    float line = 1.0 - smoothstep(uLineWidth, uLineWidth + 0.008, distToEdge);
    vec3 surface = mix(baseColor, baseColor * 0.35, line * 0.75);

    // Lambert shading with a fill so back-facing slopes aren't black.
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);
    float lambert = max(dot(N, L), 0.0);
    float light = 0.45 + 0.55 * lambert;

    gl_FragColor = vec4(surface * light, 1.0);
  }
`;
import CanvasWatermark from "./CanvasWatermark";
import DAGOverlay from "./dag3d/DAGOverlay";

class ReliefErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[Relief view] render error:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-background pointer-events-none">
          <div className="text-[10px] font-mono text-text-muted text-center px-6">
            RELIEF VIEW UNAVAILABLE
            <div className="mt-1 text-[9px] opacity-60">
              {this.state.error.message || "Renderer failed to initialise"}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Topographic / "Relief" view — 4th rendering mode. Reads the network as a
 * scalar criticality field over the existing 2D force layout: peaks where
 * high-ΩF nodes cluster, valleys where it's quiet.
 *
 * Single-domain graphs render with the elevation ramp (deep blue → red).
 * Multi-domain graphs use a single fused mesh: each vertex is colored by
 * the dominant domain at that grid cell × elevation tint × iso-contour
 * banding. This gives discrete, recognisable peaks (each ridge belongs to
 * one domain by colour) instead of the blurry haze the additive multilayer
 * produced.
 */

function ReliefMesh({
  field,
  norms,
  onPick,
}: {
  field: ReliefField;
  /** Per-vertex normalised height. Present for fused-mode renders; the
   *  single-domain path falls back to vertex-colour rendering. */
  norms?: Float32Array;
  onPick?: (clickX: number, clickZ: number) => void;
}) {
  const useShader = !!(norms && norms.length === field.positions.length / 3);

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    if (field.positions.length === 0) return geom;
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(field.positions, 3),
    );
    if (useShader && norms) {
      geom.setAttribute(
        "aNorm",
        new THREE.BufferAttribute(norms, 1),
      );
    } else {
      geom.setAttribute(
        "color",
        new THREE.BufferAttribute(field.colors, 3),
      );
    }
    geom.setIndex(new THREE.BufferAttribute(field.indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, [field, norms, useShader]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Uniforms — recreated only on first mount; values are stable.
  const uniforms = useMemo(
    () => ({
      uLightDir: { value: new THREE.Vector3(0.45, 1.0, 0.6).normalize() },
      uBands: { value: 14 },
      uLineWidth: { value: 0.04 },
    }),
    [],
  );

  if (field.positions.length === 0) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPick) return;
    e.stopPropagation();
    onPick(e.point.x, e.point.z);
  };

  return (
    <mesh
      geometry={geometry}
      castShadow={false}
      receiveShadow={false}
      onClick={handleClick}
    >
      {useShader ? (
        <shaderMaterial
          vertexShader={TOPO_VERTEX_SHADER}
          fragmentShader={TOPO_FRAGMENT_SHADER}
          uniforms={uniforms}
          side={THREE.DoubleSide}
          transparent={false}
        />
      ) : (
        <meshStandardMaterial
          vertexColors
          roughness={0.55}
          metalness={0.05}
          side={THREE.DoubleSide}
          flatShading={false}
        />
      )}
    </mesh>
  );
}

/**
 * Sets the camera to a sensible initial framing the first time a non-empty
 * field is rendered, then leaves it to OrbitControls.
 */
function CameraSetup({
  width,
  height,
  enabled,
}: {
  width: number;
  height: number;
  enabled: boolean;
}) {
  const { camera } = useThree();
  const framedRef = useRef(false);

  useEffect(() => {
    if (framedRef.current) return;
    if (!enabled) return;
    // Pulled the camera lower (Y multiplier 0.35 → 0.25) — drama is hard
    // to read at a near-isometric angle when peaks are tall.
    const dist = Math.max(width, height, 200) * 0.7;
    camera.position.set(dist * 0.95, dist * 0.25, dist * 0.95);
    camera.lookAt(0, 0, 0);
    framedRef.current = true;
  }, [camera, width, height, enabled]);

  return null;
}

function ReliefGrid({ width, height }: { width: number; height: number }) {
  const size = Math.max(width, height) * 1.2;
  const divisions = 16;
  return (
    <gridHelper
      args={[size, divisions, "#1a1d2b", "#0e1018"]}
      position={[0, -2, 0]}
    />
  );
}

/**
 * Per-node colour from the same domain map the field uses. Inlined here so
 * label borders can pick up the domain identity the surface no longer
 * carries (v4 dropped per-domain surface tinting in favour of the heatmap
 * ramp). Keep in sync with DOMAIN_COLOR_MAP in graph-relief-field.ts.
 */
function labelDomainColor(domain: string): string {
  switch (domain) {
    case "Saudi Aramco Energy": return "#00e676";
    case "QatarEnergy LNG": return "#00e5ff";
    case "QAFCO Fertilizer": return "#76ff03";
    case "Ma'aden Phosphate": return "#ffab00";
    case "Financial Contagion": return "#ff6d00";
    case "Sovereign Risk": return "#ffab00";
    case "Supply Chain Food Security": return "#00e5ff";
    case "Undersea Cable Infrastructure": return "#7c4dff";
    case "Macro Impact: Labor, Growth & Housing": return "#40c4ff";
    case "Macro Impact: Inflation & Policy": return "#ff80ab";
    case "Drone Swarms": return "#ff4081";
    case "SATCOM": return "#448aff";
    case "ISR Fusion": return "#ea80fc";
    case "Chip Embargo": return "#ff9100";
    case "Secure Compute": return "#69f0ae";
    case "Kill Chain": return "#ff1744";
    default: return "#94a3b8";
  }
}

function NodeLabels({ anchors }: { anchors: NodeAnchor[] }) {
  if (anchors.length === 0) return null;
  return (
    <>
      {anchors.map((a) => {
        // Scale font + tick by composite — a top-Ω node gets a bolder
        // marker than a borderline-3 node, so the user reads "criticality"
        // directly from the label, not just from terrain elevation.
        const t = Math.max(0, Math.min(1, (a.composite - 3) / 7));
        const fontPx = 7.5 + 3 * t;        // 7.5px → 10.5px
        const subPx = 6.5 + 1.5 * t;       // 6.5px → 8px
        const tickHeight = 14 + 14 * t;    // 14 → 28
        const tickRadius = 0.4 + 0.5 * t;
        const tickOpacity = 0.45 + 0.5 * t;
        const cardOpacity = 0.7 + 0.25 * t;
        const borderColor = labelDomainColor(a.domain);
        return (
          <group
            key={a.id}
            position={[a.x, a.y + tickHeight, a.z]}
          >
            {/* Tick from peak surface to label. Width + opacity scale with
                Ω so high-criticality labels visually dominate. */}
            <mesh position={[0, -tickHeight / 2, 0]}>
              <cylinderGeometry
                args={[tickRadius, tickRadius, tickHeight, 6]}
              />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={tickOpacity}
              />
            </mesh>
            <Html
              center
              distanceFactor={380}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div
                className="px-1.5 py-0.5 rounded whitespace-nowrap shadow-[0_0_6px_rgba(0,0,0,0.7)]"
                style={{
                  transform: "translateY(-50%)",
                  backgroundColor: `rgba(0, 0, 0, ${cardOpacity})`,
                  border: `1px solid ${borderColor}`,
                }}
              >
                <div
                  className="font-mono text-white leading-tight"
                  style={{ fontSize: `${fontPx}px` }}
                >
                  {a.label}
                </div>
                <div
                  className="font-mono leading-tight"
                  style={{
                    fontSize: `${subPx}px`,
                    color: borderColor,
                    opacity: 0.85,
                  }}
                >
                  Ω {a.composite.toFixed(1)}
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

function DomainLegend({ field }: { field: FusedReliefField }) {
  if (field.legend.length < 2) return null;
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 px-3 py-2 rounded border border-border bg-surface-elevated/80 backdrop-blur-sm pointer-events-none">
      <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
        DOMAIN LAYERS · {field.legend.length}
      </div>
      {field.legend.map((l) => (
        <div key={l.domain} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: l.colorHex }}
          />
          <span className="text-[9px] font-mono text-foreground">
            {l.domain}
          </span>
          <span className="text-[8px] font-mono text-text-muted ml-auto">
            {l.nodeCount}
          </span>
        </div>
      ))}
    </div>
  );
}

function SelectionMarkers({
  layout,
  field,
}: {
  layout: Map<string, { x: number; y: number }>;
  field: ReliefField | null | undefined;
}) {
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);

  const markers = useMemo(() => {
    if (!field || layout.size === 0) return [];
    const ids = new Set<string>(selectedNodes);
    if (selectedNode) ids.add(selectedNode);
    const out: { id: string; x: number; z: number }[] = [];
    for (const id of ids) {
      const p = layout.get(id);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      out.push({ id, x: p.x - field.cx, z: p.y - field.cy });
    }
    return out;
  }, [layout, field, selectedNode, selectedNodes]);

  if (markers.length === 0 || !field) return null;

  const PILLAR_HEIGHT = 140;
  const PILLAR_RADIUS = 1.4;

  return (
    <group>
      {markers.map((m) => (
        <group key={m.id} position={[m.x, 0, m.z]}>
          <mesh position={[0, PILLAR_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[PILLAR_RADIUS, PILLAR_RADIUS, PILLAR_HEIGHT, 10]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.65} />
          </mesh>
          <mesh position={[0, PILLAR_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[PILLAR_RADIUS * 2.2, PILLAR_RADIUS * 2.2, PILLAR_HEIGHT, 10]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.12} />
          </mesh>
          <mesh position={[0, PILLAR_HEIGHT, 0]}>
            <sphereGeometry args={[3.2, 14, 14]} />
            <meshBasicMaterial color="#00e5ff" />
          </mesh>
          <mesh position={[0, PILLAR_HEIGHT, 0]}>
            <sphereGeometry args={[5.5, 14, 14]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function CausalDAGRelief() {
  return (
    <ReliefErrorBoundary>
      <CausalDAGReliefInner />
    </ReliefErrorBoundary>
  );
}

function CausalDAGReliefInner() {
  const graphData = useFilteredGraph();
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const [pickHint, setPickHint] = useState<string | null>(null);

  // Reuse the existing 2D force layout so peaks land exactly where nodes
  // sit on the 2D canvas — switching between views feels coherent.
  const layout = useMemo(
    () => compute2DForceLayout(graphData.nodes, graphData.edges),
    [graphData.nodes, graphData.edges],
  );

  const uniqueDomains = useMemo(() => {
    const set = new Set<string>();
    for (const n of graphData.nodes) set.add(n.domain);
    return set.size;
  }, [graphData.nodes]);

  const multilayer = uniqueDomains >= 2;

  const singleField = useMemo(
    () =>
      multilayer
        ? null
        : computeReliefField(graphData.nodes, layout),
    [multilayer, graphData.nodes, layout],
  );

  // Fused mesh path — replaces the v2 additive multilayer. One single
  // BufferGeometry, dominant-domain coloring, iso-contour bands.
  const fusedField = useMemo(
    () =>
      multilayer
        ? computeFusedReliefField(graphData.nodes, layout)
        : null,
    [multilayer, graphData.nodes, layout],
  );

  const activeField: ReliefField | null =
    (multilayer ? fusedField : singleField) ?? null;
  const isEmpty = !activeField || activeField.positions.length === 0;

  const anchors = useMemo<NodeAnchor[]>(() => {
    if (!activeField || isEmpty) return [];
    // 40 is enough to see most nodes on a typical 100–200-node graph
    // without the canvas turning into a wall of overlapping labels.
    // Each label's font + tick scales with composite so low-Ω entries
    // stay visually subordinate to peaks.
    return computeNodeAnchors(graphData.nodes, layout, activeField, {}, 40);
  }, [activeField, isEmpty, graphData.nodes, layout]);

  // Click handler — convert the mesh-local hit point to nearest node id
  // and dispatch into the store. Same selection signal the rest of the app
  // already listens to (3D pillars, 2D React Flow, ModulePanel, etc.).
  const handlePick = (clickX: number, clickZ: number) => {
    if (!activeField) return;
    const id = pickNearestNode(
      clickX,
      clickZ,
      graphData.nodes,
      layout,
      activeField,
    );
    if (id) {
      setSelectedNode(id);
      const node = graphData.nodes.find((n) => n.id === id);
      setPickHint(node?.label ?? id);
      window.setTimeout(() => setPickHint(null), 1400);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <CanvasWatermark />
      <DAGOverlay />
      <Canvas
        camera={{ position: [400, 250, 400], fov: 50, near: 1, far: 5000 }}
        style={{
          background: "#050508",
          position: "absolute",
          inset: 0,
          touchAction: "none",
        }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[200, 300, 200]}
          intensity={0.85}
          color="#ffffff"
        />
        <pointLight
          position={[-300, 200, -200]}
          intensity={0.45}
          color="#7c4dff"
        />
        <pointLight
          position={[0, 100, 350]}
          intensity={0.35}
          color="#00e5ff"
        />

        {!isEmpty && activeField && (
          <ReliefGrid width={activeField.width} height={activeField.height} />
        )}
        {!isEmpty && activeField && (
          <ReliefMesh
            field={activeField}
            norms={fusedField?.norms}
            onPick={handlePick}
          />
        )}
        {!isEmpty && (
          <SelectionMarkers layout={layout} field={activeField} />
        )}
        {!isEmpty && <NodeLabels anchors={anchors} />}
        {!isEmpty && activeField && (
          <CameraSetup
            width={activeField.width}
            height={activeField.height}
            enabled
          />
        )}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          minDistance={20}
          maxDistance={3000}
          maxPolarAngle={Math.PI * 0.49}
        />
      </Canvas>
      {!isEmpty && multilayer && fusedField && (
        <DomainLegend field={fusedField} />
      )}
      {pickHint && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded border border-accent-cyan/60 bg-surface-elevated/90 backdrop-blur-sm pointer-events-none">
          <div className="text-[9px] font-mono text-accent-cyan">
            SELECTED: {pickHint}
          </div>
        </div>
      )}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-[10px] font-mono text-text-muted">
            NO LAYOUT — IMPORT A GRAPH
          </div>
        </div>
      )}
    </div>
  );
}
