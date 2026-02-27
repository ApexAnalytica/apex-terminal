"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { computeOmegaState } from "@/lib/omega-engine";
import TrinityPanel from "./TrinityPanel";
import InterventionControls from "./InterventionControls";

export default function ModulePanel() {
  const activeModule = useApexStore((s) => s.activeModule);

  return (
    <aside className="flex flex-col w-80 border-l border-border bg-surface h-full overflow-hidden">
      {/* Module Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted uppercase">
          {activeModule} Engine
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          {activeModule === "spirtes" && "Structure Discovery — DCD / NOTEARS / PCMCI+ / FCI"}
          {activeModule === "tarski" && "Truth Verification — Physical Constraint Filter"}
          {activeModule === "pearl" && "Counterfactual Engine — do-Calculus"}
          {activeModule === "pareto" && "Criticality Warning — Ω-Fragility Assessment"}
        </div>
      </div>

      {/* Module Content */}
      <div className="flex-1 overflow-y-auto">
        {activeModule === "spirtes" && <TrinityPanel />}

        {activeModule === "tarski" && (
          <div className="p-4 space-y-3">
            <TarskiPanel />
          </div>
        )}

        {activeModule === "pearl" && (
          <div className="p-4 space-y-3">
            <InterventionControls />
          </div>
        )}

        {activeModule === "pareto" && (
          <div className="p-4 space-y-3">
            <ParetoPanel />
          </div>
        )}
      </div>
    </aside>
  );
}

function TarskiPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const setTruthFilter = useApexStore((s) => s.setTruthFilter);

  return (
    <>
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-green">
        TRUTH FILTER
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setTruthFilter("raw")}
          className="text-[9px] font-mono px-3 py-1.5 rounded border transition-colors"
          style={{
            borderColor: truthFilter === "raw" ? "var(--accent-green)" : "var(--border)",
            color: truthFilter === "raw" ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: truthFilter === "raw" ? "rgba(0,230,118,0.08)" : "transparent",
          }}
        >
          RAW
        </button>
        <button
          onClick={() => setTruthFilter("verified")}
          className="text-[9px] font-mono px-3 py-1.5 rounded border transition-colors"
          style={{
            borderColor: truthFilter === "verified" ? "var(--accent-green)" : "var(--border)",
            color: truthFilter === "verified" ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: truthFilter === "verified" ? "rgba(0,230,118,0.08)" : "transparent",
          }}
        >
          VERIFIED
        </button>
      </div>
      <div className="text-[9px] font-mono text-text-muted space-y-1 mt-2">
        <div>Inconsistent Edges: <span className="text-accent-red">{graphData.metadata.inconsistentEdges}</span></div>
        <div>Restricted Nodes: <span className="text-accent-amber">{graphData.metadata.restrictedNodes}</span></div>
        <div>Status: <span className="text-accent-green">{graphData.metadata.verificationStatus}</span></div>
      </div>
      {truthFilter === "verified" && (
        <div className="text-[9px] font-mono text-accent-red mt-2 p-2 border border-accent-red/30 rounded bg-accent-red/5">
          TARSKI FILTER ACTIVE — DETECTED: {graphData.metadata.inconsistentEdges} INCONSISTENT EDGES, {graphData.metadata.restrictedNodes} NODES RESTRICTED
        </div>
      )}
    </>
  );
}

function ParetoPanel() {
  const shocks = useApexStore((s) => s.shocks);
  const omegaState = useMemo(() => computeOmegaState(shocks), [shocks]);

  return (
    <>
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-red">
        Ω-FRAGILITY ASSESSMENT
      </div>
      <div className="text-[9px] font-mono text-text-muted space-y-1">
        <div>Buffer: <span style={{ color: omegaState.status === "NOMINAL" ? "var(--accent-green)" : "var(--accent-red)" }}>{omegaState.buffer.toFixed(1)}%</span></div>
        <div>Status: <span className="text-accent-red">{omegaState.status}</span></div>
        <div>Active Shocks: {shocks.length}</div>
      </div>
      {shocks.length > 0 && (
        <div className="space-y-1 mt-2">
          {shocks.map((s) => (
            <div
              key={s.id}
              className="text-[9px] font-mono p-1.5 border border-accent-red/20 rounded bg-accent-red/5 text-accent-red"
            >
              {s.name} — SEV: {(s.severity * 100).toFixed(0)}%
            </div>
          ))}
        </div>
      )}
      {shocks.length === 0 && (
        <div className="text-[9px] font-mono text-text-muted italic">
          No active shocks. System nominal.
        </div>
      )}
    </>
  );
}
