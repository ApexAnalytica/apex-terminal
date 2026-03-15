"use client";

import { useCallback, useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  NodeProps,
  Handle,
  Position,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getCategoryColor } from "@/lib/graph-data";
import DAGOverlay from "./dag3d/DAGOverlay";
import { useReplayTickDOM } from "@/lib/useReplayTick";
import type { EpochSnapshot } from "@/lib/types";

function CausalNode2D({ data }: NodeProps) {
  const { label, category, omegaComposite, isRestricted, domain, datasetColor, shockIntensity } = data;
  const color = datasetColor ?? getCategoryColor(category);
  const isFractured = omegaComposite > 9;
  const isStressed = omegaComposite > 7;
  const shockGlow = shockIntensity ?? 0;

  return (
    <motion.div
      className="relative px-5 py-3 rounded border font-mono text-[11px] tracking-wider text-center min-w-[120px]"
      style={{
        borderColor: isRestricted ? "#ff1744" : color,
        backgroundColor: `color-mix(in srgb, ${color} ${Math.round(5 + (omegaComposite / 10) * 15)}%, #0a0b10)`,
        color,
        boxShadow: shockGlow > 0
          ? `0 0 ${Math.round(shockGlow * 30)}px ${color}80, 0 0 ${Math.round(shockGlow * 15)}px ${color}40, inset 0 0 ${Math.round(shockGlow * 10)}px ${color}30`
          : omegaComposite > 0
            ? `0 0 ${Math.round((omegaComposite / 10) * 20)}px ${color}40, inset 0 0 ${Math.round((omegaComposite / 10) * 10)}px ${color}20`
            : "none",
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

  // Drive replay ticking in DOM (outside R3F Canvas)
  useReplayTickDOM();

  // Derive current snapshot
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const currentSnapshot: EpochSnapshot | null =
    replayActive && replayEpochs.length > 0
      ? replayEpochs[currentEpoch] ?? null
      : null;

  const CONTRACTION = 0.18;

  const nodes: Node[] = useMemo(() => {
    // Compute base positions
    const basePositions = graphData.nodes.map((n, i) => ({
      id: n.id,
      x: (i % 5) * 200 + 50 + (Math.sin(i * 1.7) * 40),
      y: Math.floor(i / 5) * 160 + 30 + (Math.cos(i * 2.3) * 30),
    }));

    // Build adjacency map for contraction
    const neighbors = new Map<string, string[]>();
    if (currentSnapshot) {
      for (const edge of graphData.edges) {
        if (!neighbors.has(edge.source)) neighbors.set(edge.source, []);
        if (!neighbors.has(edge.target)) neighbors.set(edge.target, []);
        neighbors.get(edge.source)!.push(edge.target);
        neighbors.get(edge.target)!.push(edge.source);
      }
    }

    // Build position lookup for contraction
    const posLookup = new Map<string, { x: number; y: number }>();
    for (const bp of basePositions) {
      posLookup.set(bp.id, { x: bp.x, y: bp.y });
    }

    return graphData.nodes.map((n, i) => {
      const base = basePositions[i];
      let posX = base.x;
      let posY = base.y;

      // Apply contraction during replay
      if (currentSnapshot) {
        const state = currentSnapshot.nodeStates[n.id];
        if (state && state.shockIntensity > 0.01) {
          const nbs = neighbors.get(n.id) ?? [];
          let cx = 0, cy = 0, totalWeight = 0;
          for (const nbId of nbs) {
            const nbState = currentSnapshot.nodeStates[nbId];
            const nbPos = posLookup.get(nbId);
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
            posX = base.x + (cx - base.x) * pull;
            posY = base.y + (cy - base.y) * pull;
          }
        }
      }

      const epochOmega = currentSnapshot?.nodeStates[n.id]?.omegaComposite ?? n.omegaFragility.composite;
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
  }, [graphData, truthFilter, currentSnapshot]);

  const edges: Edge[] = useMemo(
    () =>
      graphData.edges.map((e) => {
        const isInconsistent = truthFilter === "verified" && e.isInconsistent;
        const propagationSignal = currentSnapshot?.edgeStates[e.id]?.propagationSignal ?? 0;

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

        const baseOpacity = isInconsistent ? 0.6 : 0.7;
        const opacity = propagationSignal > 0
          ? Math.min(1, baseOpacity + propagationSignal * 0.3)
          : baseOpacity;

        const baseWidth = 0.5 + e.weight * 1.5;
        const strokeWidth = propagationSignal > 0
          ? baseWidth + propagationSignal * 2
          : baseWidth;

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "default",
          animated: e.type === "temporal" || propagationSignal > 0.3,
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
    [graphData, truthFilter, currentSnapshot]
  );

  const onInit = useCallback(() => {}, []);

  return (
    <div className="w-full h-full relative">
      <DAGOverlay />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
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
    </div>
  );
}
