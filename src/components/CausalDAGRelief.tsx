"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { compute2DForceLayout } from "@/lib/graph-layout-2d";
import { computeReliefField, type ReliefField } from "@/lib/graph-relief-field";
import CanvasWatermark from "./CanvasWatermark";
import DAGOverlay from "./dag3d/DAGOverlay";

/**
 * Topographic / "Relief" view — 4th rendering mode. Reads the network as a
 * scalar criticality field over the existing 2D force layout: peaks where
 * high-ΩF nodes cluster, valleys where it's quiet. v1 is single-domain
 * (uses ΩF composite). Multilayer with per-domain colored stacks is a
 * future extension and would render multiple translucent meshes.
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

  // Dispose the geometry when this component unmounts or field swaps so we
  // don't leak GPU buffers across graph imports.
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
 * Sets the camera to a sensible initial framing the first time a non-empty
 * field is rendered, then leaves it to OrbitControls. Subsequent graph
 * changes don't re-frame so the user's manual orbit is preserved.
 */
function CameraSetup({ field }: { field: ReliefField }) {
  const { camera } = useThree();
  const framedRef = useRef(false);

  useEffect(() => {
    if (framedRef.current) return;
    if (field.positions.length === 0) return;
    const dist = Math.max(field.width, field.height, 200) * 0.65;
    camera.position.set(dist * 0.85, dist * 0.55, dist * 0.85);
    camera.lookAt(0, 0, 0);
    framedRef.current = true;
  }, [camera, field]);

  return null;
}

export default function CausalDAGRelief() {
  const graphData = useFilteredGraph();

  // Reuse the existing 2D force layout so peaks land exactly where nodes
  // sit on the 2D canvas — switching between views feels coherent.
  const layout = useMemo(
    () => compute2DForceLayout(graphData.nodes, graphData.edges),
    [graphData.nodes, graphData.edges],
  );

  const field = useMemo(
    () => computeReliefField(graphData.nodes, layout),
    [graphData.nodes, layout],
  );

  const isEmpty = field.positions.length === 0;

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

        {!isEmpty && (
          <>
            <ReliefMesh field={field} />
            <CameraSetup field={field} />
          </>
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
