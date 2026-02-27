"use client";

import { useApexStore } from "@/stores/useApexStore";

export default function DAGOverlay() {
  const { graphData, activeModule, viewMode, setViewMode, truthFilter } = useApexStore();
  const meta = graphData.metadata;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
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
          {viewMode === "3d" ? "→ 2D" : "→ 3D"}
        </button>
      </div>

      {/* Truth filter badge */}
      {truthFilter === "verified" && (
        <div className="absolute top-12 left-3">
          <div className="text-[8px] font-mono px-2 py-0.5 rounded border border-accent-red/40 text-accent-red bg-accent-red/5">
            TARSKI FILTER ACTIVE — {meta.inconsistentEdges} INCONSISTENT | {meta.restrictedNodes} RESTRICTED
          </div>
        </div>
      )}

      {/* Bottom Left: Structural metrics */}
      <div className="absolute bottom-3 left-3">
        <div className="flex gap-4 text-[9px] font-mono text-text-muted">
          <span>NODES: {meta.totalNodes}</span>
          <span>EDGES: {meta.totalEdges}</span>
          <span>DENSITY: {meta.density.toFixed(2)}</span>
          <span>CONSTRAINT: {meta.constraintType.split("+")[0].trim()}</span>
        </div>
      </div>

      {/* Bottom Right: Control hints */}
      {viewMode === "3d" && (
        <div className="absolute bottom-3 right-3">
          <div className="text-[8px] font-mono text-text-muted/50">
            DRAG: ORBIT | SCROLL: ZOOM | RIGHT-CLICK: PAN
          </div>
        </div>
      )}
    </div>
  );
}
