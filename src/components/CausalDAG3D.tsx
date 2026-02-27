"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useApexStore } from "@/stores/useApexStore";
import { computeLayout3D } from "@/lib/graph-layout";
import DAGNode3D from "./dag3d/DAGNode3D";
import DAGEdge3D from "./dag3d/DAGEdge3D";
import DAGOverlay from "./dag3d/DAGOverlay";

export default function CausalDAG3D() {
  const {
    graphData,
    truthFilter,
    interventionMode,
    interventionTarget,
    setInterventionTarget,
  } = useApexStore();

  const positions = useMemo(
    () => computeLayout3D(graphData.nodes, graphData.edges),
    [graphData]
  );

  const posMap = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    positions.forEach((p) => {
      map[p.id] = [p.x, p.y, p.z];
    });
    return map;
  }, [positions]);

  // Determine downstream nodes from intervention target
  const downstreamNodes = useMemo(() => {
    if (!interventionMode || !interventionTarget) return new Set<string>();
    const downstream = new Set<string>();
    const queue = [interventionTarget];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of graphData.edges) {
        if (edge.source === current && !downstream.has(edge.target)) {
          downstream.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    return downstream;
  }, [interventionMode, interventionTarget, graphData.edges]);

  const upstreamEdges = useMemo(() => {
    if (!interventionMode || !interventionTarget) return new Set<string>();
    const upstream = new Set<string>();
    for (const edge of graphData.edges) {
      if (edge.target === interventionTarget) {
        upstream.add(edge.id);
      }
    }
    return upstream;
  }, [interventionMode, interventionTarget, graphData.edges]);

  return (
    <div className="w-full h-full relative">
      <DAGOverlay />
      <Canvas
        camera={{ position: [0, 0, 120], fov: 60 }}
        style={{ background: "#050508" }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[50, 50, 50]} intensity={0.8} color="#00e5ff" />
        <pointLight position={[-50, -50, -30]} intensity={0.4} color="#7c4dff" />

        {/* Nodes */}
        {graphData.nodes.map((node) => {
          const pos = posMap[node.id];
          if (!pos) return null;

          const isTarget = interventionTarget === node.id;
          const isRestricted = truthFilter === "verified" && node.isRestricted;

          return (
            <DAGNode3D
              key={node.id}
              node={node}
              position={pos}
              isInterventionTarget={isTarget}
              isVerifiedRestricted={isRestricted}
              onClick={() => {
                if (interventionMode) {
                  setInterventionTarget(
                    interventionTarget === node.id ? null : node.id
                  );
                }
              }}
            />
          );
        })}

        {/* Edges */}
        {graphData.edges.map((edge) => {
          const srcPos = posMap[edge.source];
          const tgtPos = posMap[edge.target];
          if (!srcPos || !tgtPos) return null;

          const isHighlighted =
            interventionMode &&
            interventionTarget !== null &&
            (edge.source === interventionTarget ||
              downstreamNodes.has(edge.source));

          const isDimmed =
            interventionMode &&
            interventionTarget !== null &&
            upstreamEdges.has(edge.id);

          const isInconsistent =
            truthFilter === "verified" && edge.isInconsistent;

          return (
            <DAGEdge3D
              key={edge.id}
              edge={edge}
              sourcePos={srcPos}
              targetPos={tgtPos}
              isHighlighted={isHighlighted}
              isDimmed={isDimmed}
              isVerifiedInconsistent={isInconsistent}
            />
          );
        })}

        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
        />

        <EffectComposer>
          <Bloom
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            intensity={0.8}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
