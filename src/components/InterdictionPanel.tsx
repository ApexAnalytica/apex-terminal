"use client";

import { useCallback, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import {
  solveInterdiction,
  InterdictionResult,
} from "@/lib/interdiction-engine";

type InterdictionMode = "edge" | "node" | "both";

export default function InterdictionPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const shocks = useApexStore((s) => s.shocks);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const severEdge = useApexStore((s) => s.severEdge);

  const [budget, setBudget] = useState(3);
  const [mode, setMode] = useState<InterdictionMode>("edge");
  const [result, setResult] = useState<InterdictionResult | null>(null);
  const [computing, setComputing] = useState(false);

  const canRun = shocks.length > 0;

  const runInterdiction = useCallback(() => {
    setComputing(true);
    // Defer to next frame so UI updates with "computing" state
    requestAnimationFrame(() => {
      const r = solveInterdiction(graphData, shocks, severedEdges, budget, mode);
      setResult(r);
      setComputing(false);
    });
  }, [graphData, shocks, severedEdges, budget, mode]);

  const applyIntervention = useCallback(
    (edgeId: string) => {
      severEdge(edgeId);
    },
    [severEdge]
  );

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-amber">
        NETWORK INTERDICTION
      </div>
      <div className="text-[8px] font-mono text-text-muted">
        Minimax optimization — find optimal interventions to minimize worst-case cascade damage
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono text-text-muted">BUDGET:</span>
          {[1, 2, 3, 5].map((b) => (
            <button
              key={b}
              onClick={() => setBudget(b)}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors"
              style={{
                color: budget === b ? "var(--accent-amber)" : "var(--text-muted)",
                background: budget === b ? "rgba(255, 171, 0, 0.12)" : "transparent",
              }}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="h-4 w-px" style={{ background: "rgba(90, 94, 114, 0.3)" }} />
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono text-text-muted">MODE:</span>
          {(["edge", "node", "both"] as InterdictionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors"
              style={{
                color: mode === m ? "var(--accent-amber)" : "var(--text-muted)",
                background: mode === m ? "rgba(255, 171, 0, 0.12)" : "transparent",
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={runInterdiction}
        disabled={!canRun || computing}
        className="w-full px-3 py-2 rounded border text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-all disabled:opacity-30"
        style={{
          borderColor: "rgba(255, 171, 0, 0.4)",
          color: "var(--accent-amber)",
          background: computing ? "rgba(255, 171, 0, 0.15)" : "rgba(255, 171, 0, 0.05)",
        }}
      >
        {computing ? "COMPUTING MINIMAX..." : "SOLVE INTERDICTION"}
      </button>

      {!canRun && (
        <div className="text-[8px] font-mono text-text-muted italic">
          Inject shocks in Pareto module first
        </div>
      )}

      {/* Results */}
      {result && !computing && (
        <div className="space-y-2">
          {/* Summary */}
          <div className="p-2 border rounded space-y-1" style={{
            borderColor: "rgba(255, 171, 0, 0.2)",
            backgroundColor: "rgba(255, 171, 0, 0.03)",
          }}>
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-text-muted">BASELINE DAMAGE</span>
              <span style={{ color: "var(--accent-red)" }}>
                {result.baselineDamage.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-text-muted">OPTIMAL DAMAGE</span>
              <span style={{ color: "var(--accent-green)" }}>
                {result.bestDamage.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-text-muted">REDUCTION</span>
              <span style={{ color: "var(--accent-amber)" }}>
                {result.reductionPct}%
              </span>
            </div>
          </div>

          {/* Intervention list */}
          {result.interventions.length > 0 ? (
            <div className="space-y-1">
              <div className="text-[8px] font-mono text-text-muted">
                OPTIMAL INTERVENTIONS ({result.interventions.length})
              </div>
              {result.interventions.map((c, i) => (
                <div
                  key={c.target.id}
                  className="p-1.5 border rounded text-[8px] font-mono flex items-center gap-2"
                  style={{
                    borderColor: "rgba(255, 171, 0, 0.2)",
                    backgroundColor: "rgba(255, 171, 0, 0.03)",
                  }}
                >
                  <span className="text-text-muted w-4">{i + 1}.</span>
                  <span
                    className="text-[7px] px-1 rounded"
                    style={{
                      color: c.target.type === "edge" ? "var(--accent-cyan)" : "var(--accent-amber)",
                      backgroundColor: c.target.type === "edge" ? "rgba(0,229,255,0.1)" : "rgba(255,171,0,0.1)",
                    }}
                  >
                    {c.target.type.toUpperCase()}
                  </span>
                  <span className="text-foreground flex-1 truncate">
                    {c.target.label}
                  </span>
                  <span className="text-accent-green">
                    -{c.marginalReduction.toFixed(1)}
                  </span>
                  {c.target.type === "edge" && !severedEdges.includes(c.target.id) && (
                    <button
                      onClick={() => applyIntervention(c.target.id)}
                      className="px-1.5 py-0.5 rounded text-[7px] transition-colors hover:bg-amber-500/10"
                      style={{
                        color: "var(--accent-amber)",
                        border: "1px solid rgba(255, 171, 0, 0.3)",
                      }}
                    >
                      SEVER
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[8px] font-mono text-text-muted italic">
              No beneficial interventions found within budget
            </div>
          )}
        </div>
      )}
    </div>
  );
}
