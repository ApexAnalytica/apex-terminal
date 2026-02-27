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
import { CausalShock } from "@/lib/types";
import { getFragilityForCategory } from "@/lib/omega-engine";

interface CausalDAGProps {
  shocks: CausalShock[];
}

const NODE_CONFIGS = [
  { id: "intelligence", label: "INTELLIGENCE", category: "intelligence", x: 400, y: 40 },
  { id: "compute", label: "COMPUTE", category: "compute", x: 200, y: 160 },
  { id: "supply", label: "SUPPLY CHAIN", category: "supply", x: 600, y: 160 },
  { id: "energy", label: "ENERGY", category: "energy", x: 100, y: 300 },
  { id: "cooling", label: "COOLING", category: "cooling", x: 400, y: 300 },
  { id: "geopolitical", label: "GEOPOLITICAL", category: "geopolitical", x: 650, y: 300 },
] as const;

const EDGE_DEFS = [
  { source: "energy", target: "compute", label: "powers" },
  { source: "cooling", target: "compute", label: "thermals" },
  { source: "compute", target: "intelligence", label: "enables" },
  { source: "supply", target: "compute", label: "provisions" },
  { source: "supply", target: "intelligence", label: "constrains" },
  { source: "geopolitical", target: "supply", label: "disrupts" },
  { source: "energy", target: "cooling", label: "drives" },
];

function getNodeColor(category: string): string {
  switch (category) {
    case "intelligence": return "#00e5ff";
    case "compute": return "#7c4dff";
    case "supply": return "#ffab00";
    case "energy": return "#00e676";
    case "cooling": return "#448aff";
    case "geopolitical": return "#ff1744";
    default: return "#5a5e72";
  }
}

function CausalNode({ data }: NodeProps) {
  const { label, category, fragility } = data as {
    label: string;
    category: string;
    fragility: number;
  };
  const color = getNodeColor(category);
  const isFractured = fragility > 0.6;
  const isStressed = fragility > 0.3;

  return (
    <motion.div
      className="relative px-5 py-3 rounded border font-mono text-[11px] tracking-wider text-center min-w-[120px]"
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} ${Math.round(5 + fragility * 15)}%, #0a0b10)`,
        color: color,
        boxShadow: fragility > 0
          ? `0 0 ${Math.round(fragility * 20)}px ${color}40, inset 0 0 ${Math.round(fragility * 10)}px ${color}20`
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

      {/* Fracture overlay */}
      {isFractured && (
        <div className="absolute inset-0 rounded overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: `linear-gradient(45deg, transparent 30%, ${color}40 50%, transparent 70%)`,
              backgroundSize: "200% 200%",
            }}
          />
        </div>
      )}

      <div className="font-[family-name:var(--font-michroma)] text-[10px]">
        {label}
      </div>
      {fragility > 0 && (
        <div className="text-[9px] mt-1 opacity-70">
          &Omega;-F: {(fragility * 100).toFixed(0)}%
        </div>
      )}
    </motion.div>
  );
}

const nodeTypes = { causal: CausalNode };

export default function CausalDAG({ shocks }: CausalDAGProps) {
  const nodes: Node[] = useMemo(
    () =>
      NODE_CONFIGS.map((cfg) => ({
        id: cfg.id,
        type: "causal",
        position: { x: cfg.x, y: cfg.y },
        data: {
          label: cfg.label,
          category: cfg.category,
          fragility: getFragilityForCategory(shocks, cfg.category),
        },
      })),
    [shocks]
  );

  const edges: Edge[] = useMemo(
    () =>
      EDGE_DEFS.map((e) => ({
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "default",
        animated: shocks.some(
          (s) => s.category === e.source || s.category === e.target
        ),
        style: {
          stroke: shocks.some(
            (s) => s.category === e.source || s.category === e.target
          )
            ? "#ff1744"
            : "#2a2d45",
          strokeWidth: 1.5,
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
      })),
    [shocks]
  );

  const onInit = useCallback(() => {}, []);

  return (
    <div className="w-full h-full relative">
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
        <Controls
          showInteractive={false}
          position="bottom-right"
        />
      </ReactFlow>

      {/* Overlay label */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] text-text-muted">
          CAUSAL DAG — AI STACK TOPOLOGY
        </div>
      </div>
    </div>
  );
}
