"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
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
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(layer.field.positions, 3),
    );
    geom.setAttribute(
      "color",
      new THREE.BufferAttribute(layer.field.colors, 3),
    );
    geom.setIndex(new THREE.BufferAttribute(layer.field.indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, [layer.field]);

  useEffect(() => () => geometry.dispose(), [geometry]);

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
