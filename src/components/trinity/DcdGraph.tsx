"use client";

import { useMemo } from "react";
import { getCategoryColor } from "@/lib/graph-data";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { CausalNode, CausalEdge } from "@/lib/types";

function layoutNodes(nodes: CausalNode[]) {
  const w = 260;
  const h = 140;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.35;

  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      ...n,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

export default function DcdGraph() {
  const graphData = useFilteredGraph();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);

  const dcdNodes = useMemo(() => {
    return graphData.nodes.filter(
      (n) => n.discoverySource === "DCD" || n.discoverySource === "merged"
    );
  }, [graphData.nodes]);

  const dcdEdges = useMemo(() => {
    const nodeIds = new Set(dcdNodes.map((n) => n.id));
    return graphData.edges.filter(
      (e) =>
        e.type === "directed" && nodeIds.has(e.source) && nodeIds.has(e.target)
    );
  }, [graphData.edges, dcdNodes]);

  const positioned = useMemo(() => layoutNodes(dcdNodes), [dcdNodes]);
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => { m[n.id] = { x: n.x, y: n.y }; });
    return m;
  }, [positioned]);

  if (dcdNodes.length === 0) {
    return (
      <div className="p-2 h-full flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-cyan mb-1">
          DCD / NOTEARS
        </span>
        <span className="text-[8px] text-text-muted font-mono">No structural nodes</span>
      </div>
    );
  }

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-cyan">
          DCD / NOTEARS
        </span>
        <span className="text-[8px] text-text-muted font-mono">
          {dcdNodes.length} nodes | Structural
        </span>
      </div>
      <svg
        viewBox="0 0 260 140"
        className="flex-1 w-full"
        style={{ minHeight: 0 }}
      >
        {/* Edges */}
        {dcdEdges.map((edge) => {
          const src = posMap[edge.source];
          const tgt = posMap[edge.target];
          if (!src || !tgt) return null;
          return (
            <line
              key={edge.id}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke="#00e5ff"
              strokeWidth={0.5 + edge.weight}
              strokeOpacity={0.5}
              markerEnd="url(#arrow-dcd)"
            />
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const color = getCategoryColor(node.category);
          const r = 4 + (node.omegaFragility.composite / 10) * 6;
          const isActive = selectedNode === node.id;
          return (
            <g
              key={node.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedNode(isActive ? null : node.id)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={isActive ? "#00e5ff" : color}
                fillOpacity={isActive ? 0.35 : 0.2}
                stroke={isActive ? "#00e5ff" : color}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={node.x}
                y={node.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={5}
                fill={isActive ? "#00e5ff" : color}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {node.shortLabel}
              </text>
            </g>
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker
            id="arrow-dcd"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#00e5ff" fillOpacity={0.5} />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
