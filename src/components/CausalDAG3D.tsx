"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import type { NodePosition, NodeMetrics } from "@/lib/graph-layout";
import { requestLayout3D, type LayoutResult } from "@/lib/workers/layout3d-client";
import { chiStar } from "@/lib/estimators/chi-star";
import { severEdgeAndSpawnConsequences } from "@/lib/intervention-engine";
import { getNodeDomainMap } from "@/lib/graph-data";
import DAGNode3D, { orbitActiveRef } from "./dag3d/DAGNode3D";
import { cascadeActivationOrder } from "@/lib/cascade-activation-order";
import {
  cascadeEdgeActivationOrder,
  type EdgeActivationInfo,
} from "@/lib/cascade-edge-activation-order";
import DAGEdge3D from "./dag3d/DAGEdge3D";
import DAGOverlay from "./dag3d/DAGOverlay";
import EdgeInspector from "./EdgeInspector";
import CanvasWatermark from "./CanvasWatermark";
// ReplayControls is now integrated into TimeDial
import { useReplayTick } from "@/lib/useReplayTick";
import { AnimatePresence } from "framer-motion";
import { EpochSnapshot, CausalEdge } from "@/lib/types";

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

const HOME_TARGET = new THREE.Vector3(0, 0, 0);

function CameraRig({
  posMap,
  topologyKey,
  shiftDragging,
}: {
  posMap: Record<string, [number, number, number]>;
  topologyKey: string;
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
  // Keep a ref to posMap so the effect can read current positions without
  // depending on them. Updating the ref in an effect (instead of during
  // render) keeps the render function pure.
  const posMapRef = useRef(posMap);
  useEffect(() => {
    posMapRef.current = posMap;
  }, [posMap]);
  // Track previous selection to only animate on actual changes
  const prevSelectionKey = useRef("");
  const prevTopologyKey = useRef(topologyKey);

  const orbitControlsRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);

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
        // Event-driven external-system sync: disable orbit controls while the
        // scripted camera animation runs. The cascading render the lint rule
        // worries about is bounded — the effect bails on subsequent fires via
        // the prevSelectionKey guard above.
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Auto-refit camera when topology changes (domains added/removed)
  useEffect(() => {
    if (prevTopologyKey.current === topologyKey) return;
    prevTopologyKey.current = topologyKey;

    // Delay slightly so positions are settled
    const timer = setTimeout(() => {
      const pm = posMapRef.current;
      const allIds = Object.keys(pm);
      if (allIds.length === 0) return;
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
    }, 100);
    return () => clearTimeout(timer);
  }, [topologyKey, camera, computeFitCamera]);

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

  // Hide <Html> labels during active orbit to prevent DOM overhead
  const onOrbitStart = useCallback(() => {
    orbitActiveRef.set(true);
  }, []);
  const onOrbitEnd = useCallback(() => {
    // Small delay to let damping settle before re-showing labels
    setTimeout(() => { orbitActiveRef.set(false); }, 150);
  }, []);

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
      onStart={onOrbitStart}
      onEnd={onOrbitEnd}
    />
  );
}

// Monitors WebGL context and forces remount on context loss
function useWebGLRecovery() {
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    let onLost: ((e: Event) => void) | null = null;
    let onRestored: (() => void) | null = null;
    let canvas: HTMLCanvasElement | null = null;

    // Delay to let Canvas mount
    const timer = setTimeout(() => {
      canvas = document.querySelector("canvas");
      if (!canvas) return;

      onLost = (e: Event) => {
        e.preventDefault();
        console.warn("[DAG3D] WebGL context lost — scheduling recovery");
        setTimeout(() => setCanvasKey((k) => k + 1), 1000);
      };
      onRestored = () => {
        console.info("[DAG3D] WebGL context restored");
      };

      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
    }, 500);

    return () => {
      clearTimeout(timer);
      if (canvas && onLost) canvas.removeEventListener("webglcontextlost", onLost);
      if (canvas && onRestored) canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [canvasKey]);

  return canvasKey;
}

// Safety-net invalidator. The Canvas runs in demand mode (frameloop="demand"),
// so frames only paint when something explicitly calls invalidate(). That's
// usually what we want — but if a state mutation slips past every invalidator
// (StoreInvalidator, ReplayInvalidator, hover handler, etc.) the canvas could
// freeze. This interval kicks invalidate() if no frame has rendered for 3s as
// a backstop.
//
// Previously this also logged a `[DAG3D] No frames for 3s — forcing invalidate`
// warning on every fire. That warning was noisy in normal operation: during the
// chunked async cascade simulation (`simulateCascadeAsync`) the canvas
// legitimately has nothing to paint for the duration of the run — `shockIntensity`
// is sourced from epoch frames that only land *after* simulation completes, and
// no other watched store slice changes in that window. Demo step transitions
// that injected shocks therefore tripped the warning twice per Hormuz playthrough
// without anything actually being wrong. Dropping the warn keeps the backstop
// invalidate (which is harmless) and removes the false-alarm noise; if the canvas
// genuinely freezes the lack of frames will still surface in user feedback rather
// than as a benign console line buried among 2000 logs.
function FrameMonitor() {
  const { invalidate, gl } = useThree();
  // Initialize to 0 and set on mount — calling performance.now() during
  // render is impure. The useFrame callback below replaces this on the
  // first rendered frame, so the 0 value is observed for at most one
  // tick before useFrame fires.
  const lastFrameTime = useRef(0);

  useFrame(() => {
    lastFrameTime.current = performance.now();
  });

  useEffect(() => {
    lastFrameTime.current = performance.now();
  }, []);

  useEffect(() => {
    const check = setInterval(() => {
      const elapsed = performance.now() - lastFrameTime.current;
      if (elapsed > 3000) {
        // Check if context is still alive before re-arming. Lost-context
        // recovery is handled by the dedicated webglcontextlost listener;
        // an invalidate() against a dead context would throw.
        const ctx = gl.getContext();
        if (ctx && !ctx.isContextLost()) {
          invalidate();
        }
      }
    }, 2000);
    return () => clearInterval(check);
  }, [invalidate, gl]);

  return null;
}

// Drives invalidate() while replay is active so demand-mode still animates.
function ReplayInvalidator() {
  const { invalidate } = useThree();
  useFrame(() => {
    const { replayActive, replayPlaying } = useApexStore.getState();
    if (replayActive && replayPlaying) invalidate();
  });
  return null;
}

// Watches store slices that change during interaction and calls invalidate()
// so demand-mode Canvas re-renders exactly when needed (item #1).
function StoreInvalidator() {
  const { invalidate } = useThree();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const currentEpoch = useApexStore((s) => s.currentEpoch);

  // Invalidate on any store change that affects visible state. One effect
  // with combined deps fires identically to the previous five separate
  // useEffects — React re-runs the effect when any dep changes.
  useEffect(() => {
    invalidate();
  }, [selectedNode, selectedNodes, timelinePosition, severedEdges, currentEpoch, invalidate]);

  // Expose a stable callback so node hover can trigger invalidate
  // without subscribing StoreInvalidator to hover state
  useEffect(() => {
    const handler = () => invalidate();
    window.addEventListener("dag3d-invalidate", handler);
    return () => window.removeEventListener("dag3d-invalidate", handler);
  }, [invalidate]);

  return null;
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
  // Fine-grained selectors — each subscribes only to its own slice (item #4)
  const setGraphData = useApexStore((s) => s.setGraphData);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const interventionMode = useApexStore((s) => s.interventionMode);
  const interventionTarget = useApexStore((s) => s.interventionTarget);
  const setInterventionTarget = useApexStore((s) => s.setInterventionTarget);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const scissorsMode = useApexStore((s) => s.scissorsMode);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const severEdge = useApexStore((s) => s.severEdge);
  const ablationMode = useApexStore((s) => s.ablationMode);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const ablatedEdgeIds = useApexStore((s) => s.ablatedEdgeIds);
  const toggleAblatedNode = useApexStore((s) => s.toggleAblatedNode);
  const toggleAblatedEdge = useApexStore((s) => s.toggleAblatedEdge);
  const replayActive = useApexStore((s) => s.replayActive);
  const currentEpoch = useApexStore((s) => s.currentEpoch);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const activeTimeline = useApexStore((s) => s.activeTimeline);
  const isLive = useApexStore((s) => s.isLive);

  const selectionBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [shiftDragging, setShiftDragging] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<CausalEdge | null>(null);

  const handleShiftSelect = useCallback(
    (ids: string[]) => {
      setSelectedNodes(ids);
    },
    [setSelectedNodes]
  );

  // Derive current snapshot from active timeline — clamp epoch index to valid range
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const clampedEpoch = Math.min(currentEpoch, Math.max(0, replayEpochs.length - 1));
  const currentSnapshot: EpochSnapshot | null =
    replayActive && replayEpochs.length > 0
      ? replayEpochs[clampedEpoch] ?? null
      : null;

  // Map of nodeId → 1-indexed activation order. Drives the small
  // numbered badges that float over the orbs during replay. Only
  // populated when a cascade has actually run; outside replay the
  // map is empty and no badges render.
  const activationOrder = useMemo(() => {
    if (!replayActive || replayEpochs.length === 0) return new Map<string, number>();
    return cascadeActivationOrder(replayEpochs, clampedEpoch);
  }, [replayActive, replayEpochs, clampedEpoch]);

  // Per-edge firing info — `{ ordinal, activationEpoch }` for edges
  // whose target has activated by `clampedEpoch`. Drives the FIRE
  // pulse in `DAGEdge3D` (brighter + larger particle, color flash)
  // during a small window around each edge's activation epoch, so
  // the cascade reads as edges-firing-in-order rather than just
  // nodes-lighting-up-with-static-edges.
  const edgeActivationOrder = useMemo(() => {
    if (!replayActive || replayEpochs.length === 0) {
      return new Map<string, EdgeActivationInfo>();
    }
    return cascadeEdgeActivationOrder(graphData.edges, replayEpochs, clampedEpoch);
  }, [replayActive, replayEpochs, clampedEpoch, graphData.edges]);

  const canvasKey = useWebGLRecovery();
  const positionsRef = useRef<NodePosition[]>([]);

  // Stable topology key — only recompute layout when nodes/edges are added/removed,
  // NOT when omega scores or other properties change during temporal scrubbing.
  // This prevents the force simulation from re-running on every dial tick.
  const topologyKey = useMemo(() => {
    const nk = graphData.nodes.map((n) => n.id).sort().join(",");
    const ek = graphData.edges.map((e) => `${e.source}>${e.target}`).sort().join(",");
    return nk + "|" + ek;
  }, [graphData]);

  // Keep a ref to current graphData so layout computation can access current nodes/edges
  const graphDataForLayoutRef = useRef(graphData);
  graphDataForLayoutRef.current = graphData;

  // Layout + network-metrics state, populated by the Web Worker
  // (`requestLayout3D`). Both used to be synchronous useMemos that
  // ran d3-force-3d + Brandes' centrality on the main thread on
  // every topologyKey change — that was the bulk of the
  // LAUNCH-WORKSPACE freeze the user reported. They now run off-
  // thread, and the previously-applied result stays rendered while
  // a new layout computes. First-layout flash is covered by the
  // `INITIALIZING LAYOUT…` overlay below.
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null);
  // Latest request id — used to drop stale worker responses when
  // topologyKey flips multiple times in quick succession (fast
  // domain toggling, repeated severs).
  const latestRequestIdRef = useRef(-1);

  useEffect(() => {
    const g = graphDataForLayoutRef.current;
    const req = requestLayout3D(
      g.nodes,
      g.edges,
      positionsRef.current.length > 0 ? positionsRef.current : undefined,
    );
    latestRequestIdRef.current = req.id;
    req.then((result) => {
      if (latestRequestIdRef.current !== req.id) return; // stale, drop
      positionsRef.current = result.positions;
      setLayoutResult(result);
    });
  }, [topologyKey]);

  // Wrap derivations in useMemo so the array / map references stay
  // stable across renders that don't actually flip `layoutResult`
  // — otherwise downstream useMemos keyed on `positions` would
  // invalidate every render.
  const positions = useMemo<NodePosition[]>(
    () => layoutResult?.positions ?? [],
    [layoutResult],
  );
  const networkMetrics = useMemo<Record<string, NodeMetrics>>(
    () => layoutResult?.metrics ?? {},
    [layoutResult],
  );

  const basePosMap = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    positions.forEach((p) => {
      map[p.id] = [p.x, p.y, p.z];
    });
    return map;
  }, [positions]);

  // Selection/ablation Sets — render loop iterates every node and edge, and
  // `multiSelectedNodes.includes(...)` / `ablatedNodeIds.includes(...)` is O(M)
  // per node, O(M) per edge. With 50 selections on a 200-node graph that's
  // 20K+ ops per render. Sets keep `.has()` at O(1).
  const multiSelectedSet = useMemo(
    () => new Set(multiSelectedNodes),
    [multiSelectedNodes],
  );
  const ablatedNodeSet = useMemo(
    () => new Set(ablatedNodeIds),
    [ablatedNodeIds],
  );
  const ablatedEdgeSet = useMemo(
    () => new Set(ablatedEdgeIds),
    [ablatedEdgeIds],
  );

  // Build adjacency for neighbor lookup (shared by both replay & historical contraction)
  const neighbors = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graphData.edges) {
      if (!map.has(edge.source)) map.set(edge.source, []);
      if (!map.has(edge.target)) map.set(edge.target, []);
      map.get(edge.source)!.push(edge.target);
      map.get(edge.target)!.push(edge.source);
    }
    return map;
  }, [graphData.edges]);

  // Pre-build nodeById map keyed on topologyKey (item #10): O(N) lookup inside posMap
  // instead of the O(N²) graphData.nodes.find(n => n.id === nodeId) per scrub tick.
  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof graphData.nodes)[number]>();
    for (const n of graphData.nodes) m.set(n.id, n);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);

  // Same pattern for edges — used by greyedOutNodes to resolve severed
  // edges in O(1) instead of running graphData.edges.find per cut.
  const edgeById = useMemo(() => {
    const m = new Map<string, (typeof graphData.edges)[number]>();
    for (const e of graphData.edges) m.set(e.id, e);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);

  // χ★ result on the live filtered graph. Lets the renderer highlight
  // the load-bearing skeleton AND lets the EdgeInspector surface
  // per-edge BES + bridge / top-k membership without recomputing.
  // Memoised on topologyKey so it only recomputes when the graph
  // structure actually changes — Brandes' BES is O(V·E) and
  // re-running every render would be wasteful.
  const chiStarInfo = useMemo(() => {
    if (graphData.edges.length === 0) {
      return {
        chiStarSet: new Set<string>(),
        bridgeSet: new Set<string>(),
        bes: new Map<string, number>(),
        rank: new Map<string, number>(),
      };
    }
    const r = chiStar({
      nodes: graphData.nodes,
      edges: graphData.edges.filter((e) => !e.isSevered),
      metadata: graphData.metadata,
    });
    const rank = new Map<string, number>();
    r.besRanking.forEach((entry, idx) => rank.set(entry.edgeId, idx));
    return {
      chiStarSet: new Set(r.chiStar),
      bridgeSet: new Set(r.bridges),
      bes: r.bes,
      rank,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);
  const chiStarSet = chiStarInfo.chiStarSet;

  // Store baseline omega scores (live/initial values) as a reference point.
  // Movement during scrubbing is driven by the DELTA from baseline, not absolute omega.
  const baselineOmegaRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (isLive) {
      const map: Record<string, number> = {};
      graphData.nodes.forEach((n) => { map[n.id] = n.omegaFragility.composite; });
      baselineOmegaRef.current = map;
    }
  }, [isLive, graphData.nodes]);

  // Compute a key from omega scores that changes as the user scrubs.
  const omegaKey = useMemo(() => {
    return graphData.nodes.map((n) => `${n.id}:${n.omegaFragility.composite.toFixed(2)}`).join("|");
  }, [graphData.nodes]);

  // Dynamic positions: nodes move based on stress changes.
  // During REPLAY: contraction via shockIntensity (existing behavior).
  // During HISTORICAL SCRUB: nodes with HIGH omega pull toward their stressed
  //   neighbors and the centroid; nodes with LOW omega push outward.
  //   Movement is driven by absolute omega level (not delta), ensuring visible change.
  // During LIVE: return base positions (no movement).
  const posMap = useMemo(() => {
    // Live mode — no animation
    if (isLive && !currentSnapshot) return basePosMap;

    const map: Record<string, [number, number, number]> = {};

    // Get stress for each node (0 to 1 scale)
    const getStress = (nodeId: string): number => {
      if (currentSnapshot) {
        const state = currentSnapshot.nodeStates[nodeId];
        return state ? state.shockIntensity : 0;
      }
      // Historical mode: use the temporal omega value directly
      // High omega (>5) = stressed, pulls inward
      // Low omega (<5) = relaxed, pushes outward
      // Use O(1) nodeById lookup (item #10) instead of O(N) find
      const node = nodeById.get(nodeId);
      if (!node) return 0;
      const omega = node.omegaFragility.composite;
      // Map 0-10 omega to -1 to +1 stress (5 = neutral)
      return Math.max(-1, Math.min(1, (omega - 5) / 4));
    };

    // Compute network centroid
    const ids = Object.keys(basePosMap);
    if (ids.length === 0) return basePosMap;
    let gx = 0, gy = 0, gz = 0;
    for (const id of ids) {
      const p = basePosMap[id];
      gx += p[0]; gy += p[1]; gz += p[2];
    }
    gx /= ids.length; gy /= ids.length; gz /= ids.length;

    // Compute per-domain centroids for more structured movement
    const domainCentroids: Record<string, [number, number, number, number]> = {};
    // Use nodeById for O(1) per-node lookup (item #10)
    for (const id of ids) {
      const node = nodeById.get(id);
      if (!node) continue;
      const p = basePosMap[id];
      if (!p) continue;
      if (!domainCentroids[node.domain]) domainCentroids[node.domain] = [0, 0, 0, 0];
      domainCentroids[node.domain][0] += p[0];
      domainCentroids[node.domain][1] += p[1];
      domainCentroids[node.domain][2] += p[2];
      domainCentroids[node.domain][3] += 1;
    }
    for (const d in domainCentroids) {
      const c = domainCentroids[d];
      c[0] /= c[3]; c[1] /= c[3]; c[2] /= c[3];
    }

    const PULL_MAX = 0.45;  // max inward contraction
    const PUSH_MAX = 0.25;  // max outward expansion

    for (const id of ids) {
      const base = basePosMap[id];
      const stress = getStress(id);

      if (Math.abs(stress) < 0.05) {
        map[id] = base;
        continue;
      }

      const node = nodeById.get(id);
      const dc = node ? domainCentroids[node.domain] : null;

      if (stress > 0) {
        // HIGH OMEGA: pull toward stressed neighbors + domain centroid
        const nbs = neighbors.get(id) ?? [];
        let cx = 0, cy = 0, cz = 0, totalWeight = 0;
        for (const nbId of nbs) {
          const nbStress = getStress(nbId);
          const nbPos = basePosMap[nbId];
          if (!nbPos) continue;
          const w = nbStress > 0 ? 0.4 + nbStress * 0.6 : 0.15;
          cx += nbPos[0] * w; cy += nbPos[1] * w; cz += nbPos[2] * w;
          totalWeight += w;
        }

        // Target: blend of stressed neighbor center, domain centroid, global centroid
        let tx: number, ty: number, tz: number;
        if (totalWeight > 0) {
          cx /= totalWeight; cy /= totalWeight; cz /= totalWeight;
          tx = cx * 0.5 + (dc ? dc[0] : gx) * 0.3 + gx * 0.2;
          ty = cy * 0.5 + (dc ? dc[1] : gy) * 0.3 + gy * 0.2;
          tz = cz * 0.5 + (dc ? dc[2] : gz) * 0.3 + gz * 0.2;
        } else {
          tx = (dc ? dc[0] : gx) * 0.6 + gx * 0.4;
          ty = (dc ? dc[1] : gy) * 0.6 + gy * 0.4;
          tz = (dc ? dc[2] : gz) * 0.6 + gz * 0.4;
        }

        const pull = stress * PULL_MAX;
        map[id] = [
          base[0] + (tx - base[0]) * pull,
          base[1] + (ty - base[1]) * pull,
          base[2] + (tz - base[2]) * pull,
        ];
      } else {
        // LOW OMEGA: push away from domain centroid (expansion/relaxation)
        const push = Math.abs(stress) * PUSH_MAX;
        const refX = dc ? dc[0] : gx;
        const refY = dc ? dc[1] : gy;
        const refZ = dc ? dc[2] : gz;
        const dx = base[0] - refX;
        const dy = base[1] - refY;
        const dz = base[2] - refZ;
        // Ensure minimum displacement so nodes always move visibly
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const minDisp = 3;
        const scale = Math.max(1, minDisp / dist);
        map[id] = [
          base[0] + dx * scale * push,
          base[1] + dy * scale * push,
          base[2] + dz * scale * push,
        ];
      }
    }

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePosMap, currentSnapshot, neighbors, omegaKey, isLive, nodeById]);

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
    // Find all cut targets (downstream of severed edges) — O(1) via edgeById
    // instead of graphData.edges.find per cut.
    const cutTargets = new Set<string>();
    for (const edgeId of severedEdges) {
      const edge = edgeById.get(edgeId);
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
  }, [severedEdges, graphData, edgeById]);

  // Compute disconnected nodes: find the largest connected component,
  // grey out any node not in it (floating imported clusters).
  //
  // Connectivity is purely structural — scrubbing temporal omega bumps
  // `graphData.nodes` refs but doesn't change which edges connect what.
  // Key on `topologyKey + severedEdges` (not `graphData`) so this O(V + E)
  // BFS doesn't rebuild on every replay tick. Read graphData via ref so
  // deps stay stable. Same shape as `positions` / `networkMetrics` above.
  const disconnectedNodes = useMemo(() => {
    const g = graphDataForLayoutRef.current;
    const severedSet = new Set(severedEdges);

    // Build undirected adjacency list from active (non-severed) edges
    const adj = new Map<string, Set<string>>();
    for (const node of g.nodes) {
      adj.set(node.id, new Set());
    }
    for (const edge of g.edges) {
      if (edge.isSevered || severedSet.has(edge.id)) continue;
      adj.get(edge.source)?.add(edge.target);
      adj.get(edge.target)?.add(edge.source);
    }

    // Find all connected components via BFS
    const visited = new Set<string>();
    const components: Set<string>[] = [];

    for (const node of g.nodes) {
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
    for (const node of g.nodes) {
      if (!largest.has(node.id)) {
        disconnected.add(node.id);
      }
    }
    return disconnected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey, severedEdges]);

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

  // Escape key to deselect node or close edge inspector
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEdge) {
          setSelectedEdge(null);
        } else if (selectedNode) {
          setSelectedNode(null);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedNode, setSelectedNode, selectedEdge]);

  // Resolve labels for edge inspector via the existing nodeById Map (O(1))
  // instead of two Array.find calls per render.
  const selectedEdgeSourceLabel = selectedEdge
    ? nodeById.get(selectedEdge.source)?.label ?? selectedEdge.source
    : "";
  const selectedEdgeTargetLabel = selectedEdge
    ? nodeById.get(selectedEdge.target)?.label ?? selectedEdge.target
    : "";

  // Throttle Canvas-level pointer-move invalidates to one per animation
  // frame. The earlier inline arrow dispatched a `dag3d-invalidate` Event
  // on every pointer-pixel-move — at typical 120Hz mouse polling that's
  // ~120 dispatches/sec, each calling invalidate() through the
  // StoreInvalidator listener. R3F coalesces frames internally, but the
  // per-event JS work (Event allocation + listener fire + invalidate
  // bookkeeping) was ~half of the cost of an actual render frame at
  // idle. A rAF-coalesced ref keeps the worst case to 60 dispatches/sec
  // (or the display rate, whichever is lower) regardless of how fast
  // the mouse moves. PR #199 follow-up.
  const invalidatePendingRef = useRef(false);
  const onCanvasPointerMove = useCallback(() => {
    if (invalidatePendingRef.current) return;
    invalidatePendingRef.current = true;
    requestAnimationFrame(() => {
      invalidatePendingRef.current = false;
      window.dispatchEvent(new Event("dag3d-invalidate"));
    });
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0 }} onContextMenu={(e) => e.preventDefault()}>
      <CanvasWatermark />
      <DAGOverlay />
      {/* First-layout overlay — the WebGL canvas mounts immediately
          once the dynamic chunk loads, but orbs can't render until
          the worker returns the initial layout (~150-300ms on a 500-
          node CROSS-DOMAIN workspace). Without this overlay the user
          would see an empty black canvas for that interval. Subsequent
          re-layouts (domain toggle, sever, etc.) keep the previous
          positions on screen, so this only fires on first mount. */}
      {!layoutResult && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-background/60"
        >
          <div className="text-[10px] font-mono text-text-muted animate-pulse">
            COMPUTING LAYOUT…
          </div>
        </div>
      )}
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
      {/* frameloop="demand" stops the render loop when idle — invalidate() is called
          on every interaction event so nothing visible is lost (item #1). */}
      <Canvas
        key={canvasKey}
        frameloop="demand"
        camera={{ position: [40, 30, 80], fov: 60 }}
        style={{ background: "#050508", position: "absolute", inset: 0, touchAction: "none" }}
        gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
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
          window.dispatchEvent(new Event("dag3d-invalidate"));
        }}
        onPointerMove={onCanvasPointerMove}
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
            if (isolateSelection && multiSelectedSet.size > 0 && !multiSelectedSet.has(node.id)) return null;

            const isTarget = interventionTarget === node.id;
            const isRestricted = truthFilter === "verified" && node.isRestricted;
            const isMultiSelected = multiSelectedSet.has(node.id);
            const isSelected = selectedNode === node.id || isMultiSelected;
            const isNeighborOfSelected = selectedNeighborNodes.has(node.id);
            // Dim non-selected nodes whenever ANYTHING is selected — single OR
            // multi. Previously only the singular selection drove the dim
            // pass, so domain-legend / shift-drag selections silently pushed
            // multiple cyan rings into a sea of equally-bright neighbors.
            const anyNodeSelected = selectedNode !== null || multiSelectedSet.size > 0;

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
                isAblated={ablatedNodeSet.has(node.id)}
                ablationMode={ablationMode}
                metrics={networkMetrics[node.id]}
                epochState={currentSnapshot?.nodeStates[node.id] ?? (
                  !isLive ? {
                    omegaComposite: node.omegaFragility.composite,
                    omegaProfile: node.omegaFragility,
                    shockIntensity: Math.max(0, Math.min(1, (node.omegaFragility.composite - 5) / 5)),
                    isActivated: node.omegaFragility.composite > 7,
                  } : undefined
                )}
                activationOrdinal={activationOrder.get(node.id)}
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
            if (isolateSelection && multiSelectedSet.size > 0 && (!multiSelectedSet.has(edge.source) || !multiSelectedSet.has(edge.target))) return null;

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
                isAblated={ablatedEdgeSet.has(edge.id)}
                ablationMode={ablationMode}
                onAblationClick={() => toggleAblatedEdge(edge.id)}
                onEdgeClick={() => setSelectedEdge(selectedEdge?.id === edge.id ? null : edge)}
                epochState={currentSnapshot?.edgeStates[edge.id]}
                fireActivationEpoch={edgeActivationOrder.get(edge.id)?.activationEpoch}
                currentEpoch={clampedEpoch}
                replayActive={replayActive}
                chiStarTier={
                  chiStarInfo.bridgeSet.has(edge.id)
                    ? "bridge"
                    : chiStarInfo.chiStarSet.has(edge.id)
                      ? "top-bes"
                      : null
                }
              />
            );
          })}

          <CameraRig posMap={posMap} topologyKey={topologyKey} shiftDragging={shiftDragging} />
          <FrameMonitor />
          <ReplayTickDriver />
          <ReplayInvalidator />
          <StoreInvalidator />
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
      <AnimatePresence>
        {selectedEdge && (
          <EdgeInspector
            key={selectedEdge.id}
            edge={selectedEdge}
            sourceLabel={selectedEdgeSourceLabel}
            targetLabel={selectedEdgeTargetLabel}
            onClose={() => setSelectedEdge(null)}
            chiStarInfo={
              chiStarInfo.chiStarSet.has(selectedEdge.id)
                ? {
                    isBridge: chiStarInfo.bridgeSet.has(selectedEdge.id),
                    bes: chiStarInfo.bes.get(selectedEdge.id) ?? 0,
                    rank: chiStarInfo.rank.get(selectedEdge.id) ?? null,
                    totalEdges: chiStarInfo.bes.size,
                  }
                : null
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
