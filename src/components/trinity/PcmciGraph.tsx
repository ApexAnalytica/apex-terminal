"use client";

import { useMemo, useState } from "react";
import { getCategoryColor } from "@/lib/graph-data";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { CausalNode } from "@/lib/types";

// Time-layered layout: T-2, T-1, T-0
const TIME_COLS = [
  { label: "T-2", x: 40 },
  { label: "T-1", x: 130 },
  { label: "T-0", x: 220 },
];

export default function PcmciGraph() {
  const graphData = useFilteredGraph();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);

  const pcmciNodes = useMemo(() => {
    // Start with PCMCI+ and merged nodes
    const baseNodes = graphData.nodes.filter(
      (n) => n.discoverySource === "PCMCI+" || n.discoverySource === "merged"
    );
    const nodeIds = new Set(baseNodes.map((n) => n.id));

    // Also include nodes that are sources/targets of temporal edges
    const temporalEdges = graphData.edges.filter((e) => e.lag > 0);
    const extras: CausalNode[] = [];
    temporalEdges.forEach((e) => {
      if (!nodeIds.has(e.source)) {
        const node = graphData.nodes.find((n) => n.id === e.source);
        if (node) { extras.push(node); nodeIds.add(e.source); }
      }
      if (!nodeIds.has(e.target)) {
        const node = graphData.nodes.find((n) => n.id === e.target);
        if (node) { extras.push(node); nodeIds.add(e.target); }
      }
    });

    return [...baseNodes, ...extras];
  }, [graphData.nodes, graphData.edges]);

  const pcmciEdges = useMemo(() => {
    const nodeIds = new Set(pcmciNodes.map((n) => n.id));
    return graphData.edges.filter(
      (e) => e.lag > 0 && nodeIds.has(e.source) && nodeIds.has(e.target)
    );
  }, [graphData.edges, pcmciNodes]);

  const positioned = useMemo(() => {
    // Distribute nodes across time columns based on position in causal chain
    return pcmciNodes.map((n, i) => {
      const colIdx = Math.min(2, Math.floor(i / Math.max(1, Math.ceil(pcmciNodes.length / 3))));
      const rowInCol = i % Math.max(1, Math.ceil(pcmciNodes.length / 3));
      const spacing = 90 / Math.max(1, Math.ceil(pcmciNodes.length / 3));
      return {
        ...n,
        x: TIME_COLS[colIdx].x,
        y: 25 + rowInCol * spacing + (colIdx === 1 ? 10 : 0),
      };
    });
  }, [pcmciNodes]);

  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => { m[n.id] = { x: n.x, y: n.y }; });
    return m;
  }, [positioned]);

  if (pcmciNodes.length === 0) {
    return (
      <div className="p-2 h-full flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-amber mb-1">
          PCMCI+
        </span>
        <span className="text-[8px] text-text-muted font-mono">No temporal nodes</span>
      </div>
    );
  }

  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-amber">
            PCMCI+
          </span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-[8px] font-mono px-1 py-0.5 rounded border transition-colors"
            style={{
              color: showInfo ? "#ffab00" : "#5a5e72",
              borderColor: showInfo ? "rgba(255,171,0,0.3)" : "rgba(90,94,114,0.3)",
              backgroundColor: showInfo ? "rgba(255,171,0,0.08)" : "transparent",
            }}
          >
            {showInfo ? "\u2212" : "?"}
          </button>
        </div>
        <span className="text-[8px] text-text-muted font-mono">
          {pcmciNodes.length} nodes | Temporal
        </span>
      </div>
      {showInfo && (
        <div className="mb-1.5 p-2 rounded border border-accent-amber/20 bg-accent-amber/5 space-y-1">
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            <span className="text-accent-amber font-bold">Temporal Causal Discovery</span> identifies time-lagged causal relationships using the PCMCI+ algorithm (Peter Spirtes{"'"} PC + Momentary Conditional Independence).
          </div>
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            Columns represent time steps: <span className="text-accent-amber">T-2</span> (past) {"\u2192"} <span className="text-accent-amber">T-0</span> (present). Arrows crossing columns show how shocks propagate with delays {"\u2014"} pipeline transit, procurement cycles, construction timelines.
          </div>
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            Unlike DCD above, these edges have <span className="text-accent-amber">lag {">"} 0</span>: a disruption at the source doesn{"'"}t hit the target until lag epochs later. Steeper arrows = longer delays.
          </div>
        </div>
      )}
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
        {pcmciEdges.map((edge) => {
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
              strokeWidth={0.5 + edge.weight}
              strokeOpacity={0.6}
              markerEnd="url(#arrow-pcmci)"
            />
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
                fill={isActive ? "#00e5ff" : color}
                fillOpacity={isActive ? 0.35 : 0.2}
                stroke={isActive ? "#00e5ff" : "#ffab00"}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={node.x}
                y={node.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={4.5}
                fill={isActive ? "#00e5ff" : color}
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
