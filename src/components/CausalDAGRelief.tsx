"use client";

import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { useApexStore } from "@/stores/useApexStore";
import { compute2DForceLayout } from "@/lib/graph-layout-2d";
import {
  computeReliefField,
  computeReliefLayers,
  type ReliefField,
  type ReliefLayer,
} from "@/lib/graph-relief-field";
import CanvasWatermark from "./CanvasWatermark";
import DAGOverlay from "./dag3d/DAGOverlay";

/**
 * Class-based error boundary — keeps a render error inside the Relief view
 * from tearing down the whole app to Next.js's generic "Application error"
 * fallback. We log to the console (visible in DevTools / Vercel logs) and
 * show a small in-pane fallback so the rest of the UI stays interactive.
 */
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
 * Multi-domain graphs split into per-domain meshes with additive blending —
 * each domain tinted by its color, peaks add together where domains overlap
 * (e.g. red + cyan = magenta where both are critical at the same spot).
 */

function ReliefMesh({ field }: { field: ReliefField }) {
  // BufferGeometry rebuilt only when the field changes — graph topology /
  // ΩF value change. Hover and orbit don't trigger recompute.
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    if (field.positions.length === 0) return geom;
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(field.positions, 3),
    );
    geom.setAttribute(
      "color",
      new THREE.BufferAttribute(field.colors, 3),
    );
    geom.setIndex(new THREE.BufferAttribute(field.indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, [field]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (field.positions.length === 0) return null;

  return (
    <mesh geometry={geometry} castShadow={false} receiveShadow={false}>
      <meshStandardMaterial
        vertexColors
        roughness={0.65}
        metalness={0.05}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
}

/**
 * Per-domain mesh used in multilayer mode. Vertex colors are pre-tinted by
 * domain color × elevation gamma, and the material uses additive blending so
 * overlapping peaks color-mix on the GPU. Lighting is intentionally bypassed
 * (`emissive`-style additive read) — we want the colors to be unambiguous
 * domain reads, not modulated by surface normals.
 */
function ReliefLayerMesh({ layer }: { layer: ReliefLayer }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    if (layer.field.positions.length === 0) return geom;
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(layer.field.positions, 3),
    );
    geom.setAttribute(
      "color",
      new THREE.BufferAttribute(layer.field.colors, 3),
    );
    geom.setIndex(new THREE.BufferAttribute(layer.field.indices, 1));
    return geom;
  }, [layer.field]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (layer.field.positions.length === 0) return null;

  return (
    <mesh geometry={geometry} castShadow={false} receiveShadow={false}>
      <meshBasicMaterial
        vertexColors
        side={THREE.DoubleSide}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Sets the camera to a sensible initial framing the first time a non-empty
 * field is rendered, then leaves it to OrbitControls. Subsequent graph
 * changes don't re-frame so the user's manual orbit is preserved.
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
    const dist = Math.max(width, height, 200) * 0.65;
    camera.position.set(dist * 0.85, dist * 0.55, dist * 0.85);
    camera.lookAt(0, 0, 0);
    framedRef.current = true;
  }, [camera, width, height, enabled]);

  return null;
}

function DomainLegend({ layers }: { layers: ReliefLayer[] }) {
  if (layers.length < 2) return null;
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 px-3 py-2 rounded border border-border bg-surface-elevated/80 backdrop-blur-sm pointer-events-none">
      <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
        DOMAIN LAYERS · {layers.length}
      </div>
      {layers.map((l) => (
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

export default function CausalDAGRelief() {
  return (
    <ReliefErrorBoundary>
      <CausalDAGReliefInner />
    </ReliefErrorBoundary>
  );
}

/**
 * Cyan markers at selected node positions.
 *
 * The Relief view is a continuous heightfield, not discrete node renders, so
 * neither the singular `selectedNode` nor the multi-select array
 * (`selectedNodes`, written by the domain legend / shift-drag marquee) was
 * visible here at all. This component renders a tall cyan pillar + glowing
 * top sphere at each selected node's (x, y) layout position so users get the
 * same "where is my selection" reading they get in the 3D / 2D / Map views.
 *
 * Pillar height (110) is intentionally taller than the relief's max
 * heightScale (70) so markers always poke through the surface regardless of
 * where the underlying field happens to peak.
 */
function SelectionMarkers({
  layout,
}: {
  layout: Map<string, { x: number; y: number }>;
}) {
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);

  const markers = useMemo(() => {
    if (layout.size === 0) return [];
    // Mirror the bounds + padding the relief uses so marker world coords
    // line up with the heightfield. See computeReliefField in
    // src/lib/graph-relief-field.ts — keep the padding constant in sync.
    const PADDING = 80;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of layout.values()) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) return [];
    minX -= PADDING; maxX += PADDING;
    minY -= PADDING; maxY += PADDING;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Multi-select takes priority but still surface the singular selection
    // when nothing else is selected (e.g. user clicked a top-Ω node).
    const ids = new Set<string>(selectedNodes);
    if (selectedNode) ids.add(selectedNode);

    const out: { id: string; x: number; z: number }[] = [];
    for (const id of ids) {
      const p = layout.get(id);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      out.push({ id, x: p.x - cx, z: p.y - cy });
    }
    return out;
  }, [layout, selectedNode, selectedNodes]);

  if (markers.length === 0) return null;

  const PILLAR_HEIGHT = 110;
  const PILLAR_RADIUS = 1.4;

  return (
    <group>
      {markers.map((m) => (
        <group key={m.id} position={[m.x, 0, m.z]}>
          {/* Pillar: thin cyan cylinder rising from y=0 through the surface. */}
          <mesh position={[0, PILLAR_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[PILLAR_RADIUS, PILLAR_RADIUS, PILLAR_HEIGHT, 10]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.65} />
          </mesh>
          {/* Outer pillar halo for a soft glow. */}
          <mesh position={[0, PILLAR_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[PILLAR_RADIUS * 2.2, PILLAR_RADIUS * 2.2, PILLAR_HEIGHT, 10]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.12} />
          </mesh>
          {/* Cap: glowing sphere at the top so the marker reads from above
              even when camera is high enough to see straight down. */}
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

function CausalDAGReliefInner() {
  const graphData = useFilteredGraph();

  // Reuse the existing 2D force layout so peaks land exactly where nodes
  // sit on the 2D canvas — switching between views feels coherent.
  const layout = useMemo(
    () => compute2DForceLayout(graphData.nodes, graphData.edges),
    [graphData.nodes, graphData.edges],
  );

  // Decide the rendering mode from the unique-domain count. Multilayer kicks
  // in at ≥2 distinct domains; otherwise the elevation-ramp single mesh reads
  // more naturally for a single subgraph.
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

  const layers = useMemo(
    () =>
      multilayer
        ? computeReliefLayers(graphData.nodes, layout)
        : [],
    [multilayer, graphData.nodes, layout],
  );

  const isEmpty = multilayer
    ? layers.length === 0
    : !singleField || singleField.positions.length === 0;

  // Use the first layer (or the single field) for camera framing dimensions.
  const frameDims = multilayer
    ? layers[0]?.field
    : singleField ?? undefined;

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
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[200, 300, 200]}
          intensity={0.7}
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

        {!isEmpty && !multilayer && singleField && (
          <ReliefMesh field={singleField} />
        )}
        {!isEmpty && multilayer && layers.map((l) => (
          <ReliefLayerMesh key={l.domain} layer={l} />
        ))}
        {!isEmpty && <SelectionMarkers layout={layout} />}
        {!isEmpty && frameDims && (
          <CameraSetup
            width={frameDims.width}
            height={frameDims.height}
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
      {!isEmpty && multilayer && <DomainLegend layers={layers} />}
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
