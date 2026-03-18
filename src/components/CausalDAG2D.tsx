"use client";

import { useCallback, useMemo, useState } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getCategoryColor } from "@/lib/graph-data";
import DAGOverlay from "./dag3d/DAGOverlay";
import { useReplayTickDOM } from "@/lib/useReplayTick";
import type { CausalEdge, EpochSnapshot } from "@/lib/types";
import { AnimatePresence } from "framer-motion";

function CausalNode2D({ data, selected }: NodeProps) {
  const { label, category, omegaComposite, isRestricted, domain, datasetColor, shockIntensity } = data;
  const color = datasetColor ?? getCategoryColor(category);
  const isFractured = omegaComposite > 9;
  const isStressed = omegaComposite > 7;
  const shockGlow = shockIntensity ?? 0;

  const selectionGlow = selected
    ? "0 0 12px #00e5ff80, 0 0 24px #00e5ff40"
    : "";

  return (
    <motion.div
      className="relative px-5 py-3 rounded border font-mono text-[11px] tracking-wider text-center min-w-[120px]"
      style={{
        borderColor: selected ? "#00e5ff" : isRestricted ? "#ff1744" : color,
        backgroundColor: `color-mix(in srgb, ${color} ${Math.round(5 + (omegaComposite / 10) * 15)}%, #0a0b10)`,
        color,
        boxShadow: [
          selectionGlow,
          shockGlow > 0
            ? `0 0 ${Math.round(shockGlow * 30)}px ${color}80, 0 0 ${Math.round(shockGlow * 15)}px ${color}40, inset 0 0 ${Math.round(shockGlow * 10)}px ${color}30`
            : omegaComposite > 0
              ? `0 0 ${Math.round((omegaComposite / 10) * 20)}px ${color}40, inset 0 0 ${Math.round((omegaComposite / 10) * 10)}px ${color}20`
              : "",
        ].filter(Boolean).join(", ") || "none",
      }}
      animate={
        shockGlow > 0.3
          ? {
              scale: [1, 1 + shockGlow * 0.06, 1],
              borderColor: [color, "#ffab00", color],
            }
          : isFractured
            ? { borderColor: [color, "#ff1744", color], scale: [1, 1.02, 1] }
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
    >
      <Handle type="target" position={Position.Top} style={{ background: "transparent", border: "none", width: 0, height: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: "transparent", border: "none", width: 0, height: 0 }} />
      <Handle type="target" position={Position.Left} style={{ background: "transparent", border: "none", width: 0, height: 0 }} id="left-target" />
      <Handle type="source" position={Position.Right} style={{ background: "transparent", border: "none", width: 0, height: 0 }} id="right-source" />

      <div className="font-[family-name:var(--font-michroma)] text-[10px]">
        {label}
      </div>
      <div className="text-[8px] mt-0.5 opacity-50">
        {domain}
      </div>
      {omegaComposite > 0 && (
        <div className="text-[9px] mt-1 opacity-70">
          {"\u03A9"} {omegaComposite.toFixed(1)}
        </div>
      )}
      {isRestricted && (
        <div className="text-[8px] mt-0.5 text-accent-red">RESTRICTED</div>
      )}
    </motion.div>
  );
}

function EdgeInspector({
  edge,
  sourceLabel,
  targetLabel,
  onClose,
}: {
  edge: CausalEdge;
  sourceLabel: string;
  targetLabel: string;
  onClose: () => void;
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
      </div>
    </motion.div>
  );
}

const nodeTypes = { causal: CausalNode2D };

export default function CausalDAG2D() {
  const graphData = useFilteredGraph();
  const {
    truthFilter,
    replayActive,
    currentEpoch,
    baselineEpochs,
    interventionEpochs,
    activeTimeline,
  } = useApexStore();

  const [selectedEdge, setSelectedEdge] = useState<CausalEdge | null>(null);

  // Drive replay ticking in DOM (outside R3F Canvas)
  useReplayTickDOM();

  // Derive current snapshot
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const currentSnapshot: EpochSnapshot | null =
    replayActive && replayEpochs.length > 0
      ? replayEpochs[currentEpoch] ?? null
      : null;

  const CONTRACTION = 0.18;

  // Stable hash: deterministic position per node ID (won't jump when nodes are filtered)
  const idHash = useCallback((id: string): number => {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }, []);

  const nodes: Node[] = useMemo(() => {
    // Vertical layout: 5 columns, nodes flow top-to-bottom
    // Stable positions based on node ID hash — won't jump when filtered
    const COLS = 5;
    const COL_W = 220;
    const ROW_H = 130;

    // Sort nodes by domain then by ID hash for consistent vertical ordering
    const domainOrder: Record<string, number> = {
      "Saudi Aramco Energy": 0,
      "QatarEnergy LNG": 1,
      "QAFCO Fertilizer": 2,
      "Ma'aden Phosphate": 3,
    };
    const sorted = [...graphData.nodes].sort((a, b) => {
      const da = domainOrder[a.domain] ?? 4;
      const db = domainOrder[b.domain] ?? 4;
      if (da !== db) return da - db;
      return idHash(a.id) - idHash(b.id);
    });

    // Assign stable column/row positions
    const positions = new Map<string, { x: number; y: number }>();
    sorted.forEach((n, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      // Slight jitter from ID hash for organic feel, but small (±20px)
      const h = idHash(n.id);
      const jitterX = ((h % 41) - 20);
      const jitterY = ((h % 37) - 18);
      positions.set(n.id, {
        x: col * COL_W + 50 + jitterX,
        y: row * ROW_H + 30 + jitterY,
      });
    });

    return graphData.nodes.map((n) => {
      const base = positions.get(n.id) ?? { x: 0, y: 0 };
      const omega = n.omegaFragility.composite;

      // Smooth gradual drift based on omega — continuous function, no popping
      // omega ranges 0-10, so drift is gentle and proportional
      const h = idHash(n.id);
      const driftX = Math.sin(omega * 0.3 + h * 0.0007) * 10;
      const driftY = Math.cos(omega * 0.25 + h * 0.0011) * 8;
      let posX = base.x + driftX;
      let posY = base.y + driftY;

      // Apply contraction during replay
      if (currentSnapshot) {
        const state = currentSnapshot.nodeStates[n.id];
        if (state && state.shockIntensity > 0.01) {
          let cx = 0, cy = 0, totalWeight = 0;
          for (const edge of graphData.edges) {
            const nbId = edge.source === n.id ? edge.target : edge.target === n.id ? edge.source : null;
            if (!nbId) continue;
            const nbPos = positions.get(nbId);
            const nbState = currentSnapshot.nodeStates[nbId];
            if (!nbPos) continue;
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
        },
      };
    });
  }, [graphData, truthFilter, currentSnapshot, idHash]);

  const edges: Edge[] = useMemo(
    () =>
      graphData.edges.map((e) => {
        const isInconsistent = truthFilter === "verified" && e.isInconsistent;
        const propagationSignal = currentSnapshot?.edgeStates[e.id]?.propagationSignal ?? 0;
        const isSelected = selectedEdge?.id === e.id;

        const baseColor = isInconsistent
          ? "#ff1744"
          : e.type === "temporal"
            ? "#ffab00"
            : e.type === "confounded"
              ? "#ff6d00"
              : "#00e5ff";

        // Boost opacity and use amber tint when signal is active
        const edgeColor = propagationSignal > 0
          ? "#ffab00"
          : baseColor;

        const baseOpacity = isSelected ? 1 : isInconsistent ? 0.6 : 0.7;
        const opacity = propagationSignal > 0
          ? Math.min(1, baseOpacity + propagationSignal * 0.3)
          : selectedEdge && !isSelected ? 0.15 : baseOpacity;

        const baseWidth = 0.5 + e.weight * 1.5;
        const strokeWidth = isSelected
          ? baseWidth + 1.5
          : propagationSignal > 0
            ? baseWidth + propagationSignal * 2
            : baseWidth;

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "default",
          animated: e.type === "temporal" || propagationSignal > 0.3,
          markerEnd: e.type === "directed" || e.type === "temporal"
            ? { type: MarkerType.ArrowClosed, width: 12, height: 12, color: edgeColor }
            : undefined,
          style: {
            stroke: edgeColor,
            strokeWidth,
            strokeDasharray: e.type === "confounded" || isInconsistent ? "5,5" : undefined,
            opacity,
          },
          labelStyle: {
            fill: "#5a5e72",
            fontSize: 9,
            fontFamily: "monospace",
          },
          labelBgStyle: {
            fill: "#0a0b10",
            fillOpacity: 0.8,
          },
        };
      }),
    [graphData, truthFilter, currentSnapshot, selectedEdge]
  );

  const onInit = useCallback(() => {}, []);

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, rfEdge) => {
      const causalEdge = graphData.edges.find((e) => e.id === rfEdge.id);
      if (causalEdge) {
        setSelectedEdge((prev) => (prev?.id === causalEdge.id ? null : causalEdge));
      }
    },
    [graphData.edges]
  );

  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const selectedNodesCount = useApexStore((s) => s.selectedNodes.length);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selNodes }) => {
      setSelectedNodes(selNodes.map((n) => n.id));
    },
    [setSelectedNodes]
  );

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
  }, [setSelectedNode]);

  // Resolve labels for edge inspector
  const selectedSourceLabel = selectedEdge
    ? graphData.nodes.find((n) => n.id === selectedEdge.source)?.label ?? selectedEdge.source
    : "";
  const selectedTargetLabel = selectedEdge
    ? graphData.nodes.find((n) => n.id === selectedEdge.target)?.label ?? selectedEdge.target
    : "";

  return (
    <div className="w-full h-full relative">
      <DAGOverlay />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1]}
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
      </ReactFlow>
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
