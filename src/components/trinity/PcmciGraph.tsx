"use client";

import { useMemo } from "react";
import { PCMCI_NODES, PCMCI_EDGES, getCategoryColor } from "@/lib/graph-data";

// Time-layered layout: T-2, T-1, T-0
const TIME_COLS = [
  { label: "T-2", x: 40 },
  { label: "T-1", x: 130 },
  { label: "T-0", x: 220 },
];

export default function PcmciGraph() {
  const positioned = useMemo(() => {
    // Distribute nodes across time columns based on temporal role
    const nodes = PCMCI_NODES.map((n, i) => {
      // Assign to time columns based on position in causal chain
      const colIdx = Math.min(2, Math.floor(i / 2));
      const rowIdx = i % 2;
      return {
        ...n,
        x: TIME_COLS[colIdx].x,
        y: 35 + rowIdx * 50 + (colIdx === 1 ? 15 : 0),
      };
    });
    return nodes;
  }, []);

  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => { m[n.id] = { x: n.x, y: n.y }; });
    return m;
  }, [positioned]);

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-amber">
          PCMCI+
        </span>
        <span className="text-[8px] text-text-muted font-mono">
          Temporal Causal Graph
        </span>
      </div>
      <svg
        viewBox="0 0 260 120"
        className="flex-1 w-full"
        style={{ minHeight: 0 }}
      >
        {/* Time column labels */}
        {TIME_COLS.map((col) => (
          <text
            key={col.label}
            x={col.x}
            y={14}
            textAnchor="middle"
            fontSize={7}
            fill="#5a5e72"
            fontFamily="monospace"
          >
            {col.label}
          </text>
        ))}

        {/* Time column lines */}
        {TIME_COLS.map((col) => (
          <line
            key={`line-${col.label}`}
            x1={col.x}
            y1={20}
            x2={col.x}
            y2={110}
            stroke="#1a1c2e"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        ))}

        {/* Edges */}
        {PCMCI_EDGES.map((edge) => {
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
              stroke="#ffab00"
              strokeWidth={1.2}
              strokeOpacity={0.6}
              markerEnd="url(#arrow-pcmci)"
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
                stroke="#ffab00"
                strokeWidth={1}
              />
              <text
                x={node.x}
                y={node.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={5.5}
                fill={color}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {node.shortLabel}
              </text>
            </g>
          );
        })}

        <defs>
          <marker
            id="arrow-pcmci"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffab00" fillOpacity={0.6} />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
