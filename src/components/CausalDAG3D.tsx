"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useApexStore } from "@/stores/useApexStore";
import { computeLayout3D, NodePosition } from "@/lib/graph-layout";
import { severEdgeAndSpawnConsequences } from "@/lib/intervention-engine";
import { getNodeDomainMap } from "@/lib/graph-data";
import DAGNode3D from "./dag3d/DAGNode3D";
import DAGEdge3D from "./dag3d/DAGEdge3D";
import DAGOverlay from "./dag3d/DAGOverlay";

// Error boundary to catch WebGL context loss and recover
class DAGErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; retryCount: number }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn("[DAG3D] Caught render error, will retry:", error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-background gap-3">
          <div className="text-[10px] font-mono text-accent-red">
            WEBGL CONTEXT LOST
          </div>
          <button
            className="text-[9px] font-mono px-3 py-1.5 rounded border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
            onClick={() =>
              this.setState((s) => ({
                hasError: false,
                retryCount: s.retryCount + 1,
              }))
            }
          >
            REINITIALIZE RENDERER
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const HOME_POS = new THREE.Vector3(40, 30, 80);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);

function CameraRig({
  posMap,
}: {
  posMap: Record<string, [number, number, number]>;
}) {
  const { camera } = useThree();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const animating = useRef(false);
  const progress = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const endTarget = useRef(new THREE.Vector3());

  const orbitControlsRef = useRef<any>(null);

  useEffect(() => {
    if (selectedNode && posMap[selectedNode]) {
      const [nx, ny, nz] = posMap[selectedNode];
      startPos.current.copy(camera.position);
      endPos.current.set(nx + 18, ny + 14, nz + 30);
      startTarget.current.copy(
        orbitControlsRef.current?.target ?? HOME_TARGET
      );
      endTarget.current.set(nx, ny, nz);
      progress.current = 0;
      animating.current = true;
      setControlsEnabled(false);
    } else if (!selectedNode) {
      startPos.current.copy(camera.position);
      endPos.current.copy(HOME_POS);
      startTarget.current.copy(
        orbitControlsRef.current?.target ?? HOME_TARGET
      );
      endTarget.current.copy(HOME_TARGET);
      progress.current = 0;
      animating.current = true;
      setControlsEnabled(false);
    }
  }, [selectedNode, posMap, camera]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    progress.current = Math.min(1, progress.current + delta * 2.5);
    const t = 1 - Math.pow(1 - progress.current, 3); // ease-out cubic

    camera.position.lerpVectors(startPos.current, endPos.current, t);
    if (orbitControlsRef.current) {
      orbitControlsRef.current.target.lerpVectors(
        startTarget.current,
        endTarget.current,
        t
      );
      orbitControlsRef.current.update();
    }

    if (progress.current >= 1) {
      animating.current = false;
      setControlsEnabled(true);
    }
  });

  return (
    <OrbitControls
      ref={orbitControlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      minDistance={5}
      maxDistance={400}
      enabled={controlsEnabled}
    />
  );
}

// Monitors WebGL context and forces remount on context loss
function useWebGLRecovery() {
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Find the canvas after mount
    const timer = setTimeout(() => {
      const canvas = document.querySelector("canvas");
      if (canvas) {
        canvasRef.current = canvas;
        const onLost = (e: Event) => {
          e.preventDefault();
          console.warn("[DAG3D] WebGL context lost — scheduling recovery");
          setTimeout(() => setCanvasKey((k) => k + 1), 1000);
        };
        canvas.addEventListener("webglcontextlost", onLost);
        return () => canvas.removeEventListener("webglcontextlost", onLost);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [canvasKey]);

  return canvasKey;
}

export default function CausalDAG3D() {
  const {
    graphData,
    setGraphData,
    truthFilter,
    interventionMode,
    interventionTarget,
    setInterventionTarget,
    selectedNode,
    setSelectedNode,
    scissorsMode,
    severedEdges,
    severEdge,
  } = useApexStore();

  const canvasKey = useWebGLRecovery();
  const positionsRef = useRef<NodePosition[]>([]);

  const positions = useMemo(() => {
    const result = computeLayout3D(
      graphData.nodes,
      graphData.edges,
      positionsRef.current.length > 0 ? positionsRef.current : undefined
    );
    positionsRef.current = result;
    return result;
  }, [graphData]);

  const posMap = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    positions.forEach((p) => {
      map[p.id] = [p.x, p.y, p.z];
    });
    return map;
  }, [positions]);

  const domainMap = useMemo(() => getNodeDomainMap(), []);

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

  // Compute neighbor nodes and connected edges for selection highlighting
  const { selectedNeighborNodes, selectedEdgeIds } = useMemo(() => {
    if (!selectedNode) return { selectedNeighborNodes: new Set<string>(), selectedEdgeIds: new Set<string>() };
    const neighbors = new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of graphData.edges) {
      if (edge.source === selectedNode) {
        neighbors.add(edge.target);
        edgeIds.add(edge.id);
      }
      if (edge.target === selectedNode) {
        neighbors.add(edge.source);
        edgeIds.add(edge.id);
      }
    }
    return { selectedNeighborNodes: neighbors, selectedEdgeIds: edgeIds };
  }, [selectedNode, graphData.edges]);

  // Compute greyed-out nodes: after a cut, nodes with Ω < 7 that are NOT downstream of cut points and NOT consequence nodes
  const greyedOutNodes = useMemo(() => {
    if (severedEdges.length === 0) return new Set<string>();
    // Find all cut targets (downstream of severed edges)
    const cutTargets = new Set<string>();
    for (const edgeId of severedEdges) {
      const edge = graphData.edges.find((e) => e.id === edgeId);
      if (edge) cutTargets.add(edge.target);
    }
    // BFS downstream from cut targets
    const downstreamOfCuts = new Set<string>(cutTargets);
    const queue = [...cutTargets];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of graphData.edges) {
        if (edge.source === current && !downstreamOfCuts.has(edge.target) && !edge.isSevered) {
          downstreamOfCuts.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    const greyed = new Set<string>();
    for (const node of graphData.nodes) {
      if (
        node.omegaFragility.composite < 7 &&
        !downstreamOfCuts.has(node.id) &&
        !node.isConsequence
      ) {
        greyed.add(node.id);
      }
    }
    return greyed;
  }, [severedEdges, graphData]);

  const handleScissorsClick = useCallback(
    (edgeId: string) => {
      severEdge(edgeId);
      const newGraph = severEdgeAndSpawnConsequences(graphData, edgeId);
      setGraphData(newGraph);
    },
    [graphData, severEdge, setGraphData]
  );

  // Body class effect for scissors cursor
  useEffect(() => {
    if (scissorsMode) {
      document.body.classList.add("scissors-cursor");
    } else {
      document.body.classList.remove("scissors-cursor");
    }
    return () => document.body.classList.remove("scissors-cursor");
  }, [scissorsMode]);

  const handleDoubleClick = useCallback(
    (nodeId: string) => {
      setSelectedNode(selectedNode === nodeId ? null : nodeId);
    },
    [selectedNode, setSelectedNode]
  );

  // Escape key to deselect
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedNode) {
        setSelectedNode(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedNode, setSelectedNode]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <DAGOverlay />
      <DAGErrorBoundary>
      <Canvas
        key={canvasKey}
        camera={{ position: [40, 30, 80], fov: 60 }}
        style={{ background: "#050508", position: "absolute", inset: 0, touchAction: "none" }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            console.warn("[DAG3D] WebGL context lost");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            console.info("[DAG3D] WebGL context restored");
          });
        }}
        onPointerMissed={() => {
          if (selectedNode) setSelectedNode(null);
        }}
      >
          <ambientLight intensity={0.4} />
          <pointLight position={[80, 80, 80]} intensity={0.8} color="#00e5ff" />
          <pointLight position={[-60, -60, -40]} intensity={0.4} color="#7c4dff" />
          <pointLight position={[0, 0, -80]} intensity={0.3} color="#e040fb" />

          {/* Nodes */}
          {graphData.nodes.map((node) => {
            const pos = posMap[node.id];
            if (!pos) return null;

            const isTarget = interventionTarget === node.id;
            const isRestricted = truthFilter === "verified" && node.isRestricted;
            const isSelected = selectedNode === node.id;
            const isNeighborOfSelected = selectedNeighborNodes.has(node.id);
            const anyNodeSelected = selectedNode !== null;

            return (
              <DAGNode3D
                key={node.id}
                node={node}
                position={pos}
                isInterventionTarget={isTarget}
                isVerifiedRestricted={isRestricted}
                isSelected={isSelected}
                isNeighborOfSelected={isNeighborOfSelected}
                anyNodeSelected={anyNodeSelected}
                isConsequence={node.isConsequence ?? false}
                isGreyedOut={greyedOutNodes.has(node.id)}
                onDoubleClick={() => handleDoubleClick(node.id)}
                onClick={() => {
                  if (interventionMode) {
                    setInterventionTarget(
                      interventionTarget === node.id ? null : node.id
                    );
                  } else {
                    setSelectedNode(selectedNode === node.id ? null : node.id);
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

            const isCrossDomain =
              domainMap[edge.source] !== domainMap[edge.target];

            const isConnectedToSelected = selectedEdgeIds.has(edge.id);
            const anyNodeSelected = selectedNode !== null;

            return (
              <DAGEdge3D
                key={edge.id}
                edge={edge}
                sourcePos={srcPos}
                targetPos={tgtPos}
                isHighlighted={isHighlighted}
                isDimmed={isDimmed}
                isVerifiedInconsistent={isInconsistent}
                isCrossDomain={isCrossDomain}
                isConnectedToSelected={isConnectedToSelected}
                anyNodeSelected={anyNodeSelected}
                isSevered={edge.isSevered ?? false}
                isConsequenceEdge={edge.isConsequenceEdge ?? false}
                scissorsMode={scissorsMode}
                onScissorsClick={() => handleScissorsClick(edge.id)}
              />
            );
          })}

          <CameraRig posMap={posMap} />
      </Canvas>
      </DAGErrorBoundary>
    </div>
  );
}
