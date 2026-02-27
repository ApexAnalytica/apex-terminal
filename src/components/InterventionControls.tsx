"use client";

import { useApexStore } from "@/stores/useApexStore";

export default function InterventionControls() {
  const {
    interventionMode,
    interventionTarget,
    setInterventionMode,
    setInterventionTarget,
    graphData,
  } = useApexStore();

  const targetNode = interventionTarget
    ? graphData.nodes.find((n) => n.id === interventionTarget)
    : null;

  return (
    <div className="space-y-3">
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-amber">
        INTERVENTION MODE
      </div>
      <div className="text-[9px] text-text-muted font-mono">
        Apply Pearl&apos;s do-calculus. Click a node in the DAG to set do(X) target.
      </div>

      <button
        onClick={() => setInterventionMode(!interventionMode)}
        className="w-full text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-2 rounded border transition-colors"
        style={{
          borderColor: interventionMode ? "var(--accent-amber)" : "var(--border)",
          color: interventionMode ? "var(--accent-amber)" : "var(--text-muted)",
          backgroundColor: interventionMode ? "rgba(255,171,0,0.08)" : "transparent",
        }}
      >
        {interventionMode ? "◉ INTERVENTION ACTIVE" : "○ ENABLE INTERVENTION"}
      </button>

      {interventionMode && (
        <div className="space-y-2">
          {targetNode ? (
            <div className="p-2 rounded border border-accent-amber/30 bg-accent-amber/5">
              <div className="text-[9px] font-mono text-accent-amber">
                PEARL ENGINE ACTIVE — do({targetNode.label})
              </div>
              <div className="text-[8px] text-text-muted mt-1">
                Upstream edges severed. Downstream causal effects highlighted.
              </div>
              <button
                onClick={() => setInterventionTarget(null)}
                className="text-[8px] text-text-muted hover:text-accent-amber mt-1 underline"
              >
                Clear target
              </button>
            </div>
          ) : (
            <div className="text-[9px] text-text-muted font-mono italic">
              Click a node in the DAG to set intervention target...
            </div>
          )}

          {/* Quick targets */}
          <div className="text-[8px] text-text-muted font-mono mb-1">QUICK TARGETS:</div>
          <div className="flex flex-wrap gap-1">
            {graphData.nodes.slice(0, 5).map((n) => (
              <button
                key={n.id}
                onClick={() => setInterventionTarget(n.id)}
                className="text-[8px] font-mono px-2 py-1 rounded border transition-colors"
                style={{
                  borderColor: interventionTarget === n.id ? "var(--accent-amber)" : "var(--border)",
                  color: interventionTarget === n.id ? "var(--accent-amber)" : "var(--text-muted)",
                  backgroundColor: interventionTarget === n.id ? "rgba(255,171,0,0.08)" : "transparent",
                }}
              >
                do({n.shortLabel})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
