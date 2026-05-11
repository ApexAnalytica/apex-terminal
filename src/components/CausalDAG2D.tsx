"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  EdgeMouseHandler,
  NodeMouseHandler,
  Background,
  Controls,
  NodeProps,
  Handle,
  Position,
  BackgroundVariant,
  SelectionMode,
  OnSelectionChangeFunc,
  MarkerType,
  EdgeProps,
  BaseEdge,
  useStore as useReactFlowStore,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getCategoryColor, getDomainColor } from "@/lib/graph-data";
import { getDomainCardColor } from "@/lib/domains";
import { chiStar } from "@/lib/estimators/chi-star";
import DAGOverlay from "./dag3d/DAGOverlay";
import CanvasWatermark from "./CanvasWatermark";
import { useReplayTickDOM } from "@/lib/useReplayTick";
import type { CausalEdge, EpochSnapshot } from "@/lib/types";
import {
  compute2DForceLayout,
  create2DLiveSimulation,
  graphSignature,
  type LiveSimulation,
  type Position2D,
} from "@/lib/graph-layout-2d";
import { computeNetworkMetrics, type NodeMetrics } from "@/lib/graph-layout";
import { AnimatePresence } from "framer-motion";

type NodeEmphasis = "focus" | "neighbor" | "dim" | "none";

/**
 * Shared context for the 2D canvas. Carrying `adjacency` + `hoveredNodeId`
 * here (instead of through every node's `data` prop) is the difference
 * between the parent rebuilding the entire `nodes`/`edges` arrays on every
 * mouse-move (which is what made hover blink the canvas in v1) and only
 * the individual node/edge components re-deriving their emphasis. The
 * adjacency Map is stable across hovers because it depends only on
 * graph topology.
 */
interface Dag2DContextValue {
  adjacency: Map<string, string[]>;
  hoveredNodeId: string | null;
  selectedEdgeId: string | null;
}
const Dag2DContext = createContext<Dag2DContextValue>({
  adjacency: new Map(),
  hoveredNodeId: null,
  selectedEdgeId: null,
});

/**
 * Compute a single node's emphasis from the four signals that decide it:
 * its own id, the hover/selection state, the multi-selection set, and
 * the adjacency Map. Used by both `CausalNode2D` and `EmphasizedEdge`
 * (via source/target lookups) so the two stay in lockstep.
 *
 * Both hover and click drive a "focus + neighbours" spotlight here so the
 * effect is consistent across the four canvas surfaces (2D / 3D / Map /
 * TOPO). The DIFFERENCE between hover and click is the dim *strength* —
 * see the consumers below for the per-source opacity choice.
 */
function computeNodeEmphasis(
  id: string,
  hoveredNodeId: string | null,
  selectedNode: string | null,
  multiSelected: string[],
  adjacency: Map<string, string[]>,
): NodeEmphasis {
  const emphasisTarget = hoveredNodeId ?? selectedNode ?? null;
  if (multiSelected.length > 0) {
    const isSelected = multiSelected.includes(id);
    if (isSelected) return "focus";
    if (emphasisTarget === id) return "focus";
    if (
      emphasisTarget &&
      (adjacency.get(emphasisTarget) ?? []).includes(id)
    ) {
      return "neighbor";
    }
    return "dim";
  }
  if (!emphasisTarget) return "none";
  if (id === emphasisTarget) return "focus";
  if ((adjacency.get(emphasisTarget) ?? []).includes(id)) return "neighbor";
  return "dim";
}

function CausalNode2D({ data, selected, id }: NodeProps) {
  const { label, category, domain, omegaComposite, isRestricted, datasetColor, shockIntensity, metrics } = data as {
    label: string;
    category: string;
    domain: string;
    omegaComposite: number;
    isRestricted: boolean;
    datasetColor?: string;
    shockIntensity?: number;
    metrics?: NodeMetrics;
  };
  const { adjacency, hoveredNodeId } = useContext(Dag2DContext);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);
  const nodeSizeMetric = useApexStore((s) => s.nodeSizeMetric);
  const emphasis = useMemo(
    () => computeNodeEmphasis(id, hoveredNodeId, selectedNode, multiSelectedNodes, adjacency),
    [id, hoveredNodeId, selectedNode, multiSelectedNodes, adjacency],
  );
  // Color priority: domain-card colour (matches the bottom-left domain
  // panel's row colour) → per-node datasetColor → category palette
  // fallback. Earlier the node went straight to datasetColor / category,
  // which left the panel showing card.color while the orb on canvas
  // rendered in a totally different colour. Now both surfaces resolve
  // through `getDomainCardColor`, so panel ↔ canvas colours align.
  const color =
    getDomainCardColor(domain) ??
    datasetColor ??
    getDomainColor(domain) ??
    getCategoryColor(category);
  const isFractured = omegaComposite > 9;
  const isStressed = omegaComposite > 7;
  const shockGlow = shockIntensity ?? 0;
  const nodeEmphasis: NodeEmphasis = emphasis ?? "none";
  const isDim = nodeEmphasis === "dim";
  const isFocus = nodeEmphasis === "focus";
  const isRinged = selected || isFocus;

  // Diameter scales with the user-selected metric. Same toggle the 3D
  // view honours (`nodeSizeMetric` in the store): "omega" \u2192 \u03A9F
  // composite (criticality), "eigenvector" \u2192 influence-hub centrality,
  // "betweenness" \u2192 bridge centrality. All paths normalise to a 0..1
  // unit and map into a 14..34 px range so the visual delta between
  // smallest and largest stays consistent across metrics.
  const ec = metrics?.eigenvectorCentrality ?? 0.5;
  const bc = metrics?.betweennessCentrality ?? 0.5;
  const omegaUnit = Math.min(1, Math.max(0, omegaComposite / 10));
  const sizeUnit =
    nodeSizeMetric === "betweenness"
      ? Math.min(1, Math.max(0, bc))
      : nodeSizeMetric === "eigenvector"
        ? Math.min(1, Math.max(0, ec))
        : omegaUnit;
  const diameter = 14 + sizeUnit * 20;

  // Layered box-shadow: selection ring (sharp), shock glow (pulsing), base
  // omega glow (soft halo). All applied to the same circle element.
  const selectionRing = isRinged ? "0 0 0 2px #00e5ff, 0 0 12px #00e5ffaa" : "";
  const shockShadow = shockGlow > 0
    ? `0 0 ${Math.round(shockGlow * 24)}px ${color}, 0 0 ${Math.round(shockGlow * 12)}px ${color}cc`
    : "";
  const baseShadow = omegaComposite > 0
    ? `0 0 ${Math.round((omegaComposite / 10) * 14)}px ${color}88`
    : "";
  const boxShadow = [selectionRing, shockShadow, baseShadow].filter(Boolean).join(", ") || "none";

  // Hover-driven dim is dramatic (0.18 → strong spotlight); click-driven
  // dim is gentle (0.5 → non-neighbour orbs still legible) so a pinned
  // selection doesn't read as a blacked-out canvas. The pinned node
  // itself is "focus" via the emphasis path above, so it stays vivid
  // either way.
  const isHoverDriven = hoveredNodeId !== null;
  const dimOpacity = isHoverDriven ? 0.18 : 0.5;

  return (
    <motion.div
      className="relative"
      style={{
        width: diameter,
        height: diameter,
        opacity: isDim ? dimOpacity : 1,
        transition: "opacity 180ms ease-out",
      }}
      animate={isRinged ? { scale: 1.1 } : { scale: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "transparent", border: "none", width: 0, height: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: "transparent", border: "none", width: 0, height: 0 }} />
      <Handle type="target" position={Position.Left} style={{ background: "transparent", border: "none", width: 0, height: 0 }} id="left-target" />
      <Handle type="source" position={Position.Right} style={{ background: "transparent", border: "none", width: 0, height: 0 }} id="right-source" />

      <motion.div
        className="rounded-full absolute inset-0"
        style={{
          backgroundColor: color,
          border: isRestricted ? `1px solid #ff1744` : "none",
          boxShadow,
        }}
        animate={
          shockGlow > 0.3
            ? { scale: [1, 1 + shockGlow * 0.18, 1] }
            : isFractured
              ? { scale: [1, 1.08, 1] }
              : isStressed
                ? { opacity: [1, 0.7, 1] }
                : {}
        }
        transition={
          shockGlow > 0.3
            ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
            : isFractured
              ? { duration: 0.8, repeat: Infinity }
              : isStressed
                ? { duration: 1.5, repeat: Infinity }
                : {}
        }
      />

      {/* \u03A9F + label below the circle. Absolute so the node bounding box stays
          circle-sized and edges anchor at the circle's edges, not the label's. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
        style={{ top: diameter + 3 }}
      >
        {omegaComposite > 0 && (
          <div
            className="text-[8px] font-mono leading-tight"
            style={{
              color: `${color}cc`,
              textShadow: "0 0 4px rgba(0,0,0,0.85)",
            }}
          >
            {"\u03A9"} {omegaComposite.toFixed(1)}
          </div>
        )}
        <div
          className="text-[8px] font-mono leading-tight whitespace-nowrap"
          style={{
            color: isRinged ? "#00e5ff" : "rgba(220,220,230,0.75)",
            textShadow: "0 0 4px rgba(0,0,0,0.85)",
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "color 180ms ease-out",
          }}
        >
          {label}
        </div>
      </div>
    </motion.div>
  );
}

// Per-edge χ★ context for the inspector — see EdgeInspector.tsx's
// ChiStarEdgeInfo for the canonical definition. Local copy here so
// the 2D canvas's locally-defined inspector stays self-contained.
interface ChiStarEdgeInfo {
  isBridge: boolean;
  bes: number;
  rank: number | null;
  totalEdges: number;
}

function EdgeInspector({
  edge,
  sourceLabel,
  targetLabel,
  onClose,
  chiStarInfo,
}: {
  edge: CausalEdge;
  sourceLabel: string;
  targetLabel: string;
  onClose: () => void;
  chiStarInfo?: ChiStarEdgeInfo | null;
}) {
  const typeColor =
    edge.type === "temporal"
      ? "#ffab00"
      : edge.type === "confounded"
        ? "#ff6d00"
        : "#00e5ff";

  const typeLabel =
    edge.type === "temporal"
      ? "TEMPORAL"
      : edge.type === "confounded"
        ? "CONFOUNDED"
        : "DIRECTED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 w-[420px] rounded border border-border bg-background/95 backdrop-blur-sm shadow-2xl"
      style={{ boxShadow: `0 0 20px ${typeColor}15` }}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-[0.15em] text-text-muted">
          CAUSAL LINK INSPECTOR
        </div>
        <button
          onClick={onClose}
          className="text-[10px] font-mono text-text-muted hover:text-foreground transition-colors"
        >
          ESC
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Source → Target */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-accent-cyan">{sourceLabel}</span>
          <span className="text-text-muted">{"\u2192"}</span>
          <span className="text-accent-cyan">{targetLabel}</span>
        </div>

        {/* Physical Mechanism */}
        <div>
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
            PHYSICAL MECHANISM
          </div>
          <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
            {edge.physicalMechanism}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4">
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">TYPE</div>
            <div
              className="text-[10px] font-mono mt-0.5"
              style={{ color: typeColor }}
            >
              {typeLabel}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">WEIGHT</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5">
              {edge.weight.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">CONFIDENCE</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5">
              {(edge.confidence * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">LAG</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5">
              {edge.lag === 0 ? "sync" : `t+${edge.lag}`}
            </div>
          </div>
          {edge.isInconsistent && (
            <div>
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">STATUS</div>
              <div className="text-[10px] font-mono text-accent-red mt-0.5">
                INCONSISTENT
              </div>
            </div>
          )}
        </div>

        {/* Confidence bar */}
        <div>
          <div className="h-1 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${edge.confidence * 100}%`,
                backgroundColor: typeColor,
                opacity: 0.7,
              }}
            />
          </div>
        </div>

        {/* χ★ membership — same render as EdgeInspector.tsx; kept
            in sync manually since 2D defines its own inspector. */}
        {chiStarInfo && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                χ★ BRIDGE SET
              </div>
              <div
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider tabular-nums"
                style={{ color: "#7B68EE" }}
              >
                {chiStarInfo.isBridge ? "STRICT BRIDGE" : "TOP-BES"}
              </div>
            </div>
            <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
              {chiStarInfo.isBridge
                ? "Removing this edge disconnects the (undirected) graph — every cascade path between the two resulting components must traverse it."
                : "High Bridge-Edge Strength — participates in many shortest paths even though removing it doesn't formally disconnect the graph."}
            </div>
            <div className="mt-1.5 flex gap-4 text-[10px] font-mono tabular-nums">
              <div>
                <span className="text-text-muted">BES </span>
                <span style={{ color: "#7B68EE" }}>
                  {chiStarInfo.bes.toFixed(3)}
                </span>
              </div>
              {chiStarInfo.rank !== null && chiStarInfo.totalEdges > 0 && (
                <div>
                  <span className="text-text-muted">RANK </span>
                  <span className="text-foreground">
                    {chiStarInfo.rank + 1} / {chiStarInfo.totalEdges}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

const nodeTypes = { causal: CausalNode2D };

/**
 * Custom edge component that subscribes to hover/selection state itself
 * (via Dag2DContext + useApexStore) instead of receiving emphasis through
 * the edges array. Net effect: the parent's `edges` useMemo no longer
 * has to rebuild on every hover — only individual EmphasizedEdge
 * components re-derive their opacity/width. That's the difference
 * between "hover blinks the whole canvas" (v1) and "hover updates one
 * neighborhood smoothly" (v2).
 */
interface EmphasizedEdgeData {
  baseColor: string;
  baseWidth: number;
  baseOpacity: number;
  isInconsistent: boolean;
  isTemporal: boolean;
  isConfounded: boolean;
  isSelected: boolean;
  propagationSignal: number;
  showArrow: boolean;
  /**
   * χ★ tier — drives the discrete violet midpoint marker rendered
   * after the BaseEdge. Two tiers so the strict-bridge vs top-BES
   * distinction reads at-a-glance (filled diamond vs hollow outline).
   * null when the edge isn't in χ★. Same treatment as the 3D canvas
   * adapted to ReactFlow's SVG layer.
   */
  chiStarTier: "bridge" | "top-bes" | null;
}

function EmphasizedEdge(props: EdgeProps<EmphasizedEdgeData>) {
  const {
    id,
    source,
    target,
    data,
    markerEnd,
  } = props;
  const { adjacency, hoveredNodeId, selectedEdgeId } = useContext(Dag2DContext);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);

  // "Floating" edge geometry. The earlier path used getBezierPath against
  // RF's handle-anchored sourceX/Y/targetX/Y, which forced every line to
  // route through one of the four invisible handles (top/bottom/left/right)
  // and gave the curvy "always entering top or bottom" look the user
  // flagged. Reading the actual node centres from the RF store and
  // trimming the line to each circle's perimeter draws a straight edge
  // in whatever direction makes geometric sense.
  const sourceNode = useReactFlowStore((s) => s.nodeInternals.get(source));
  const targetNode = useReactFlowStore((s) => s.nodeInternals.get(target));

  let edgePath: string | null = null;
  let midX: number | null = null;
  let midY: number | null = null;
  if (sourceNode && targetNode) {
    const sw = sourceNode.width ?? 30;
    const sh = sourceNode.height ?? 30;
    const tw = targetNode.width ?? 30;
    const th = targetNode.height ?? 30;
    const sxC = (sourceNode.positionAbsolute?.x ?? sourceNode.position.x) + sw / 2;
    const syC = (sourceNode.positionAbsolute?.y ?? sourceNode.position.y) + sh / 2;
    const txC = (targetNode.positionAbsolute?.x ?? targetNode.position.x) + tw / 2;
    const tyC = (targetNode.positionAbsolute?.y ?? targetNode.position.y) + th / 2;
    const dx = txC - sxC;
    const dy = tyC - syC;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) {
      const ndx = dx / dist;
      const ndy = dy / dist;
      // Trim each endpoint to the node's circle perimeter (radius = half
      // the rendered diameter). Without trimming, the line passes through
      // the orb and overruns the arrow head.
      const sr = sw / 2;
      const tr = tw / 2;
      const x1 = sxC + ndx * sr;
      const y1 = syC + ndy * sr;
      const x2 = txC - ndx * tr;
      const y2 = tyC - ndy * tr;
      edgePath = `M ${x1} ${y1} L ${x2} ${y2}`;
      midX = (x1 + x2) / 2;
      midY = (y1 + y2) / 2;
    }
  }
  if (!edgePath) return null;

  // Emphasis: an edge is "in scope" if either endpoint is the current
  // emphasis target (hover or single-select). The dim STRENGTH below
  // differs based on whether hover or click is driving — hover stays
  // dramatic (matches the user's "kinda cool" framing) while click
  // softens to keep non-neighbour edges legible (earlier 0.1 click-dim
  // read as "the canvas went black").
  const emphasisTarget = hoveredNodeId ?? selectedNode ?? null;
  const isHoverDriven = hoveredNodeId !== null;
  const inScope =
    !emphasisTarget || source === emphasisTarget || target === emphasisTarget;

  // Multi-selection: an edge is in scope if at least one endpoint is
  // selected (the "isolated subgraph" reading the user picked in the
  // domain legend / shift-marquee).
  const multiInScope =
    multiSelectedNodes.length === 0 ||
    multiSelectedNodes.includes(source) ||
    multiSelectedNodes.includes(target);

  const d = data!;
  const isThisSelected = selectedEdgeId === id;
  const otherEdgeSelected = !!selectedEdgeId && !isThisSelected;

  // Hover-driven dim is dramatic (0.1 → strong spotlight); click-driven
  // dim is gentle (0.35 → non-neighbour edges still legible). Same idea
  // for the multi-select "isolation" dim — slightly softer when no hover
  // is active so the persistent state feels like context, not erasure.
  const dimOutOfScope = isHoverDriven ? 0.1 : 0.35;
  const dimMultiOutOfScope = isHoverDriven ? 0.08 : 0.25;
  let opacity = d.baseOpacity;
  if (otherEdgeSelected) opacity = Math.min(opacity, 0.15);
  if (!inScope) opacity = Math.min(opacity, dimOutOfScope);
  if (!multiInScope) opacity = Math.min(opacity, dimMultiOutOfScope);
  if (isThisSelected) opacity = 1;
  if (d.propagationSignal > 0) {
    opacity = Math.min(1, d.baseOpacity + d.propagationSignal * 0.3);
  }

  const strokeWidth = isThisSelected
    ? d.baseWidth + 1.5
    : d.propagationSignal > 0
      ? d.baseWidth + d.propagationSignal * 2
      : d.baseWidth;

  const stroke = d.propagationSignal > 0 ? "#ffab00" : d.baseColor;
  const strokeDasharray = d.isConfounded || d.isInconsistent ? "5,5" : undefined;

  // Reference-stable adjacency to avoid lint complaining about the unused
  // `adjacency` import — only nodes need it; edges go via source/target.
  void adjacency;

  // χ★ midpoint marker geometry. Diamond = 45°-rotated square; SVG
  // <polygon> takes the four vertex coordinates.
  const CHI_HALF = 5;
  const chiStarPolygon =
    midX !== null && midY !== null
      ? `${midX},${midY - CHI_HALF} ${midX + CHI_HALF},${midY} ${midX},${midY + CHI_HALF} ${midX - CHI_HALF},${midY}`
      : null;
  const showChiStarMarker =
    d.chiStarTier !== null &&
    !isThisSelected &&
    d.propagationSignal === 0 &&
    chiStarPolygon !== null;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray,
          opacity,
          transition: "opacity 180ms ease-out",
        }}
      />
      {/* χ★ midpoint marker — discrete violet diamond at the edge
          midpoint instead of a halo, so the load-bearing skeleton
          reads as a constellation of pips rather than smudging the
          cyan / amber edge color. Two tiers: filled diamond for
          strict bridges (cutting disconnects the graph), hollow
          outline for top-BES (high shortest-path load without
          disconnecting). Skipped on the selected edge + during
          propagation flash so those signals stay unambiguous. */}
      {showChiStarMarker && (
        <polygon
          points={chiStarPolygon!}
          fill={d.chiStarTier === "bridge" ? "#7B68EE" : "none"}
          stroke="#7B68EE"
          strokeWidth={1.5}
          opacity={opacity * 0.95}
          style={{ transition: "opacity 180ms ease-out", pointerEvents: "none" }}
        />
      )}
    </>
  );
}

const edgeTypes = { emphasized: EmphasizedEdge };

/**
 * Re-fits the viewport whenever the *set* of visible nodes changes — not just
 * the count. Keying off count alone leaves the viewport stuck on the previous
 * framing when the user swaps one isolated selection for another of equal size
 * (e.g., 3 → different 3 nodes in isolate mode), which read as a "pre-filter
 * snapshot" bug.
 */
function FitViewOnVisible({ visibleKey, isEmpty }: { visibleKey: string; isEmpty: boolean }) {
  const { fitView } = useReactFlow();
  const viewMode = useApexStore((s) => s.viewMode);
  const prevViewMode = useRef(viewMode);
  const prevKey = useRef(visibleKey);
  const hasFittedOnce = useRef(false);

  useEffect(() => {
    const becameVisible = prevViewMode.current !== "2d" && viewMode === "2d";
    const visibleSetChanged = prevKey.current !== visibleKey;
    const firstMount = !hasFittedOnce.current && viewMode === "2d" && !isEmpty;
    prevViewMode.current = viewMode;
    prevKey.current = visibleKey;

    if (isEmpty) return;
    if (becameVisible || visibleSetChanged || firstMount) {
      hasFittedOnce.current = true;
      // Small delay to let ReactFlow finish rendering the nodes
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 300 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, visibleKey, isEmpty, fitView]);

  return null;
}

function CausalDAG2DInner() {
  const graphData = useFilteredGraph();
  // Fine-grained selectors — full-store destructure re-renders this whole
  // component on any unrelated mutation (timeline scrub fires every tick).
  const truthFilter = useApexStore((s) => s.truthFilter);
  const replayActive = useApexStore((s) => s.replayActive);
  const currentEpoch = useApexStore((s) => s.currentEpoch);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const activeTimeline = useApexStore((s) => s.activeTimeline);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);

  const [selectedEdge, setSelectedEdge] = useState<CausalEdge | null>(null);

  // Drive replay ticking in DOM (outside R3F Canvas)
  useReplayTickDOM();

  // Derive current snapshot — clamp epoch index to valid range
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const clampedEpoch = Math.min(currentEpoch, Math.max(0, replayEpochs.length - 1));
  const currentSnapshot: EpochSnapshot | null =
    replayActive && replayEpochs.length > 0
      ? replayEpochs[clampedEpoch] ?? null
      : null;

  const CONTRACTION = 0.18;

  // Force-directed layout. Cached positions come from a one-shot offline
  // simulation per graph signature; live positions are written by the rAF
  // loop while a node is being dragged. Display falls back to cached when
  // no live perturbation is in flight. Filter / isolation / replay never
  // trigger a re-layout.
  const liveSimRef = useRef<LiveSimulation | null>(null);
  const rafRef = useRef<number | null>(null);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Indexed lookups — replace O(N)/O(E) find() calls in render and handlers.
  const nodeById = useMemo(
    () => new Map(graphData.nodes.map((n) => [n.id, n] as const)),
    [graphData.nodes],
  );
  const edgeById = useMemo(
    () => new Map(graphData.edges.map((e) => [e.id, e] as const)),
    [graphData.edges],
  );

  // Undirected adjacency. Drives both replay contraction (O(degree) per node
  // instead of O(E)) and hover-emphasis neighbor lookup. Built once per edge
  // set; replay tick changes don't invalidate.
  const adjacency = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of graphData.edges) {
      let s = map.get(e.source);
      if (!s) { s = []; map.set(e.source, s); }
      s.push(e.target);
      let t = map.get(e.target);
      if (!t) { t = []; map.set(e.target, t); }
      t.push(e.source);
    }
    return map;
  }, [graphData.edges]);

  // Network metrics (eigenvector / betweenness / degree). Same util the 3D
  // view uses; cached on graph signature so replay scrubs / hover don't
  // re-run the (O(E) for degree, O(N×E) for centrality) sweep. Drives
  // the 2D node-size toggle.
  const sig = useMemo(
    () => graphSignature(graphData.nodes, graphData.edges),
    [graphData.nodes, graphData.edges],
  );
  const networkMetrics = useMemo(
    () => computeNetworkMetrics(graphData.nodes, graphData.edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pin to sig
    [sig],
  );
  const [prevSig, setPrevSig] = useState<string>("");
  const [cachedLayout, setCachedLayout] = useState<Map<string, Position2D>>(
    () => new Map(),
  );
  const [livePositions, setLivePositions] = useState<Map<string, Position2D> | null>(
    null,
  );
  if (sig !== prevSig) {
    setPrevSig(sig);
    setCachedLayout(compute2DForceLayout(graphData.nodes, graphData.edges));
    setLivePositions(null);
  }
  // Defensive selector. The simple `livePositions ?? cachedLayout` was
  // vulnerable to two edge cases that left every node rendered at
  // (0, 0) — a stack-of-169-nodes-at-origin which reads as "empty
  // canvas" because they all overlap (0,0 is also outside the default
  // viewport):
  //
  //  (a) Empty live positions — `livePositions = new Map()` is non-null
  //      and shadows the cachedLayout fallback, but `.get(n.id)` always
  //      misses, so every node falls to `{ x: 0, y: 0 }`.
  //  (b) Stale live positions — when the graph swaps (persona / domain
  //      change), the rAF tick from the *old* simulation can fire after
  //      the new graph loads and call `setLivePositions(staleMap)`. The
  //      stale map's keys are the OLD graph's node IDs; new graph nodes
  //      miss the lookup and stack at the origin.
  //
  // Falling back to cachedLayout in either case keeps the canvas
  // populated until the new live sim catches up (which it will, since
  // the useEffect below rebuilds it from the freshly-computed
  // cachedLayout for the new graph).
  const nodePositions = useMemo(() => {
    if (!livePositions || livePositions.size === 0) return cachedLayout;
    if (graphData.nodes.length === 0) return cachedLayout;
    if (!livePositions.has(graphData.nodes[0].id)) return cachedLayout;
    return livePositions;
  }, [livePositions, cachedLayout, graphData.nodes]);

  // Build the live (perturbable) simulation whenever the cached layout swaps.
  // No setState here — only ref + rAF management.
  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    liveSimRef.current = create2DLiveSimulation(
      graphData.nodes,
      graphData.edges,
      cachedLayout,
    );
  }, [graphData.nodes, graphData.edges, cachedLayout]);

  // Cleanup any in-flight rAF on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startSimLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      const sim = liveSimRef.current;
      if (!sim) {
        rafRef.current = null;
        return;
      }
      sim.tick();
      setLivePositions(sim.positions());
      if (sim.alpha() > 0.005) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Emphasis state used to live as an `emphasisMap` useMemo + `emphasis` field
  // on every node's `data`, with `emphasisTarget` baked into the edges memo
  // too. That meant a single mouseenter rebuilt the entire nodes + edges
  // arrays — which made React Flow re-diff its whole DOM and read as a
  // canvas-wide blink. The new path: `CausalNode2D` and `EmphasizedEdge`
  // subscribe to `hoveredNodeId` + `selectedNode` + `multiSelectedNodes`
  // themselves (via Dag2DContext + the store) and compute their own
  // emphasis. Parent's nodes/edges arrays are now hover/select-stable.

  const nodes: Node[] = useMemo(() => {
    return graphData.nodes.map((n) => {
      const base = nodePositions.get(n.id) ?? { id: n.id, x: 0, y: 0 };
      let posX = base.x;
      let posY = base.y;

      // Replay contraction: pull stressed nodes toward stressed neighbors.
      // Applied as an offset over the dynamic layout so it doesn't fight drag.
      // Walks the precomputed adjacency list — O(degree) per node instead of
      // O(E), so per-tick cost scales with edge count rather than (nodes × edges).
      if (currentSnapshot) {
        const state = currentSnapshot.nodeStates[n.id];
        if (state && state.shockIntensity > 0.01) {
          const neighbors = adjacency.get(n.id);
          if (neighbors && neighbors.length > 0) {
            let cx = 0, cy = 0, totalWeight = 0;
            for (const nbId of neighbors) {
              const nbPos = nodePositions.get(nbId);
              if (!nbPos) continue;
              const nbState = currentSnapshot.nodeStates[nbId];
              const w = nbState ? 0.3 + nbState.shockIntensity * 0.7 : 0.1;
              cx += nbPos.x * w;
              cy += nbPos.y * w;
              totalWeight += w;
            }
            if (totalWeight > 0) {
              cx /= totalWeight;
              cy /= totalWeight;
              const pull = state.shockIntensity * CONTRACTION;
              posX = posX + (cx - posX) * pull;
              posY = posY + (cy - posY) * pull;
            }
          }
        }
      }

      const omega = n.omegaFragility.composite;
      const epochOmega = currentSnapshot?.nodeStates[n.id]?.omegaComposite ?? omega;
      const epochShock = currentSnapshot?.nodeStates[n.id]?.shockIntensity ?? 0;

      return {
        id: n.id,
        type: "causal",
        position: { x: posX, y: posY },
        data: {
          label: n.label,
          category: n.category,
          omegaComposite: epochOmega,
          domain: n.domain,
          isRestricted: truthFilter === "verified" && n.isRestricted,
          datasetColor: n.datasetColor,
          shockIntensity: epochShock,
          metrics: networkMetrics[n.id],
        },
      };
    });
  }, [graphData, nodePositions, truthFilter, currentSnapshot, adjacency, networkMetrics]);

  // Filter nodes for isolation mode
  const visibleNodes = useMemo(() => {
    if (!isolateSelection || multiSelectedNodes.length === 0) return nodes;
    const selSet = new Set(multiSelectedNodes);
    return nodes.filter((n) => selSet.has(n.id));
  }, [nodes, isolateSelection, multiSelectedNodes]);

  // χ★ result on the live filtered graph. Powers (a) the violet halo
  // behind χ★ edges in EmphasizedEdge below, and (b) the per-edge
  // BES + bridge-vs-top-k context surfaced by the EdgeInspector.
  // Brandes' BES is O(V·E); memoised on graphData so it runs only
  // when the graph changes, not on selection / hover.
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
  }, [graphData]);

  // Edges carry only structural / replay / truth-filter state. Hover and
  // single-select emphasis are computed inside `EmphasizedEdge` itself, so
  // this useMemo doesn't depend on hoveredNodeId or selectedNode — and
  // hovering no longer rebuilds the array. Selection of *another* edge
  // does still affect each edge's base opacity, so `selectedEdge` stays
  // a dep here.
  const edges: Edge<EmphasizedEdgeData>[] = useMemo(
    () =>
      graphData.edges.map((e) => {
        const isInconsistent = truthFilter === "verified" && !!e.isInconsistent;
        const propagationSignal = currentSnapshot?.edgeStates[e.id]?.propagationSignal ?? 0;
        const isSelected = selectedEdge?.id === e.id;
        const isTemporal = e.type === "temporal";
        const isConfounded = e.type === "confounded";

        const baseColor = isInconsistent
          ? "#ff1744"
          : isTemporal
            ? "#ffab00"
            : isConfounded
              ? "#ff6d00"
              : "#00e5ff";
        const baseOpacity = isSelected ? 1 : isInconsistent ? 0.6 : 0.7;
        // Power-scale weight to widen the visible width range. Real
        // edge weights cluster between 0.4 and 0.8, so a linear
        // `0.5 + w * 1.5` mapping produces 1.1–1.7px — essentially
        // indistinguishable. `pow(w, 2.4)` stretches that band into
        // 0.46–1.34 over a 0.7–3.3 width range so a thick edge reads
        // as ~3× a thin one even at typical clustering.
        const w = Math.max(0, Math.min(1, e.weight));
        const baseWidth = 0.7 + Math.pow(w, 2.4) * 3.3;
        const showArrow = e.type === "directed" || isTemporal;

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "emphasized",
          animated: isTemporal || propagationSignal > 0.3,
          markerEnd: showArrow
            ? { type: MarkerType.ArrowClosed, width: 12, height: 12, color: baseColor }
            : undefined,
          data: {
            baseColor,
            baseWidth,
            baseOpacity,
            isInconsistent,
            isTemporal,
            isConfounded,
            isSelected,
            propagationSignal,
            showArrow,
            chiStarTier: chiStarInfo.bridgeSet.has(e.id)
              ? ("bridge" as const)
              : chiStarInfo.chiStarSet.has(e.id)
                ? ("top-bes" as const)
                : null,
          },
        };
      }),
    [graphData, truthFilter, currentSnapshot, selectedEdge, chiStarInfo]
  );

  // Filter edges for isolation mode
  const visibleEdges = useMemo(() => {
    if (!isolateSelection || multiSelectedNodes.length === 0) return edges;
    const selSet = new Set(multiSelectedNodes);
    return edges.filter((e) => selSet.has(e.source) && selSet.has(e.target));
  }, [edges, isolateSelection, multiSelectedNodes]);

  // Stable key over the *set* of rendered node ids — drives FitViewOnVisible so
  // the viewport re-centers whenever the visible set changes, including
  // swaps where the count stays the same (e.g. changing the isolated selection).
  const visibleKey = useMemo(
    () => visibleNodes.map((n) => n.id).sort().join("|"),
    [visibleNodes],
  );

  const onInit = useCallback(() => {}, []);

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, rfEdge) => {
      const causalEdge = edgeById.get(rfEdge.id);
      if (causalEdge) {
        setSelectedEdge((prev) => (prev?.id === causalEdge.id ? null : causalEdge));
      }
    },
    [edgeById]
  );

  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const selectedNodesCount = useApexStore((s) => s.selectedNodes.length);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);

  // Hand-rolled shift+drag marquee. We bypass React Flow's built-in
  // selection (which is unreliable when combined with panOnDrag) and
  // mirror the pattern the Map view uses — pointer-event listeners on
  // the canvas, hit-test by DOM bounding rects, write IDs to the store.
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);
  const shiftDragRef = useRef(false);

  useEffect(() => {
    const container = flowWrapperRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      // Beat RF's pan handler — capture phase + stopPropagation.
      e.stopPropagation();
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      shiftDragRef.current = true;
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!shiftDragRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionRect((prev) => (prev ? { ...prev, x2: x, y2: y } : null));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!shiftDragRef.current) return;
      shiftDragRef.current = false;
      e.stopPropagation();
      e.preventDefault();

      setSelectionRect((rect) => {
        if (!rect) return null;
        const containerRect = container.getBoundingClientRect();
        const minX = Math.min(rect.x1, rect.x2) + containerRect.left;
        const maxX = Math.max(rect.x1, rect.x2) + containerRect.left;
        const minY = Math.min(rect.y1, rect.y2) + containerRect.top;
        const maxY = Math.max(rect.y1, rect.y2) + containerRect.top;

        // Ignore tiny drags
        if (maxX - minX < 5 && maxY - minY < 5) return null;

        // Hit-test rendered RF nodes by their DOM bounding rects. The
        // [data-id] attribute is set by React Flow on each .react-flow__node.
        const nodeEls = container.querySelectorAll<HTMLElement>(
          ".react-flow__node[data-id]"
        );
        const ids: string[] = [];
        nodeEls.forEach((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
            const id = el.getAttribute("data-id");
            if (id) ids.push(id);
          }
        });
        if (ids.length > 0) setSelectedNodes(ids);
        return null;
      });
    };

    // Use capture phase so we run before RF's listeners.
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointerup", onPointerUp, true);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [setSelectedNodes]);

  // RF's onSelectionChange is no longer the source of truth for the
  // marquee; we keep it disabled so it can't clobber the store with
  // spurious empty arrays during re-renders.
  const onSelectionChange: OnSelectionChangeFunc = useCallback(() => {
    /* intentionally empty — selection driven by the hand-rolled marquee above */
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, rfNode) => {
      setSelectedEdge(null);
      setSelectedNode(rfNode.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedEdge(null);
    setSelectedNode(null);
    setHoveredNodeId(null);
  }, [setSelectedNode]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_event, rfNode) => {
    setHoveredNodeId(rfNode.id);
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // RF fires onNodeDragStart on mousedown — even for a pure click. The
  // earlier path called `sim.reheat(0.5)` here, which made every click
  // run the layout sim for ~1.5s while alpha decayed from 0.5 to 0.005.
  // Visually that read as the canvas blanking and re-rendering "with
  // nothing selected" because the orbs drifted before settling back.
  // Now: pin immediately (cheap), but don't reheat or start the sim
  // loop until actual drag motion fires `onNodeDrag`. A pure click
  // pins → unpins, no ticks, no layout disturbance.
  const draggedRef = useRef(false);
  const onNodeDragStart: NodeMouseHandler = useCallback((_event, rfNode) => {
    const sim = liveSimRef.current;
    if (!sim) return;
    draggedRef.current = false;
    sim.pin(rfNode.id, rfNode.position.x, rfNode.position.y);
  }, []);

  const onNodeDrag: NodeMouseHandler = useCallback(
    (_event, rfNode) => {
      const sim = liveSimRef.current;
      if (!sim) return;
      if (!draggedRef.current) {
        draggedRef.current = true;
        sim.reheat(0.5);
        startSimLoop();
      }
      sim.pin(rfNode.id, rfNode.position.x, rfNode.position.y);
    },
    [startSimLoop],
  );

  const onNodeDragStop: NodeMouseHandler = useCallback((_event, rfNode) => {
    const sim = liveSimRef.current;
    if (!sim) return;
    sim.unpin(rfNode.id);
    // Only cool the sim if we actually heated it. A pure click never
    // reheated, so calling cool() here would needlessly tick the
    // simulation toward a colder state from already-cold.
    if (draggedRef.current) sim.cool();
    draggedRef.current = false;
  }, []);

  // Resolve labels for edge inspector — O(1) via nodeById Map.
  const selectedSourceLabel = selectedEdge
    ? nodeById.get(selectedEdge.source)?.label ?? selectedEdge.source
    : "";
  const selectedTargetLabel = selectedEdge
    ? nodeById.get(selectedEdge.target)?.label ?? selectedEdge.target
    : "";

  // Stable context value — adjacency only changes on graph topology change,
  // hoveredNodeId / selectedEdgeId change shape but consumer components
  // recompute themselves from these. Memoised so context-only consumers
  // (CausalNode2D, EmphasizedEdge) don't re-run their useMemo on parent
  // re-render when the values are equal.
  const dag2dContextValue = useMemo<Dag2DContextValue>(
    () => ({
      adjacency,
      hoveredNodeId,
      selectedEdgeId: selectedEdge?.id ?? null,
    }),
    [adjacency, hoveredNodeId, selectedEdge],
  );

  return (
    <Dag2DContext.Provider value={dag2dContextValue}>
    <div className="w-full h-full relative" onContextMenu={(e) => e.preventDefault()}>
      <CanvasWatermark />
      <DAGOverlay />
      <div ref={flowWrapperRef} className="absolute inset-0">
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={onInit}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode={null}
          panOnDrag
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable={true}
          nodesConnectable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1c2e" />
          <Controls showInteractive={false} position="bottom-right" />
          <FitViewOnVisible visibleKey={visibleKey} isEmpty={visibleNodes.length === 0} />
        </ReactFlow>
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
      </div>
      {selectedNodesCount > 0 && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded border border-accent-cyan/40 bg-background/90 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-accent-cyan">
            {selectedNodesCount} node{selectedNodesCount !== 1 ? "s" : ""} selected
          </span>
        </div>
      )}
      <AnimatePresence>
        {selectedEdge && (
          <EdgeInspector
            key={selectedEdge.id}
            edge={selectedEdge}
            sourceLabel={selectedSourceLabel}
            targetLabel={selectedTargetLabel}
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
    </Dag2DContext.Provider>
  );
}

export default function CausalDAG2D() {
  return (
    <ReactFlowProvider>
      <CausalDAG2DInner />
    </ReactFlowProvider>
  );
}
