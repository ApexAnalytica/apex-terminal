"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import type { CounterfactualResult } from "@/lib/types";

export default function InterventionControls() {
  const {
    interventionMode,
    interventionTarget,
    setInterventionMode,
    setInterventionTarget,
    selectedNode,
    graphData,
    scissorsMode,
    severedEdges,
    setScissorsMode,
    resetSeveredEdges,
  } = useApexStore();

  const targetNode = interventionTarget
    ? graphData.nodes.find((n) => n.id === interventionTarget)
    : null;

  const selectedNodeData = selectedNode
    ? graphData.nodes.find((n) => n.id === selectedNode)
    : null;

  // Compute counterfactual result from graph topology when target is set
  const counterfactual = useMemo((): CounterfactualResult | null => {
    if (!interventionTarget || !targetNode) return null;
    // Find downstream edges from target
    const downstreamEdges = graphData.edges.filter(
      (e) => e.source === interventionTarget && !e.isSevered
    );
    const affectedNodes = downstreamEdges.map((e) => {
      const node = graphData.nodes.find((n) => n.id === e.target);
      const deltaOmega = -(e.weight * (node?.omegaFragility.composite || 5) * 0.1);
      return { nodeId: e.target, deltaOmega: Math.round(deltaOmega * 100) / 100 };
    });
    const avgWeight = downstreamEdges.length > 0
      ? downstreamEdges.reduce((s, e) => s + e.weight, 0) / downstreamEdges.length
      : 0;
    const expectedUtility = Math.round((targetNode.omegaFragility.composite * avgWeight * 10) * 100) / 100;
    const regretBound = Math.round((1 - avgWeight) * targetNode.omegaFragility.composite * 100) / 100;
    const hasConfounded = graphData.edges.some(
      (e) => (e.source === interventionTarget || e.target === interventionTarget) && e.type === "confounded"
    );
    const method = hasConfounded ? "DeepCFR" : "BackdoorAdjustment";
    const policyRecommendation = `Harden ${targetNode.domain} supply chain — ${downstreamEdges.length} downstream dependencies at risk`;

    return {
      interventionNode: interventionTarget,
      expectedUtility,
      regretBound,
      policyRecommendation,
      affectedNodes,
      method,
    };
  }, [interventionTarget, targetNode, graphData]);

  return (
    <div className="space-y-3">
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-amber">
        do(X) INTERVENTION
      </div>
      <div className="text-[9px] text-text-muted font-mono">
        Pearl&apos;s do-calculus: isolate a node from upstream causes to observe counterfactual downstream effects. Unlike scenario shocks (Pareto), this is a structural graph operation.
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
        {interventionMode ? "\u25C9 INTERVENTION ACTIVE" : "\u25CB ENABLE INTERVENTION"}
      </button>

      {interventionMode && (
        <div className="space-y-2">
          {targetNode ? (
            <div className="space-y-2">
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
              {/* Counterfactual Results */}
              {counterfactual && (
                <div className="p-2 rounded border border-accent-cyan/30 bg-accent-cyan/5 space-y-1.5">
                  <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-cyan">
                    COUNTERFACTUAL RESULTS
                  </div>
                  <div className="text-[8px] font-mono space-y-0.5">
                    <div>E[U] = <span className="text-accent-green">{counterfactual.expectedUtility.toFixed(2)}</span></div>
                    <div>Regret Bound {"\u2264"} <span className="text-accent-amber">{counterfactual.regretBound.toFixed(2)}</span></div>
                    <div>CI: [{(counterfactual.expectedUtility * 0.8).toFixed(2)}, {(counterfactual.expectedUtility * 1.2).toFixed(2)}]</div>
                    <div>Method: <span className="text-accent-cyan">{counterfactual.method}</span></div>
                  </div>
                  <div className="text-[8px] font-mono text-text-muted mt-1">
                    {counterfactual.policyRecommendation}
                  </div>
                  {counterfactual.affectedNodes.length > 0 && (
                    <div className="space-y-0.5 mt-1">
                      <div className="text-[7px] font-mono text-text-muted">AFFECTED NODES:</div>
                      {counterfactual.affectedNodes.slice(0, 5).map((an) => {
                        const node = graphData.nodes.find((n) => n.id === an.nodeId);
                        return (
                          <div key={an.nodeId} className="text-[8px] font-mono flex justify-between">
                            <span className="text-text-muted">{node?.shortLabel || an.nodeId}</span>
                            <span style={{ color: an.deltaOmega < 0 ? "#00e676" : "#ff1744" }}>
                              {"\u0394\u03A9"} {an.deltaOmega > 0 ? "+" : ""}{an.deltaOmega.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[9px] text-text-muted font-mono italic">
              Click a node in the DAG to set intervention target...
            </div>
          )}

          {/* Set selected node as target */}
          {selectedNodeData && selectedNode !== interventionTarget && (
            <button
              onClick={() => setInterventionTarget(selectedNode)}
              className="w-full text-[8px] font-mono px-2 py-1.5 rounded border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
            >
              SET SELECTED: do({selectedNodeData.shortLabel})
            </button>
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

          {/* Scissors Tool */}
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
              CAUSAL LINK BREAK
            </div>
            <button
              onClick={() => setScissorsMode(!scissorsMode)}
              className="w-full text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-2 rounded border transition-colors"
              style={{
                borderColor: scissorsMode ? "#ff1744" : "var(--border)",
                color: scissorsMode ? "#ff1744" : "var(--text-muted)",
                backgroundColor: scissorsMode ? "rgba(255,23,68,0.08)" : "transparent",
              }}
            >
              {scissorsMode ? "\uD83D\uDD17 LINK BREAK ACTIVE" : "\uD83D\uDD17 BREAK LINKS"}
            </button>
            {scissorsMode && (
              <div className="text-[8px] font-mono text-accent-red/80 p-2 border border-accent-red/20 rounded bg-accent-red/5">
                Click any edge in the DAG to sever it. Consequence nodes will spawn automatically.
              </div>
            )}
            {severedEdges.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-text-muted">
                  Severed: <span className="text-accent-red">{severedEdges.length}</span> edge{severedEdges.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={resetSeveredEdges}
                  className="text-[8px] font-mono text-text-muted hover:text-accent-red underline"
                >
                  Reset all cuts
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
