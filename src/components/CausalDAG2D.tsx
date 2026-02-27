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
import { getCategoryColor } from "@/lib/graph-data";
import DAGOverlay from "./dag3d/DAGOverlay";

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  semi_yield: { x: 400, y: 20 },
  ai_compute: { x: 200, y: 150 },
  industrial_output: { x: 600, y: 150 },
  credit_contraction: { x: 400, y: 280 },
  dc_power: { x: 100, y: 280 },
  banking_liquidity: { x: 600, y: 400 },
  rare_earth: { x: 50, y: 120 },
  grid_stability: { x: 0, y: 400 },
  trade_policy: { x: 750, y: 280 },
  cooling_capacity: { x: 200, y: 400 },
};

function CausalNode2D({ data }: NodeProps) {
  const { label, category, riskScore, isRestricted } = data;
  const color = getCategoryColor(category);
  const isFractured = riskScore > 0.6;
  const isStressed = riskScore > 0.3;

  return (
    <motion.div
      className="relative px-5 py-3 rounded border font-mono text-[11px] tracking-wider text-center min-w-[120px]"
      style={{
        borderColor: isRestricted ? "#ff1744" : color,
        backgroundColor: `color-mix(in srgb, ${color} ${Math.round(5 + riskScore * 15)}%, #0a0b10)`,
        color,
        boxShadow: riskScore > 0
          ? `0 0 ${Math.round(riskScore * 20)}px ${color}40, inset 0 0 ${Math.round(riskScore * 10)}px ${color}20`
          : "none",
      }}
      animate={
        isFractured
          ? { borderColor: [color, "#ff1744", color], scale: [1, 1.02, 1] }
          : isStressed
            ? { opacity: [1, 0.7, 1] }
            : {}
      }
      transition={
        isFractured
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
      {riskScore > 0 && (
        <div className="text-[9px] mt-1 opacity-70">
          RISK: {(riskScore * 100).toFixed(0)}%
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
  const { graphData, truthFilter } = useApexStore();

  const nodes: Node[] = useMemo(
    () =>
      graphData.nodes.map((n) => ({
        id: n.id,
        type: "causal",
        position: NODE_POSITIONS[n.id] || { x: Math.random() * 600, y: Math.random() * 400 },
        data: {
          label: n.label,
          category: n.category,
          riskScore: n.riskScore,
          isRestricted: truthFilter === "verified" && n.isRestricted,
        },
      })),
    [graphData, truthFilter]
  );

  const edges: Edge[] = useMemo(
    () =>
      graphData.edges.map((e) => {
        const isInconsistent = truthFilter === "verified" && e.isInconsistent;
        const edgeColor = isInconsistent
          ? "#ff1744"
          : e.type === "temporal"
            ? "#ffab00"
            : e.type === "confounded"
              ? "#ff6d00"
              : "#00e5ff";

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "default",
          animated: e.type === "temporal",
          style: {
            stroke: edgeColor,
            strokeWidth: 1.5,
            strokeDasharray: e.type === "confounded" || isInconsistent ? "5,5" : undefined,
            opacity: isInconsistent ? 0.6 : 0.7,
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
    [graphData, truthFilter]
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
        minZoom={0.5}
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
