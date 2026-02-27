"use client";

import { useApexStore } from "@/stores/useApexStore";

export default function TruthFilter() {
  const { truthFilter, setTruthFilter, graphData } = useApexStore();
  const meta = graphData.metadata;

  return (
    <div className="flex items-center gap-3">
      <div className="flex rounded border border-border overflow-hidden">
        <button
          onClick={() => setTruthFilter("raw")}
          className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 transition-colors"
          style={{
            backgroundColor: truthFilter === "raw" ? "rgba(0,229,255,0.1)" : "transparent",
            color: truthFilter === "raw" ? "var(--accent-cyan)" : "var(--text-muted)",
          }}
        >
          RAW
        </button>
        <button
          onClick={() => setTruthFilter("verified")}
          className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 border-l border-border transition-colors"
          style={{
            backgroundColor: truthFilter === "verified" ? "rgba(0,230,118,0.1)" : "transparent",
            color: truthFilter === "verified" ? "var(--accent-green)" : "var(--text-muted)",
          }}
        >
          VERIFIED
        </button>
      </div>
      {truthFilter === "verified" && (
        <span className="text-[8px] font-mono text-accent-red">
          {meta.inconsistentEdges} EDGES | {meta.restrictedNodes} NODES
        </span>
      )}
    </div>
  );
}
