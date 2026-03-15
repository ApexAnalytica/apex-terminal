"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";

export default function DAGOverlay() {
  const { graphData, activeModule, viewMode, setViewMode, truthFilter, selectedNode, setSelectedNode, isLive, timelinePosition } = useApexStore();
  const { graph: temporalGraph } = useTemporalGraph();
  const activeGraph = isLive ? graphData : temporalGraph;
  const meta = activeGraph.metadata;

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return activeGraph.nodes.find((n) => n.id === selectedNode) ?? null;
  }, [selectedNode, activeGraph.nodes]);

  // Domain legend: count nodes per domain
  const domainCounts = useMemo(() => {
    const map: Record<string, number> = {};
    activeGraph.nodes.forEach((n) => {
      map[n.domain] = (map[n.domain] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [activeGraph.nodes]);

  // Top-Ω nodes
  const topOmega = useMemo(() => {
    return [...activeGraph.nodes]
      .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
      .slice(0, 5);
  }, [activeGraph.nodes]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Focus bar (when node selected) */}
      {selectedNodeData && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3">
          <button
            onClick={() => setSelectedNode(null)}
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1.5 rounded border border-accent-cyan/50 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
          >
            &larr; DESELECT
          </button>
          <span className="text-[9px] font-mono text-accent-cyan">
            FOCUSED: {selectedNodeData.label}
          </span>
        </div>
      )}

      {/* Top Left: Title */}
      <div className="absolute top-3 left-3">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] text-text-muted">
          GENERATED CAUSAL DAG ({viewMode.toUpperCase()} DRAFT)
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          {activeModule.toUpperCase()} ENGINE ACTIVE
        </div>
      </div>

      {/* Top Right: Method badges + controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-border text-text-muted bg-surface-elevated">
          RENDERING: {viewMode === "3d" ? "WEBGL_3D" : "REACTFLOW_2D"}
        </span>
        <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-border text-text-muted bg-surface-elevated">
          METHOD: DCD / NOTEARS
        </span>
        <button
          onClick={() => setViewMode(viewMode === "3d" ? "2d" : "3d")}
          className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1 rounded border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
        >
          {viewMode === "3d" ? "\u2192 2D" : "\u2192 3D"}
        </button>
      </div>

      {/* Temporal scrub indicator */}
      {!isLive && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2">
          <div
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border"
            style={{
              borderColor: "var(--accent-amber)",
              backgroundColor: "rgba(255,171,0,0.08)",
              color: "var(--accent-amber)",
            }}
          >
            HISTORICAL VIEW — {new Date(timelinePosition).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      )}

      {/* Truth filter badge */}
      {truthFilter === "verified" && (
        <div className="absolute top-12 left-3">
          <div className="text-[8px] font-mono px-2 py-0.5 rounded border border-accent-red/40 text-accent-red bg-accent-red/5">
            TARSKI FILTER ACTIVE — {meta.inconsistentEdges} INCONSISTENT | {meta.restrictedNodes} RESTRICTED
          </div>
        </div>
      )}

      {/* Top Right below controls: Top-Ω ranking */}
      <div className="absolute top-12 right-3">
        <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-border bg-surface-elevated/80">
          <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
            TOP-{"\u03A9"} NODES
          </div>
          {topOmega.map((node, i) => (
            <div key={node.id} className="flex items-center gap-1.5 py-0.5">
              <span className="text-[7px] text-text-muted w-3">{i + 1}.</span>
              <span
                className="text-[8px] font-bold"
                style={{
                  color: node.omegaFragility.composite > 9 ? "#ff1744"
                    : node.omegaFragility.composite >= 7 ? "#ffab00"
                    : "#00e676",
                }}
              >
                {node.omegaFragility.composite.toFixed(1)}
              </span>
              <span className="text-[8px] text-text-muted truncate max-w-[120px]">
                {node.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Left: Domain legend */}
      <div className="absolute bottom-12 left-3">
        <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-border bg-surface-elevated/80">
          <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
            DOMAINS
          </div>
          <div className="flex flex-col gap-0.5">
            {domainCounts.map(([domain, count]) => (
              <div key={domain} className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getDomainColor(domain) }}
                />
                <span className="text-[8px] text-text-muted">
                  {domain}
                </span>
                <span className="text-[7px] text-text-muted/50">
                  ({count})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Left (lower): Structural metrics */}
      <div className="absolute bottom-3 left-3">
        <div className="flex gap-4 text-[9px] font-mono text-text-muted">
          <span>NODES: {meta.totalNodes}</span>
          <span>EDGES: {meta.totalEdges}</span>
          <span>DENSITY: {meta.density.toFixed(3)}</span>
          <span>CONSTRAINT: {meta.constraintType.split("+")[0].trim()}</span>
        </div>
      </div>

      {/* Bottom Right: Control hints */}
      {viewMode === "3d" && (
        <div className="absolute bottom-3 right-3">
          <div className="text-[8px] font-mono text-text-muted/50">
            DRAG: ORBIT | SCROLL: ZOOM | RIGHT-CLICK: PAN | DOUBLE-CLICK: FOCUS | ESC: DESELECT
          </div>
        </div>
      )}
    </div>
  );
}
