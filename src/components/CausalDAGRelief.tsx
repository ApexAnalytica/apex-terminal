"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { useApexStore } from "@/stores/useApexStore";
import { compute2DForceLayout, graphSignature } from "@/lib/graph-layout-2d";
import type { EpochSnapshot } from "@/lib/types";
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
  // Multiplied into the final colour. Drives the "dim the surface to
  // foreground a multi-selection" mode — at 1.0 the surface renders
  // normally, at 0.4 mountains read as faded context behind the
  // selection's pillars.
  uniform float uSurfaceTint;

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

    gl_FragColor = vec4(surface * light * uSurfaceTint, 1.0);
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
  surfaceTint = 1,
}: {
  field: ReliefField;
  /** Per-vertex normalised height. Present for fused-mode renders; the
   *  single-domain path falls back to vertex-colour rendering. */
  norms?: Float32Array;
  onPick?: (clickX: number, clickZ: number) => void;
  /** 0..1 multiplier on final surface colour. Parent passes 0.4 when a
   *  multi-selection is active without isolate mode, so the mountains
   *  fade into context while the cyan selection pillars stay vivid.
   *  Default 1 = normal rendering. */
  surfaceTint?: number;
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

  // Uniforms — built once via lazy useState so the GPU-side reference
  // is stable. The `uSurfaceTint` field is mutated imperatively below
  // via an attached ref to the shaderMaterial; that's the canonical
  // r3f pattern for cheap per-frame uniform updates and avoids
  // rebuilding the shader pipeline on every tint change.
  const [uniforms] = useState(() => ({
    uLightDir: { value: new THREE.Vector3(0.45, 1.0, 0.6).normalize() },
    uBands: { value: 14 },
    uLineWidth: { value: 0.04 },
    uSurfaceTint: { value: 1 },
  }));
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  useEffect(() => {
    const mat = materialRef.current;
    if (mat) mat.uniforms.uSurfaceTint.value = surfaceTint;
  }, [surfaceTint]);

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
          ref={materialRef}
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
          transparent={surfaceTint < 1}
          opacity={surfaceTint}
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

/* The previous DOM-side `ElevationLegend` (right-edge vertical strip)
 * was replaced by `InSceneElevationLegend` below — see its docstring for
 * why the in-canvas placement makes the gradient directly comparable to
 * the actual mountain heights instead of just being a screen-space chip. */

/** JS-side mirror of the shader's elevationColor — keep in lockstep with the
 *  ramp baked into TOPO_FRAGMENT_SHADER and graph-relief-field's
 *  elevationColor(). Used by the legend to paint a CSS gradient that visually
 *  matches the surface. */
function elevationColorJS(t: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, t));
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  if (n < 0.25) {
    const k = n / 0.25;
    return [lerp(0.04, 0.0, k), lerp(0.05, 0.9, k), lerp(0.18, 1.0, k)];
  }
  if (n < 0.55) {
    const k = (n - 0.25) / 0.3;
    return [lerp(0.0, 1.0, k), lerp(0.9, 0.67, k), lerp(1.0, 0.0, k)];
  }
  const k = Math.min(1, (n - 0.55) / 0.45);
  return [1.0, lerp(0.67, 0.09, k), lerp(0.0, 0.27, k)];
}

/**
 * In-scene elevation legend. Stands vertically inside the canvas at the
 * SE edge of the field so its physical height (= 0..heightScale, the
 * exact same world-space units the surface lives in) lets the user
 * eyeball any mountain peak's Ω by tracing horizontally to the column.
 *
 * Earlier this was a DOM strip pinned to the right edge of the screen;
 * the user pointed out it was disconnected from the math because the
 * pixel positions had no relationship to the actual peak heights.
 *
 * Texture is a 1×128 vertical CanvasTexture sampling elevationColorJS
 * at every row — same ramp the fragment shader paints onto the surface.
 */
function InSceneElevationLegend({
  field,
  peakOmega,
  peakAnchor,
}: {
  field: ReliefField;
  peakOmega: number;
  /** World-space (x, z) of the highest-Ω node, in the same translated
   *  coordinate frame the surface uses (i.e. cx/cy already subtracted).
   *  When provided, the column stands right next to the peak so the
   *  user can directly compare the column's Ω ticks against the peak's
   *  height. Falls back to the SE corner of the field if absent. */
  peakAnchor?: { x: number; z: number };
}) {
  const HEIGHT = 140; // matches DEFAULT_OPTIONS.heightScale in graph-relief-field
  const HEIGHT_GAMMA = 1.6; // matches heightGamma — keep in sync

  // 1×N gradient texture. Memoised on peakOmega? No — the ramp is constant
  // (it's purely a function of normalised t), so build once.
  const texture = useMemo(() => {
    const N = 128;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = N;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    for (let i = 0; i < N; i++) {
      const t = (N - 1 - i) / (N - 1); // bottom = 0, top = 1
      const [r, g, b] = elevationColorJS(t);
      ctx.fillStyle = `rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`;
      ctx.fillRect(0, i, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Park the column right next to the highest peak so the user can read
  // a mountain's Ω directly off the legend at the same horizontal sight
  // line. The earlier placement was the SE corner of the field, which
  // the user pointed out was disconnected from the visual it was meant
  // to explain. The +12 unit offset is far enough to keep the column
  // out of the mountain's slope but close enough that the comparison
  // is immediate. Falls back to the SE corner if no anchor is supplied
  // (e.g. before the layout's settled).
  const cornerX = peakAnchor ? peakAnchor.x + 12 : field.width / 2 + 30;
  const cornerZ = peakAnchor ? peakAnchor.z + 12 : field.height / 2 + 30;

  // Convert tick Ω values back to the world height the surface would
  // assign them. Peak label sits at top of column (Ω = peakOmega), Ω 0
  // at base. Two intermediate ticks (1/3, 2/3) match the surface's
  // gamma-shaped elevation curve so they line up with what the eye reads
  // off a mountain at the same height.
  const ticks = [
    { omega: 0, y: 0, label: "0" },
    {
      omega: peakOmega / 3,
      y: Math.pow(1 / 3, HEIGHT_GAMMA) * HEIGHT,
      label: (peakOmega / 3).toFixed(1),
    },
    {
      omega: (2 * peakOmega) / 3,
      y: Math.pow(2 / 3, HEIGHT_GAMMA) * HEIGHT,
      label: ((2 * peakOmega) / 3).toFixed(1),
    },
    { omega: peakOmega, y: HEIGHT, label: peakOmega.toFixed(1) },
  ];

  if (!texture) return null;

  return (
    <group position={[cornerX, 0, cornerZ]}>
      {/* Column — a thin upright plane facing the camera arc. Width is
          small (4 world units) so it reads as a totem, not a wall. */}
      <mesh position={[0, HEIGHT / 2, 0]}>
        <planeGeometry args={[4, HEIGHT]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
      </mesh>
      {/* Tick marks — thin horizontal bars at each Ω level. Drawn as
          slightly oversized planes so they protrude past the column. */}
      {ticks.map((t) => (
        <mesh key={t.omega} position={[0, t.y, 0]}>
          <planeGeometry args={[6.5, 0.6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
        </mesh>
      ))}
      {/* Labels — Html drei billboards. Project from world space so they
          stay anchored to their Ω level even as the camera orbits. */}
      {ticks.map((t) => (
        <Html
          key={`l-${t.omega}`}
          position={[5, t.y, 0]}
          center={false}
          distanceFactor={120}
          style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 11,
              color: t.omega === peakOmega ? "#ff5566" : "rgba(220,220,230,0.85)",
              textShadow: "0 0 4px rgba(0,0,0,0.85)",
            }}
          >
            {"Ω "}
            {t.label}
          </span>
        </Html>
      ))}
      <Html
        position={[0, HEIGHT + 12, 0]}
        center
        distanceFactor={120}
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <span
          style={{
            fontFamily: "var(--font-michroma, sans-serif)",
            fontSize: 9,
            letterSpacing: "0.15em",
            color: "rgba(180,180,200,0.8)",
            textShadow: "0 0 4px rgba(0,0,0,0.85)",
          }}
        >
          Ω INTENSITY
        </span>
      </Html>
    </group>
  );
}

function SelectionMarkers({
  layout,
  field,
  edges,
}: {
  layout: Map<string, { x: number; y: number }>;
  field: ReliefField | null | undefined;
  edges: { source: string; target: string }[];
}) {
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);

  // Two marker tiers so TOPO matches the spotlight semantics of 2D/3D:
  //   - "primary" — explicitly selected (single-click or marquee). Tall,
  //     bright cyan pillar with a glowing sphere on top.
  //   - "neighbour" — adjacent to a primary selection. Shorter, dimmer
  //     pillar without the sphere cap. Mirrors the "select node + its
  //     nearest neighbours" effect the user already gets in 2D and 3D.
  const { primary, neighbours } = useMemo(() => {
    if (!field || layout.size === 0) return { primary: [], neighbours: [] };
    const primaryIds = new Set<string>(selectedNodes);
    if (selectedNode) primaryIds.add(selectedNode);

    const neighbourIds = new Set<string>();
    if (primaryIds.size > 0) {
      for (const e of edges) {
        if (primaryIds.has(e.source) && !primaryIds.has(e.target)) {
          neighbourIds.add(e.target);
        } else if (primaryIds.has(e.target) && !primaryIds.has(e.source)) {
          neighbourIds.add(e.source);
        }
      }
    }

    const project = (id: string) => {
      const p = layout.get(id);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return { id, x: p.x - field.cx, z: p.y - field.cy };
    };
    const primary: { id: string; x: number; z: number }[] = [];
    for (const id of primaryIds) {
      const m = project(id);
      if (m) primary.push(m);
    }
    const neighbours: { id: string; x: number; z: number }[] = [];
    for (const id of neighbourIds) {
      const m = project(id);
      if (m) neighbours.push(m);
    }
    return { primary, neighbours };
  }, [layout, field, edges, selectedNode, selectedNodes]);

  if (primary.length === 0 || !field) return null;

  const PILLAR_HEIGHT = 140;
  const PILLAR_RADIUS = 1.4;
  const NEIGHBOUR_HEIGHT = 70;
  const NEIGHBOUR_RADIUS = 0.8;

  return (
    <group>
      {primary.map((m) => (
        <group key={`p-${m.id}`} position={[m.x, 0, m.z]}>
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
      {neighbours.map((m) => (
        <group key={`n-${m.id}`} position={[m.x, 0, m.z]}>
          <mesh position={[0, NEIGHBOUR_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[NEIGHBOUR_RADIUS, NEIGHBOUR_RADIUS, NEIGHBOUR_HEIGHT, 8]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.32} />
          </mesh>
          <mesh position={[0, NEIGHBOUR_HEIGHT, 0]}>
            <sphereGeometry args={[1.4, 10, 10]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Shift+drag lasso for the topology canvas. Same pattern as the 3D and
 * 2D views: attach pointer listeners on the WebGL canvas DOM element,
 * track a screen-space rect, project each node's ground-plane position
 * (layout.xy minus the field origin offset) into screen coordinates on
 * release, and hit-test against the rect.
 *
 * Lives inside the Canvas so it can grab `useThree` (camera + canvas
 * size). Renders nothing — selection rect is drawn as a DOM overlay by
 * the parent.
 */
function TopoShiftMarquee({
  layout,
  field,
  graphNodes,
  selectionBoxRef,
  setSelectionRect,
  setShiftDragging,
  onSelect,
}: {
  layout: Map<string, { x: number; y: number }>;
  field: ReliefField | null | undefined;
  graphNodes: { id: string }[];
  selectionBoxRef: React.MutableRefObject<{ x1: number; y1: number; x2: number; y2: number } | null>;
  setSelectionRect: (r: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  setShiftDragging: (b: boolean) => void;
  onSelect: (ids: string[]) => void;
}) {
  const { camera, gl, size: canvasSize } = useThree();
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      dragging.current = true;
      setShiftDragging(true);
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      startRef.current = { x, y };
      selectionBoxRef.current = { x1: x, y1: y, x2: x, y2: y };
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y });
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const rect = canvas.getBoundingClientRect();
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;
      const box = { x1: startRef.current.x, y1: startRef.current.y, x2, y2 };
      selectionBoxRef.current = box;
      setSelectionRect(box);
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setShiftDragging(false);
      const b = selectionBoxRef.current;
      if (!b) return;

      const minX = Math.min(b.x1, b.x2);
      const maxX = Math.max(b.x1, b.x2);
      const minY = Math.min(b.y1, b.y2);
      const maxY = Math.max(b.y1, b.y2);

      selectionBoxRef.current = null;
      setSelectionRect(null);

      // Ignore tiny drags so a normal shift-click doesn't clobber state.
      if (maxX - minX < 5 && maxY - minY < 5) return;
      if (!field) return;

      // Project each node's ground-plane position to NDC, then to pixels.
      // The TOPO scene places nodes at (layout.x - field.cx, 0, layout.y -
      // field.cy) — same translation `SelectionMarkers` uses — so peaks
      // rise vertically above their xz base. We hit-test the base, which
      // is what the user visually associates with the node.
      const ids: string[] = [];
      const vec = new THREE.Vector3();
      for (const node of graphNodes) {
        const p = layout.get(node.id);
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        vec.set(p.x - field.cx, 0, p.y - field.cy).project(camera);
        const sx = ((vec.x + 1) / 2) * canvasSize.width;
        const sy = ((-vec.y + 1) / 2) * canvasSize.height;
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
          ids.push(node.id);
        }
      }
      onSelect(ids);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [gl, layout, field, graphNodes, camera, canvasSize, onSelect, selectionBoxRef, setSelectionRect, setShiftDragging]);

  return null;
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
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);
  const [pickHint, setPickHint] = useState<string | null>(null);

  // Shift+drag marquee state — mirrors the pattern in CausalDAG3D /
  // CausalDAG2D / CausalDAGMap so the user can lasso a region of the
  // topology and have those nodes selected across views (2D / 3D /
  // TOPO / Map all read the same `selectedNodes` slice in the store).
  const selectionBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [shiftDragging, setShiftDragging] = useState(false);
  const handleShiftSelect = useCallback(
    (ids: string[]) => {
      if (ids.length > 0) setSelectedNodes(ids);
    },
    [setSelectedNodes],
  );

  // Replay state — when a cascade is being scrubbed, the current epoch's
  // snapshot drives the topo's height field instead of the static node
  // ΩF. This is what turns the view from "one frame of the network" into
  // "watch the system fail in slow motion".
  const replayActive = useApexStore((s) => s.replayActive);
  const activeTimeline = useApexStore((s) => s.activeTimeline);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const currentEpoch = useApexStore((s) => s.currentEpoch);

  const currentSnapshot: EpochSnapshot | null = useMemo(() => {
    const epochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
    if (!replayActive || epochs.length === 0) return null;
    const idx = Math.min(currentEpoch, Math.max(0, epochs.length - 1));
    return epochs[idx] ?? null;
  }, [replayActive, activeTimeline, baselineEpochs, interventionEpochs, currentEpoch]);

  // Stable layout key. `useFilteredGraph` returns NEW node + edge object
  // references whenever the temporal hook re-runs (every scrub tick), so
  // a naive useMemo on `[graphData.nodes, graphData.edges]` would re-run
  // the force-directed simulation each tick — the canvas would reshuffle
  // mid-replay, and the field eval below would compete for the main
  // thread. Keying off the structural signature (sorted node + edge ids)
  // pins layout to topology only — exhaustive-deps disabled for the
  // memo body because reading the latest references is intentional only
  // when sig changes.
  const sig = useMemo(
    () => graphSignature(graphData.nodes, graphData.edges),
    [graphData.nodes, graphData.edges],
  );
  const layout = useMemo(
    () => compute2DForceLayout(graphData.nodes, graphData.edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  );

  // Multi-select / isolate state. TOPO mirrors the spotlight semantics
  // of 2D / 3D / Map: a multi-selection focuses the user's attention on
  // a subset, and the rest of the canvas is contextual. Two modes:
  //   - isolate ON  → recompute the field using ONLY the selected
  //     subset, so non-selected mountains literally don't render.
  //   - isolate OFF → keep all mountains, but tint the surface to ~0.4
  //     so the cyan selection pillars (and the new neighbour pillars)
  //     read as the foreground.
  const selectedNodesArr = useApexStore((s) => s.selectedNodes);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const multiSelectedSet = useMemo(
    () => new Set(selectedNodesArr),
    [selectedNodesArr],
  );

  // Field-input nodes. When a replay snapshot is active, override each
  // node's `omegaFragility.composite` with the snapshot's per-node
  // ΩF — the mountain at node N now grows / shrinks as the cascade
  // propagates. When no snapshot is active, fall through to graphData
  // unchanged so the static view stays cheap.
  const fieldNodes = useMemo(() => {
    let nodes = graphData.nodes;
    if (currentSnapshot) {
      nodes = nodes.map((n) => {
        const state = currentSnapshot.nodeStates[n.id];
        if (!state) return n;
        return {
          ...n,
          omegaFragility: { ...n.omegaFragility, composite: state.omegaComposite },
        };
      });
    }
    if (isolateSelection && multiSelectedSet.size > 0) {
      nodes = nodes.filter((n) => multiSelectedSet.has(n.id));
    }
    return nodes;
  }, [graphData.nodes, currentSnapshot, isolateSelection, multiSelectedSet]);

  const surfaceTint =
    !isolateSelection && multiSelectedSet.size > 0 ? 0.4 : 1;

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
        : computeReliefField(fieldNodes, layout),
    [multilayer, fieldNodes, layout],
  );

  const fusedField = useMemo(
    () =>
      multilayer
        ? computeFusedReliefField(fieldNodes, layout)
        : null,
    [multilayer, fieldNodes, layout],
  );

  const activeField: ReliefField | null =
    (multilayer ? fusedField : singleField) ?? null;
  const isEmpty = !activeField || activeField.positions.length === 0;

  // Max Ω composite across the visible (replay-aware) graph — drives
  // the elevation legend's "PEAK Ω" label so users have a numeric
  // anchor for the heatmap. Also surface the peak node so the in-scene
  // legend can stand next to the tallest mountain.
  const { peakOmega, peakNodeId } = useMemo(() => {
    let max = 0;
    let id: string | null = null;
    for (const n of fieldNodes) {
      const c = n.omegaFragility?.composite;
      if (typeof c === "number" && Number.isFinite(c) && c > max) {
        max = c;
        id = n.id;
      }
    }
    return { peakOmega: max, peakNodeId: id };
  }, [fieldNodes]);

  // Peak node's translated (x, z) in the same coordinate frame the
  // surface uses (cx/cy already subtracted). Recomputes when the peak
  // identity or layout changes, so cascade replay re-anchors the
  // legend to whichever node is currently tallest.
  const peakAnchor = useMemo<{ x: number; z: number } | undefined>(() => {
    if (!activeField || !peakNodeId) return undefined;
    const p = layout.get(peakNodeId);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined;
    return { x: p.x - activeField.cx, z: p.y - activeField.cy };
  }, [activeField, peakNodeId, layout]);

  const anchors = useMemo<NodeAnchor[]>(() => {
    if (!activeField || isEmpty) return [];
    // Use fieldNodes (replay-aware) so label Ω values match what the
    // surface is actually showing during a replay.
    return computeNodeAnchors(fieldNodes, layout, activeField, {}, 40);
  }, [activeField, isEmpty, fieldNodes, layout]);

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
            surfaceTint={surfaceTint}
          />
        )}
        {!isEmpty && (
          <SelectionMarkers layout={layout} field={activeField} edges={graphData.edges} />
        )}
        {!isEmpty && activeField && peakOmega > 0 && (
          <InSceneElevationLegend
            field={activeField}
            peakOmega={peakOmega}
            peakAnchor={peakAnchor}
          />
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
          // Disable orbit while shift-dragging so the camera doesn't
          // rotate alongside the marquee gesture.
          enabled={!shiftDragging}
        />
        {!isEmpty && activeField && (
          <TopoShiftMarquee
            layout={layout}
            field={activeField}
            graphNodes={graphData.nodes}
            selectionBoxRef={selectionBoxRef}
            setSelectionRect={setSelectionRect}
            setShiftDragging={setShiftDragging}
            onSelect={handleShiftSelect}
          />
        )}
      </Canvas>
      {selectionRect && (
        <div
          className="absolute pointer-events-none border border-accent-cyan/80 bg-accent-cyan/10 z-50"
          style={{
            left: Math.min(selectionRect.x1, selectionRect.x2),
            top: Math.min(selectionRect.y1, selectionRect.y2),
            width: Math.abs(selectionRect.x2 - selectionRect.x1),
            height: Math.abs(selectionRect.y2 - selectionRect.y1),
          }}
        />
      )}
      {!isEmpty && multilayer && fusedField && (
        <DomainLegend field={fusedField} />
      )}
      {/* ElevationLegend (DOM, right edge) has been replaced by
          InSceneElevationLegend, which renders a vertical column
          inside the Canvas at the SE corner of the field. The column's
          physical height matches the surface's heightScale, so the
          user can compare a peak's height directly to the legend's
          Ω ticks. */}
      {currentSnapshot && (
        <div className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded border border-accent-amber/60 bg-surface-elevated/90 backdrop-blur-sm pointer-events-none">
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
            REPLAY · EPOCH {currentEpoch + 1}
            {(() => {
              const epochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
              return epochs.length ? ` / ${epochs.length}` : "";
            })()}
          </div>
        </div>
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
