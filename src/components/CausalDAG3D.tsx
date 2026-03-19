"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { computeLayout3D, NodePosition } from "@/lib/graph-layout";
import { severEdgeAndSpawnConsequences } from "@/lib/intervention-engine";
import { getNodeDomainMap } from "@/lib/graph-data";
import DAGNode3D from "./dag3d/DAGNode3D";
import DAGEdge3D from "./dag3d/DAGEdge3D";
import DAGOverlay from "./dag3d/DAGOverlay";
// ReplayControls is now integrated into TimeDial
import { useReplayTick } from "@/lib/useReplayTick";
import { EpochSnapshot } from "@/lib/types";

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
  shiftDragging,
}: {
  posMap: Record<string, [number, number, number]>;
  shiftDragging?: boolean;
}) {
  const { camera } = useThree();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const animating = useRef(false);
  const progress = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const endTarget = useRef(new THREE.Vector3());
  // Keep a ref to posMap so the effect can read current positions without depending on them
  const posMapRef = useRef(posMap);
  posMapRef.current = posMap;
  // Track previous selection to only animate on actual changes
  const prevSelectionKey = useRef("");

  const orbitControlsRef = useRef<any>(null);

  // Helper: compute centroid and camera position to fit a set of node positions
  const computeFitCamera = useCallback((nodeIds: string[], currentPosMap: Record<string, [number, number, number]>) => {
    const positions = nodeIds.map((id) => currentPosMap[id]).filter(Boolean) as [number, number, number][];
    if (positions.length === 0) return null;

    // Centroid
    let cx = 0, cy = 0, cz = 0;
    for (const [x, y, z] of positions) { cx += x; cy += y; cz += z; }
    cx /= positions.length;
    cy /= positions.length;
    cz /= positions.length;

    if (positions.length === 1) {
      return {
        target: new THREE.Vector3(cx, cy, cz),
        position: new THREE.Vector3(cx + 18, cy + 14, cz + 30),
      };
    }

    // Bounding box extent
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const [x, y, z] of positions) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const extentZ = maxZ - minZ;
    const maxExtent = Math.max(extentX, extentY, extentZ, 10);

    // Pull camera back proportional to spread, with some offset for perspective
    const dist = maxExtent * 1.2 + 20;
    return {
      target: new THREE.Vector3(cx, cy, cz),
      position: new THREE.Vector3(cx + dist * 0.35, cy + dist * 0.25, cz + dist * 0.6),
    };
  }, []);

  // Build a stable key from selection state — only animate when this actually changes
  const selectionKey = multiSelectedNodes.length > 0
    ? `multi:${[...multiSelectedNodes].sort().join(",")}`
    : selectedNode
      ? `single:${selectedNode}`
      : "none";

  useEffect(() => {
    // Skip if selection hasn't actually changed
    if (prevSelectionKey.current === selectionKey) return;
    prevSelectionKey.current = selectionKey;

    const pm = posMapRef.current;

    // Priority 1: Multi-selection (isolate or shift-select)
    if (multiSelectedNodes.length > 0) {
      const fit = computeFitCamera(multiSelectedNodes, pm);
      if (fit) {
        startPos.current.copy(camera.position);
        endPos.current.copy(fit.position);
        startTarget.current.copy(orbitControlsRef.current?.target ?? HOME_TARGET);
        endTarget.current.copy(fit.target);
        progress.current = 0;
        animating.current = true;
        setControlsEnabled(false);
      }
      return;
    }

    // Priority 2: Single node selection
    if (selectedNode && pm[selectedNode]) {
      const [nx, ny, nz] = pm[selectedNode];
      startPos.current.copy(camera.position);
      endPos.current.set(nx + 18, ny + 14, nz + 30);
      startTarget.current.copy(
        orbitControlsRef.current?.target ?? HOME_TARGET
      );
      endTarget.current.set(nx, ny, nz);
      progress.current = 0;
      animating.current = true;
      setControlsEnabled(false);
      return;
    }

    // Priority 3: Nothing selected — fit to all nodes (zoom back out)
    const allIds = Object.keys(pm);
    if (allIds.length > 0) {
      const fit = computeFitCamera(allIds, pm);
      if (fit) {
        startPos.current.copy(camera.position);
        endPos.current.copy(fit.position);
        startTarget.current.copy(orbitControlsRef.current?.target ?? HOME_TARGET);
        endTarget.current.copy(fit.target);
        progress.current = 0;
        animating.current = true;
        setControlsEnabled(false);
      }
    }
  }, [selectionKey, selectedNode, multiSelectedNodes, camera, computeFitCamera]);

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
      enabled={controlsEnabled && !shiftDragging}
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

function ReplayTickDriver() {
  useReplayTick();
  return null;
}

// Shift+drag rectangle selection — runs inside the R3F Canvas
function ShiftDragSelect({
  posMap,
  graphNodes,
  onSelect,
  selectionBoxRef,
  setSelectionRect,
  setShiftDragging,
}: {
  posMap: Record<string, [number, number, number]>;
  graphNodes: { id: string }[];
  onSelect: (ids: string[]) => void;
  selectionBoxRef: React.MutableRefObject<{ x1: number; y1: number; x2: number; y2: number } | null>;
  setSelectionRect: (rect: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  setShiftDragging: (dragging: boolean) => void;
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

      if (maxX - minX < 5 && maxY - minY < 5) return;

      const ids: string[] = [];
      const vec = new THREE.Vector3();
      for (const node of graphNodes) {
        const pos = posMap[node.id];
        if (!pos) continue;
        vec.set(pos[0], pos[1], pos[2]).project(camera);
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
  }, [gl, graphNodes, posMap, camera, canvasSize, onSelect, selectionBoxRef, setSelectionRect, setShiftDragging]);

  return null;
}

export default function CausalDAG3D() {
  const graphData = useFilteredGraph();
  const {
    setGraphData,
    truthFilter,
    interventionMode,
    interventionTarget,
    setInterventionTarget,
    selectedNode,
    setSelectedNode,
    selectedNodes: multiSelectedNodes,
    setSelectedNodes,
    isolateSelection,
    scissorsMode,
    severedEdges,
    severEdge,
    ablationMode,
    ablatedNodeIds,
    ablatedEdgeIds,
    toggleAblatedNode,
    toggleAblatedEdge,
    replayActive,
    currentEpoch,
    baselineEpochs,
    interventionEpochs,
    activeTimeline,
  } = useApexStore();

  const selectionBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [shiftDragging, setShiftDragging] = useState(false);

  const handleShiftSelect = useCallback(
    (ids: string[]) => {
      setSelectedNodes(ids);
    },
    [setSelectedNodes]
  );

  // Derive current snapshot from active timeline
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const currentSnapshot: EpochSnapshot | null =
    replayActive && replayEpochs.length > 0
      ? replayEpochs[currentEpoch] ?? null
      : null;

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

  const basePosMap = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    positions.forEach((p) => {
      map[p.id] = [p.x, p.y, p.z];
    });
    return map;
  }, [positions]);

  // Dynamic positions: during replay, nodes contract toward activated neighbors
  // based on shock intensity — visualizes hypersynchronization/convulsion
  const posMap = useMemo(() => {
    if (!currentSnapshot) return basePosMap;

    const CONTRACTION = 0.18; // max fraction of distance to contract
    const map: Record<string, [number, number, number]> = {};

    // Build adjacency for neighbor lookup
    const neighbors = new Map<string, string[]>();
    for (const edge of graphData.edges) {
      if (!neighbors.has(edge.source)) neighbors.set(edge.source, []);
      if (!neighbors.has(edge.target)) neighbors.set(edge.target, []);
      neighbors.get(edge.source)!.push(edge.target);
      neighbors.get(edge.target)!.push(edge.source);
    }

    for (const id of Object.keys(basePosMap)) {
      const base = basePosMap[id];
      const state = currentSnapshot.nodeStates[id];
      if (!state || state.shockIntensity < 0.01) {
        map[id] = base;
        continue;
      }

      // Compute weighted center of activated neighbors
      const nbs = neighbors.get(id) ?? [];
      let cx = 0, cy = 0, cz = 0, totalWeight = 0;
      for (const nbId of nbs) {
        const nbState = currentSnapshot.nodeStates[nbId];
        const nbPos = basePosMap[nbId];
        if (!nbPos) continue;
        const w = nbState ? 0.3 + nbState.shockIntensity * 0.7 : 0.1;
        cx += nbPos[0] * w;
        cy += nbPos[1] * w;
        cz += nbPos[2] * w;
        totalWeight += w;
      }

      if (totalWeight > 0) {
        cx /= totalWeight;
        cy /= totalWeight;
        cz /= totalWeight;
        const pull = state.shockIntensity * CONTRACTION;
        map[id] = [
          base[0] + (cx - base[0]) * pull,
          base[1] + (cy - base[1]) * pull,
          base[2] + (cz - base[2]) * pull,
        ];
      } else {
        map[id] = base;
      }
    }

    return map;
  }, [basePosMap, currentSnapshot, graphData.edges]);

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

  // Compute disconnected nodes: find the largest connected component,
  // grey out any node not in it (floating imported clusters)
  const disconnectedNodes = useMemo(() => {
    // Build undirected adjacency list from active (non-severed) edges
    const adj = new Map<string, Set<string>>();
    for (const node of graphData.nodes) {
      adj.set(node.id, new Set());
    }
    for (const edge of graphData.edges) {
      if (edge.isSevered) continue;
      adj.get(edge.source)?.add(edge.target);
      adj.get(edge.target)?.add(edge.source);
    }

    // Find all connected components via BFS
    const visited = new Set<string>();
    const components: Set<string>[] = [];

    for (const node of graphData.nodes) {
      if (visited.has(node.id)) continue;
      const component = new Set<string>();
      const queue = [node.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.add(current);
        const neighbors = adj.get(current);
        if (neighbors) {
          for (const n of neighbors) {
            if (!visited.has(n)) queue.push(n);
          }
        }
      }
      components.push(component);
    }

    // Largest component is the main graph
    let largest = components[0] ?? new Set<string>();
    for (const c of components) {
      if (c.size > largest.size) largest = c;
    }

    // Everything outside the largest component is disconnected
    const disconnected = new Set<string>();
    for (const node of graphData.nodes) {
      if (!largest.has(node.id)) {
        disconnected.add(node.id);
      }
    }
    return disconnected;
  }, [graphData]);

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

  // Body class effect for ablation cursor
  useEffect(() => {
    if (ablationMode) {
      document.body.classList.add("ablation-cursor");
    } else {
      document.body.classList.remove("ablation-cursor");
    }
    return () => document.body.classList.remove("ablation-cursor");
  }, [ablationMode]);

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
      {selectionRect && (
        <div
          style={{
            position: "absolute",
            left: Math.min(selectionRect.x1, selectionRect.x2),
            top: Math.min(selectionRect.y1, selectionRect.y2),
            width: Math.abs(selectionRect.x2 - selectionRect.x1),
            height: Math.abs(selectionRect.y2 - selectionRect.y1),
            border: "1px solid rgba(0, 229, 255, 0.6)",
            backgroundColor: "rgba(0, 229, 255, 0.08)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      )}
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

            // Hide non-selected nodes when isolation is active
            if (isolateSelection && multiSelectedNodes.length > 0 && !multiSelectedNodes.includes(node.id)) return null;

            const isTarget = interventionTarget === node.id;
            const isRestricted = truthFilter === "verified" && node.isRestricted;
            const isMultiSelected = multiSelectedNodes.includes(node.id);
            const isSelected = selectedNode === node.id || isMultiSelected;
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
                isGreyedOut={greyedOutNodes.has(node.id) || disconnectedNodes.has(node.id)}
                isAblated={ablatedNodeIds.includes(node.id)}
                ablationMode={ablationMode}
                epochState={currentSnapshot?.nodeStates[node.id]}
                onDoubleClick={() => handleDoubleClick(node.id)}
                onClick={() => {
                  if (ablationMode) {
                    toggleAblatedNode(node.id);
                  } else if (interventionMode) {
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

            // Hide edges that don't connect two selected nodes when isolation is active
            if (isolateSelection && multiSelectedNodes.length > 0 && (!multiSelectedNodes.includes(edge.source) || !multiSelectedNodes.includes(edge.target))) return null;

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
                isAblated={ablatedEdgeIds.includes(edge.id)}
                ablationMode={ablationMode}
                onAblationClick={() => toggleAblatedEdge(edge.id)}
                epochState={currentSnapshot?.edgeStates[edge.id]}
              />
            );
          })}

          <CameraRig posMap={posMap} shiftDragging={shiftDragging} />
          <ReplayTickDriver />
          <ShiftDragSelect
            posMap={posMap}
            graphNodes={graphData.nodes}
            onSelect={handleShiftSelect}
            selectionBoxRef={selectionBoxRef}
            setSelectionRect={setSelectionRect}
            setShiftDragging={setShiftDragging}
          />
      </Canvas>
      </DAGErrorBoundary>
    </div>
  );
}
