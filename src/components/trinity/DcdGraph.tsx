"use client";

import { useMemo, useState } from "react";
import { getCategoryColor, getDomainColor } from "@/lib/graph-data";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { CausalNode, CausalEdge } from "@/lib/types";

const SVG_W = 280;
const SVG_H = 160;
const PAD_X = 30;
const PAD_Y = 20;

/**
 * Sugiyama-style layered layout: assign layers via longest-path from sources,
 * then spread nodes vertically within each layer with edge-crossing minimization.
 */
function layoutHierarchical(
  nodes: CausalNode[],
  edges: CausalEdge[]
): (CausalNode & { x: number; y: number })[] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      outgoing.get(e.source)?.push(e.target);
      incoming.get(e.target)?.push(e.source);
    }
  }

  // Layer assignment via longest path from sources
  const layer = new Map<string, number>();
  const sources = nodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0);

  // If no true sources (cycle), pick all nodes as potential starts
  const starts = sources.length > 0 ? sources : nodes;

  // BFS longest path
  const queue: { id: string; depth: number }[] = starts.map((n) => ({ id: n.id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if ((layer.get(id) ?? -1) >= depth) continue;
    layer.set(id, depth);
    for (const tgt of outgoing.get(id) ?? []) {
      queue.push({ id: tgt, depth: depth + 1 });
    }
  }

  // Ensure all nodes have a layer (handle disconnected nodes)
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  }

  // Group by layer
  const maxLayer = Math.max(...layer.values(), 0);
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes) {
    layers[layer.get(n.id)!].push(n.id);
  }

  // Simple barycenter ordering to reduce edge crossings
  for (let pass = 0; pass < 4; pass++) {
    for (let l = 1; l <= maxLayer; l++) {
      const bary = new Map<string, number>();
      for (const id of layers[l]) {
        const preds = incoming.get(id)?.filter((p) => layer.get(p) === l - 1) ?? [];
        if (preds.length > 0) {
          const avgPos = preds.reduce((sum, p) => sum + layers[l - 1].indexOf(p), 0) / preds.length;
          bary.set(id, avgPos);
        } else {
          bary.set(id, layers[l].indexOf(id));
        }
      }
      layers[l].sort((a, b) => (bary.get(a) ?? 0) - (bary.get(b) ?? 0));
    }
  }

  // Position: layers flow left→right
  const colCount = maxLayer + 1;
  const colWidth = colCount > 1 ? (SVG_W - PAD_X * 2) / (colCount - 1) : 0;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const result: (CausalNode & { x: number; y: number })[] = [];

  for (let l = 0; l <= maxLayer; l++) {
    const col = layers[l];
    const rowCount = col.length;
    const rowHeight = rowCount > 1 ? (SVG_H - PAD_Y * 2) / (rowCount - 1) : 0;

    for (let r = 0; r < col.length; r++) {
      const n = nodeMap.get(col[r])!;
      result.push({
        ...n,
        x: colCount > 1 ? PAD_X + l * colWidth : SVG_W / 2,
        y: rowCount > 1 ? PAD_Y + r * rowHeight : SVG_H / 2,
      });
    }
  }

  return result;
}

export default function DcdGraph() {
  const graphData = useFilteredGraph();
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

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

  const positioned = useMemo(
    () => layoutHierarchical(dcdNodes, dcdEdges),
    [dcdNodes, dcdEdges]
  );

  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    positioned.forEach((n) => {
      m[n.id] = { x: n.x, y: n.y };
    });
    return m;
  }, [positioned]);

  const hoveredNodeData = useMemo(() => {
    if (!hoveredNode) return null;
    return positioned.find((n) => n.id === hoveredNode) ?? null;
  }, [hoveredNode, positioned]);

  const hoveredEdgeData = useMemo(() => {
    if (!hoveredEdge) return null;
    return dcdEdges.find((e) => e.id === hoveredEdge) ?? null;
  }, [hoveredEdge, dcdEdges]);

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
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="flex-1 w-full"
        style={{ minHeight: 0 }}
      >
        {/* Edges */}
        {dcdEdges.map((edge) => {
          const src = posMap[edge.source];
          const tgt = posMap[edge.target];
          if (!src || !tgt) return null;
          const isHovered = hoveredEdge === edge.id;
          return (
            <g key={edge.id}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isHovered ? "#00e5ff" : "#00e5ff"}
                strokeWidth={isHovered ? 1.5 + edge.weight : 0.5 + edge.weight}
                strokeOpacity={isHovered ? 0.9 : 0.5}
                markerEnd="url(#arrow-dcd)"
              />
              {/* Wider invisible hit area for hover */}
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke="transparent"
                strokeWidth={8}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredEdge(edge.id)}
                onMouseLeave={() => setHoveredEdge(null)}
              />
              {/* Edge weight label on hover */}
              {isHovered && (
                <text
                  x={(src.x + tgt.x) / 2}
                  y={(src.y + tgt.y) / 2 - 4}
                  textAnchor="middle"
                  fontSize={6}
                  fill="#00e5ff"
                  fontFamily="monospace"
                >
                  w={edge.weight.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const color = getCategoryColor(node.category);
          const r = 4 + (node.omegaFragility.composite / 10) * 6;
          const isActive = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          return (
            <g
              key={node.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedNode(isActive ? null : node.id)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={isActive ? "#00e5ff" : color}
                fillOpacity={isActive ? 0.35 : isHovered ? 0.3 : 0.2}
                stroke={isActive ? "#00e5ff" : isHovered ? "#00e5ff" : color}
                strokeWidth={isActive ? 2 : isHovered ? 1.5 : 1}
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

        {/* Hover tooltip for nodes */}
        {hoveredNodeData && (
          <foreignObject
            x={Math.min(hoveredNodeData.x + 10, SVG_W - 100)}
            y={Math.max(hoveredNodeData.y - 40, 2)}
            width={95}
            height={50}
          >
            <div
              style={{
                background: "rgba(10, 11, 16, 0.95)",
                border: "1px solid rgba(0, 229, 255, 0.3)",
                borderRadius: 3,
                padding: "3px 5px",
                fontFamily: "monospace",
                fontSize: 6,
                color: "#c8cad0",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: 7, color: "#fff", marginBottom: 2 }}>
                {hoveredNodeData.label}
              </div>
              <div>
                <span style={{ color: "#5a5e72" }}>{"\u03A9"} </span>
                <span style={{ color: "#00e5ff" }}>
                  {hoveredNodeData.omegaFragility.composite.toFixed(1)}
                </span>
              </div>
              <div style={{ color: getDomainColor(hoveredNodeData.domain), fontSize: 5, marginTop: 1 }}>
                {hoveredNodeData.domain.toUpperCase()}
              </div>
            </div>
          </foreignObject>
        )}

        {/* Hover tooltip for edges */}
        {hoveredEdgeData && (() => {
          const src = posMap[hoveredEdgeData.source];
          const tgt = posMap[hoveredEdgeData.target];
          if (!src || !tgt) return null;
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          return (
            <foreignObject
              x={Math.min(mx + 5, SVG_W - 100)}
              y={Math.max(my - 30, 2)}
              width={95}
              height={40}
            >
              <div
                style={{
                  background: "rgba(10, 11, 16, 0.95)",
                  border: "1px solid rgba(0, 229, 255, 0.3)",
                  borderRadius: 3,
                  padding: "3px 5px",
                  fontFamily: "monospace",
                  fontSize: 6,
                  color: "#c8cad0",
                }}
              >
                <div style={{ fontSize: 5, color: "#5a5e72" }}>
                  {hoveredEdgeData.physicalMechanism || "—"}
                </div>
                <div style={{ marginTop: 1 }}>
                  <span style={{ color: "#5a5e72" }}>w=</span>
                  <span style={{ color: "#00e5ff" }}>{hoveredEdgeData.weight.toFixed(2)}</span>
                  <span style={{ color: "#5a5e72", marginLeft: 4 }}>conf=</span>
                  <span style={{ color: "#00e5ff" }}>{(hoveredEdgeData.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </foreignObject>
          );
        })()}

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
