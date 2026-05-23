"use client";

import { useMemo, useState } from "react";
import { getCategoryColor } from "@/lib/graph-data";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { CausalNode } from "@/lib/types";
import { getNodeStateAt, getEdgeStateAt } from "@/lib/temporal-data";

// Time-layered layout: T-2, T-1, T-0
const TIME_COLS = [
  { label: "T-2", x: 40 },
  { label: "T-1", x: 130 },
  { label: "T-0", x: 220 },
];

/** Compute per-edge delta between window start and end states */
function computeEdgeDeltas(
  edgeId: string,
  temporalData: Parameters<typeof getEdgeStateAt>[0] extends infer T ? { edges: Map<string, T> } : never,
  windowStart: number,
  windowEnd: number,
): { weightDelta: number; stressDelta: number; significantChange: boolean } | null {
  const edgeTemporal = temporalData.edges.get(edgeId);
  if (!edgeTemporal) return null;

  const stateAtStart = getEdgeStateAt(edgeTemporal, windowStart);
  const stateAtEnd = getEdgeStateAt(edgeTemporal, windowEnd);
  if (!stateAtStart || !stateAtEnd) return null;

  const weightDelta = stateAtEnd.weight - stateAtStart.weight;
  const stressDelta = stateAtEnd.stressSignal - stateAtStart.stressSignal;
  const significantChange = Math.abs(weightDelta) > 0.05 || Math.abs(stressDelta) > 0.15;

  return { weightDelta, stressDelta, significantChange };
}

/** Compute per-node opacity based on omega delta within the window */
function computeNodeOpacity(
  nodeId: string,
  temporalData: Parameters<typeof getNodeStateAt>[0] extends infer T ? { nodes: Map<string, T> } : never,
  windowStart: number,
  windowEnd: number,
): { opacity: number; omegaDelta: number } {
  const nodeTemporal = temporalData.nodes.get(nodeId);
  if (!nodeTemporal) return { opacity: 0.2, omegaDelta: 0 };

  const stateAtStart = getNodeStateAt(nodeTemporal, windowStart);
  const stateAtEnd = getNodeStateAt(nodeTemporal, windowEnd);
  if (!stateAtStart || !stateAtEnd) return { opacity: 0.2, omegaDelta: 0 };

  const omegaDelta = stateAtEnd.omegaComposite - stateAtStart.omegaComposite;
  // Higher absolute delta → higher opacity (more active in the window)
  const normalizedDelta = Math.min(1, Math.abs(omegaDelta) / 2);
  const opacity = 0.15 + normalizedDelta * 0.85; // range 0.15 - 1.0

  return { opacity, omegaDelta };
}

export default function PcmciGraph() {
  const graphData = useFilteredGraph();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const multiSelectedNodes = useApexStore((s) => s.selectedNodes);
  const timelineSelection = useApexStore((s) => s.timelineSelection);
  const temporalData = useApexStore((s) => s.temporalData);

  const selSet = useMemo(() => new Set(multiSelectedNodes), [multiSelectedNodes]);
  const isScoped = isolateSelection && selSet.size > 0;

  const windowActive = !!(timelineSelection && temporalData);

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

    const allNodes = [...baseNodes, ...extras];
    return isScoped ? allNodes.filter((n) => selSet.has(n.id)) : allNodes;
  }, [graphData.nodes, graphData.edges, isScoped, selSet]);

  const pcmciEdges = useMemo(() => {
    const nodeIds = new Set(pcmciNodes.map((n) => n.id));
    return graphData.edges.filter(
      (e) => e.lag > 0 && nodeIds.has(e.source) && nodeIds.has(e.target)
    );
  }, [graphData.edges, pcmciNodes]);

  // Compute edge deltas when window is active
  const edgeDeltas = useMemo(() => {
    if (!windowActive || !timelineSelection || !temporalData) return new Map<string, { weightDelta: number; stressDelta: number; significantChange: boolean }>();
    const map = new Map<string, { weightDelta: number; stressDelta: number; significantChange: boolean }>();
    for (const edge of pcmciEdges) {
      const delta = computeEdgeDeltas(edge.id, temporalData, timelineSelection.start, timelineSelection.end);
      if (delta) map.set(edge.id, delta);
    }
    return map;
  }, [windowActive, timelineSelection, temporalData, pcmciEdges]);

  // Compute node opacities when window is active
  const nodeOpacities = useMemo(() => {
    if (!windowActive || !timelineSelection || !temporalData) return new Map<string, { opacity: number; omegaDelta: number }>();
    const map = new Map<string, { opacity: number; omegaDelta: number }>();
    for (const node of pcmciNodes) {
      map.set(node.id, computeNodeOpacity(node.id, temporalData, timelineSelection.start, timelineSelection.end));
    }
    return map;
  }, [windowActive, timelineSelection, temporalData, pcmciNodes]);

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

  const [showInfo, setShowInfo] = useState(false);

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
              color: showInfo ? "#ffab00" : "var(--text-muted)",
              borderColor: showInfo ? "rgba(255,171,0,0.3)" : "color-mix(in srgb, var(--text-muted) 30%, transparent)",
              backgroundColor: showInfo ? "rgba(255,171,0,0.08)" : "transparent",
            }}
          >
            {showInfo ? "\u2212" : "?"}
          </button>
          {/* Window Active badge */}
          {windowActive && (
            <span
              className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: "#00e5ff",
                backgroundColor: "rgba(0,229,255,0.12)",
                border: "1px solid rgba(0,229,255,0.3)",
              }}
            >
              WINDOW ACTIVE
            </span>
          )}
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
            fill="var(--text-muted)"
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
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        ))}

        {/* Edges */}
        {pcmciEdges.map((edge) => {
          const src = posMap[edge.source];
          const tgt = posMap[edge.target];
          if (!src || !tgt) return null;

          const delta = edgeDeltas.get(edge.id);
          let edgeColor = "#ffab00";
          let edgeOpacity = 0.6;
          let edgeWidth = 0.5 + edge.weight;

          if (windowActive && delta) {
            if (delta.significantChange) {
              // Significant change: highlight with cyan, thicker, more opaque
              edgeColor = delta.weightDelta > 0 ? "#ff1744" : "#00e5ff";
              edgeOpacity = 0.9;
              edgeWidth = 1 + Math.min(2, Math.abs(delta.weightDelta) * 4) + edge.weight;
            } else {
              // Stable edge: dim it
              edgeOpacity = 0.2;
              edgeWidth = 0.3 + edge.weight * 0.5;
            }
          }

          return (
            <line
              key={edge.id}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={edgeColor}
              strokeWidth={edgeWidth}
              strokeOpacity={edgeOpacity}
              markerEnd="url(#arrow-pcmci)"
            />
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const color = getCategoryColor(node.category);
          const isActive = selectedNode === node.id;
          const nodeData = nodeOpacities.get(node.id);
          const nodeOpacity = windowActive && nodeData ? nodeData.opacity : 1;

          return (
            <g
              key={node.id}
              style={{ cursor: "pointer", opacity: windowActive ? nodeOpacity : 1 }}
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
