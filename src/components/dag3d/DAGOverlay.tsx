"use client";

import { useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";

export default function DAGOverlay() {
  // Fine-grained selectors so this component only re-renders when its own
  // slices change, not on any store mutation (item #4).
  const graphData = useApexStore((s) => s.graphData);
  const activeModule = useApexStore((s) => s.activeModule);
  const viewMode = useApexStore((s) => s.viewMode);
  const setViewMode = useApexStore((s) => s.setViewMode);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const setIsolateSelection = useApexStore((s) => s.setIsolateSelection);
  const addCopilotMessage = useApexStore((s) => s.addCopilotMessage);
  const isLive = useApexStore((s) => s.isLive);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const { graph: temporalGraph } = useTemporalGraph();
  const activeGraph = isLive ? graphData : temporalGraph;
  const meta = activeGraph.metadata;

  // O(1) id → node lookup, used both inside this component and by the
  // selection / domain-filter handlers below. Replaces O(N²) Array.find
  // calls that ran inside selectedNodes.map() loops.
  const nodeById = useMemo(
    () => new Map(activeGraph.nodes.map((n) => [n.id, n] as const)),
    [activeGraph.nodes],
  );

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodeById.get(selectedNode) ?? null;
  }, [selectedNode, nodeById]);

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

      {/* Top Right: View-mode cycle buttons. The previous RENDERING /
          METHOD info badges (WEBGL_3D / REACTFLOW_2D / DCD / NOTEARS) were
          internal stack details that didn't help end users — removed so
          the corner stays clean. View labels still say which view is
          active via the highlighted button. */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        {/* View mode cycle buttons. Internal id stays "relief" so existing
            store / type machinery keeps working; the user-facing label is
            "TOPO" (more recognisable than "RELIEF" for a topographic map). */}
        {(["3d", "2d", "map", "relief"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1 rounded border transition-colors ${
              viewMode === mode
                ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10"
                : "border-border text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40"
            }`}
          >
            {mode === "3d" ? "3D" : mode === "2d" ? "2D" : mode === "map" ? "MAP" : "TOPO"}
          </button>
        ))}
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

      {/* Top Right below controls: Top-Ω ranking (interactive) */}
      <div className="absolute top-12 right-3 pointer-events-auto">
        <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-border bg-surface-elevated/80">
          <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
            TOP-{"\u03A9"} NODES <span className="text-text-muted/40">— click to focus</span>
          </div>
          {topOmega.map((node, i) => {
            const isActive = selectedNode === node.id;
            const scoreColor = node.omegaFragility.composite > 9 ? "#ff1744"
              : node.omegaFragility.composite >= 7 ? "#ffab00"
              : "#00e676";
            return (
              <div
                key={node.id}
                className="flex items-center gap-1.5 py-0.5 cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-white/5"
                style={{
                  backgroundColor: isActive ? "rgba(0,229,255,0.08)" : undefined,
                  borderLeft: isActive ? "2px solid var(--accent-cyan)" : "2px solid transparent",
                }}
                onClick={() => {
                  setSelectedNode(isActive ? null : node.id);
                  if (activeDomain) {
                    setActiveDomain(null);
                    setSelectedNodes([]);
                  }
                }}
              >
                <span className="text-[7px] text-text-muted w-3">{i + 1}.</span>
                <span
                  className="text-[8px] font-bold"
                  style={{ color: scoreColor }}
                >
                  {node.omegaFragility.composite.toFixed(1)}
                </span>
                <span
                  className="text-[8px] truncate max-w-[120px]"
                  style={{ color: isActive ? "var(--accent-cyan)" : "var(--text-muted)" }}
                >
                  {node.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selection panel — below Top-Ω */}
      {selectedNodes.length > 0 && (
        <div className="absolute right-3 pointer-events-auto" style={{ top: "calc(3rem + 180px)" }}>
          <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-accent-cyan/40 bg-surface-elevated/80 max-w-[200px]">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
                {selectedNodes.length} NODES SELECTED
              </div>
              <button
                onClick={() => { setSelectedNodes([]); setIsolateSelection(false); }}
                className="text-[7px] font-mono text-accent-red hover:text-red-400 transition-colors px-1"
              >
                CLEAR ALL
              </button>
            </div>
            <div className="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
              {selectedNodes.map((nodeId) => {
                const node = nodeById.get(nodeId);
                return (
                  <div key={nodeId} className="flex items-center justify-between gap-1 py-0.5">
                    <span className="text-[8px] text-text-muted truncate">{node?.label ?? nodeId}</span>
                    <button
                      onClick={() => {
                        const next = selectedNodes.filter((id) => id !== nodeId);
                        setSelectedNodes(next);
                        if (next.length === 0) setIsolateSelection(false);
                      }}
                      className="text-[7px] text-text-muted/50 hover:text-accent-red transition-colors flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Action buttons */}
            <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-border/50">
              <button
                onClick={() => setIsolateSelection(!isolateSelection)}
                className={`flex-1 text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-1 rounded border transition-colors ${
                  isolateSelection
                    ? "border-accent-amber/60 text-accent-amber bg-accent-amber/10"
                    : "border-border text-text-muted hover:text-accent-amber hover:border-accent-amber/40"
                }`}
              >
                {isolateSelection ? "SHOW ALL" : "ISOLATE"}
              </button>
              <button
                onClick={() => {
                  const nodeLabels = selectedNodes.map((id) => nodeById.get(id)?.label ?? id);
                  const selSet = new Set(selectedNodes);
                  const subEdges = activeGraph.edges.filter((e) => selSet.has(e.source) && selSet.has(e.target));
                  const edgeDescs = subEdges.map((e) => {
                    const src = nodeById.get(e.source)?.label ?? e.source;
                    const tgt = nodeById.get(e.target)?.label ?? e.target;
                    return `${src} → ${tgt} (${e.type}, w=${e.weight}, mechanism: ${e.physicalMechanism || "N/A"})`;
                  });
                  const prompt = `ANALYZE SELECTION: The user has selected ${selectedNodes.length} nodes in the causal DAG. Provide a macro analysis of this subgraph — what are the key causal pathways, systemic risks, and cascading vulnerabilities? How do these nodes interact and what are the implications?\n\nSelected nodes: ${nodeLabels.join(", ")}\n\nEdges within selection (${subEdges.length}):\n${edgeDescs.join("\n")}`;
                  addCopilotMessage({
                    id: `user-sel-${Date.now()}`,
                    role: "user",
                    content: `ANALYZE SELECTION (${selectedNodes.length} nodes)`,
                    timestamp: Date.now(),
                  });
                  // Dispatch to copilot via a custom event that SystemCopilot listens for
                  window.dispatchEvent(new CustomEvent("apex-analyze-selection", { detail: { prompt } }));
                }}
                className="flex-1 text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-1 rounded border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
              >
                ANALYZE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Left: Domain legend (interactive) */}
      <div className="absolute bottom-12 left-3 pointer-events-auto">
        <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-border bg-surface-elevated/80">
          <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
            DOMAINS <span className="text-text-muted/40">— click to highlight</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {domainCounts.map(([domain, count]) => {
              const isActive = activeDomain === domain;
              const domainColor = getDomainColor(domain);
              return (
                <div
                  key={domain}
                  className="flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-white/5"
                  style={{
                    backgroundColor: isActive ? `${domainColor}15` : undefined,
                    borderLeft: isActive ? `2px solid ${domainColor}` : "2px solid transparent",
                  }}
                  onClick={() => {
                    if (isActive) {
                      setActiveDomain(null);
                      setSelectedNodes([]);
                    } else {
                      setActiveDomain(domain);
                      const nodeIds = activeGraph.nodes
                        .filter((n) => n.domain === domain)
                        .map((n) => n.id);
                      setSelectedNodes(nodeIds);
                    }
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: domainColor }}
                  />
                  <span className="text-[8px]" style={{ color: isActive ? domainColor : "var(--text-muted)" }}>
                    {domain}
                  </span>
                  <span className="text-[7px] text-text-muted/50">
                    ({count})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Left: Control hints (above) + structural metrics (below).
          Previously the hints sat at bottom-3 right-3, which the CLIENT
          DEPLOYMENT CTA on the same edge clipped over. Moved to the
          opposite corner and stacked above the metrics so neither
          overlaps the deploy link.
          The "NODE SIZE = EIGENVECTOR CENTRALITY | DISTANCE = EDGE WEIGHT"
          sub-text was removed — too cryptic to help end users, and most
          of that meaning is conveyed by the visual itself. */}
      {(viewMode === "3d" || viewMode === "map") && (
        <div className="absolute bottom-9 left-3 pointer-events-none">
          <div className="text-[8px] font-mono text-text-muted/50">
            {viewMode === "3d"
              ? "DRAG: ORBIT | SCROLL: ZOOM | RIGHT-CLICK: PAN | SHIFT+DRAG: SELECT | DOUBLE-CLICK: FOCUS | ESC: DESELECT"
              : "DRAG: PAN | SCROLL: ZOOM | CLICK: SELECT | SHIFT+CLICK: MULTI-SELECT | HOVER: INSPECT"}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3">
        <div className="flex gap-4 text-[9px] font-mono text-text-muted">
          <span>NODES: {meta.totalNodes}</span>
          <span>EDGES: {meta.totalEdges}</span>
          <span>DENSITY: {meta.density.toFixed(3)}</span>
          <span>CONSTRAINT: {meta.constraintType.split("+")[0].trim()}</span>
        </div>
      </div>
    </div>
  );
}
