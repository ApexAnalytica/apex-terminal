"use client";

import { useMemo, useState } from "react";
import { getCategoryColor } from "@/lib/graph-data";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { CausalNode } from "@/lib/types";

function layoutNodes(nodes: CausalNode[]) {
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
  const graphData = useFilteredGraph();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);

  const selSet = useMemo(() => new Set(multiSelectedNodes), [multiSelectedNodes]);
  const isScoped = isolateSelection && selSet.size > 0;

  const fciNodes = useMemo(() => {
    const base = graphData.nodes.filter(
      (n) => n.isConfounded || n.discoverySource === "FCI"
    );
    return isScoped ? base.filter((n) => selSet.has(n.id)) : base;
  }, [graphData.nodes, isScoped, selSet]);

  const fciEdges = useMemo(() => {
    const nodeIds = new Set(fciNodes.map((n) => n.id));
    return graphData.edges.filter(
      (e) =>
        e.type === "confounded" ||
        (nodeIds.has(e.source) && nodeIds.has(e.target))
    );
  }, [graphData.edges, fciNodes]);

  const positioned = useMemo(() => layoutNodes(fciNodes), [fciNodes]);
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => { m[n.id] = { x: n.x, y: n.y }; });
    return m;
  }, [positioned]);

  const uncertainCount = fciEdges.filter(
    (e) => e.type === "confounded"
  ).length;

  if (fciNodes.length === 0) {
    return (
      <div className="p-2 h-full flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-red mb-1">
          FCI
        </span>
        <span className="text-[8px] text-text-muted font-mono">No confounded nodes</span>
      </div>
    );
  }

  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-red">
            FCI
          </span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-[8px] font-mono px-1 py-0.5 rounded border transition-colors"
            style={{
              color: showInfo ? "#ff1744" : "#5a5e72",
              borderColor: showInfo ? "rgba(255,23,68,0.3)" : "rgba(90,94,114,0.3)",
              backgroundColor: showInfo ? "rgba(255,23,68,0.08)" : "transparent",
            }}
          >
            {showInfo ? "\u2212" : "?"}
          </button>
        </div>
        <span className="text-[8px] text-text-muted font-mono">
          {fciNodes.length} nodes | Latent PAG
        </span>
      </div>
      {showInfo && (
        <div className="mb-1.5 p-2 rounded border border-accent-red/20 bg-accent-red/5 space-y-1">
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            <span className="text-accent-red font-bold">Fast Causal Inference</span> detects latent confounders {"\u2014"} hidden common causes that make two nodes appear correlated without a direct causal link.
          </div>
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            <span className="text-accent-red">Dashed red edges</span> with {"\"?\""}  markers indicate uncertain causal direction due to a potential unobserved variable driving both endpoints (e.g., shared geopolitical factors).
          </div>
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            Solid edges are confident directed links. Red-filled nodes are flagged as confounded. Circular layout emphasizes the uncertainty {"\u2014"} no implied causal hierarchy.
          </div>
        </div>
      )}
      <svg
        viewBox="0 0 260 120"
        className="flex-1 w-full"
        style={{ minHeight: 0 }}
      >
        {/* Edges */}
        {fciEdges.map((edge) => {
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
                strokeWidth={0.5 + edge.weight}
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
                r={6}
                fill={isActive ? "#00e5ff" : node.isConfounded ? "#ff1744" : color}
                fillOpacity={isActive ? 0.35 : 0.2}
                stroke={isActive ? "#00e5ff" : node.isConfounded ? "#ff1744" : color}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={node.x}
                y={node.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={4.5}
                fill={isActive ? "#00e5ff" : node.isConfounded ? "#ff9a9a" : color}
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
