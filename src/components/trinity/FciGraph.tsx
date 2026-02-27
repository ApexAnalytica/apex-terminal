"use client";

import { useMemo } from "react";
import { FCI_NODES, FCI_EDGES, getCategoryColor } from "@/lib/graph-data";

function layoutNodes(nodes: typeof FCI_NODES) {
  const w = 260;
  const h = 120;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.3;

  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      ...n,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

export default function FciGraph() {
  const positioned = useMemo(() => layoutNodes(FCI_NODES), []);
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => { m[n.id] = { x: n.x, y: n.y }; });
    return m;
  }, [positioned]);

  const uncertainCount = FCI_EDGES.filter(
    (e) => e.type === "confounded"
  ).length;

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-red">
          FCI
        </span>
        <span className="text-[8px] text-text-muted font-mono">
          Latent Confounding Graph (PAG)
        </span>
      </div>
      <svg
        viewBox="0 0 260 120"
        className="flex-1 w-full"
        style={{ minHeight: 0 }}
      >
        {/* Edges */}
        {FCI_EDGES.map((edge) => {
          const src = posMap[edge.source];
          const tgt = posMap[edge.target];
          if (!src || !tgt) return null;
          const isConfounded = edge.type === "confounded";
          return (
            <g key={edge.id}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isConfounded ? "#ff1744" : "#ff6d00"}
                strokeWidth={1}
                strokeOpacity={0.5}
                strokeDasharray={isConfounded ? "4,3" : undefined}
              />
              {isConfounded && (
                <text
                  x={(src.x + tgt.x) / 2}
                  y={(src.y + tgt.y) / 2 - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#ff1744"
                  fillOpacity={0.7}
                >
                  ?
                </text>
              )}
            </g>
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
                fill={node.isConfounded ? "#ff1744" : color}
                fillOpacity={0.2}
                stroke={node.isConfounded ? "#ff1744" : color}
                strokeWidth={1}
              />
              <text
                x={node.x}
                y={node.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={5.5}
                fill={node.isConfounded ? "#ff9a9a" : color}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {node.shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="text-[8px] text-text-muted font-mono text-right">
        Uncertain Confounders: {uncertainCount}
      </div>
    </div>
  );
}
