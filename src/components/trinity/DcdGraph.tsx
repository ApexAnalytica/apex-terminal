"use client";

import { useMemo } from "react";
import { DCD_NODES, DCD_EDGES, getCategoryColor } from "@/lib/graph-data";

// Simple 2D force layout positions for the small graph
function layoutNodes(nodes: typeof DCD_NODES) {
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
  const positioned = useMemo(() => layoutNodes(DCD_NODES), []);
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => { m[n.id] = { x: n.x, y: n.y }; });
    return m;
  }, [positioned]);

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-cyan">
          DCD / NOTEARS
        </span>
        <span className="text-[8px] text-text-muted font-mono">
          Nonlinear Structural Discovery
        </span>
      </div>
      <svg
        viewBox="0 0 260 140"
        className="flex-1 w-full"
        style={{ minHeight: 0 }}
      >
        {/* Edges */}
        {DCD_EDGES.map((edge) => {
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
              strokeWidth={1}
              strokeOpacity={0.5}
              markerEnd="url(#arrow-dcd)"
            />
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const color = getCategoryColor(node.category);
          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={8}
                fill={color}
                fillOpacity={0.2}
                stroke={color}
                strokeWidth={1}
              />
              <text
                x={node.x}
                y={node.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={6}
                fill={color}
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
