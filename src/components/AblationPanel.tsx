"use client";

import { useCallback, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { computeAblationComparison, AblationComparison } from "@/lib/ablation-engine";
import { streamLlmQuery } from "@/lib/copilot-engine";

export default function AblationPanel() {
  const {
    ablationMode,
    setAblationMode,
    ablatedNodeIds,
    ablatedEdgeIds,
    resetAblation,
    startAblationReplay,
    graphData,
  } = useApexStore();

  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);

  const comparison = useMemo(() => {
    if (ablatedNodeIds.length === 0 && ablatedEdgeIds.length === 0) return null;
    return computeAblationComparison(graphData, ablatedNodeIds, ablatedEdgeIds);
  }, [graphData, ablatedNodeIds, ablatedEdgeIds]);

  const hasSelections = ablatedNodeIds.length > 0 || ablatedEdgeIds.length > 0;

  // Get names of ablated nodes for context
  const ablatedNodeNames = useMemo(() => {
    return ablatedNodeIds.map((id) => {
      const node = graphData.nodes.find((n) => n.id === id);
      return node ? (node.shortLabel || node.label) : id;
    });
  }, [ablatedNodeIds, graphData.nodes]);

  const ablatedEdgeLabels = useMemo(() => {
    return ablatedEdgeIds.map((id) => {
      const edge = graphData.edges.find((e) => e.id === id);
      if (!edge) return id;
      const src = graphData.nodes.find((n) => n.id === edge.source);
      const tgt = graphData.nodes.find((n) => n.id === edge.target);
      return `${src?.shortLabel ?? edge.source} → ${tgt?.shortLabel ?? edge.target}`;
    });
  }, [ablatedEdgeIds, graphData]);

  const requestInterpretation = useCallback(async (comp: AblationComparison) => {
    setInterpreting(true);
    setInterpretation(null);

    // Build a focused prompt for the LLM
    const prompt = buildAblationPrompt(comp, ablatedNodeNames, ablatedEdgeLabels);

    try {
      // Get LLM settings from store (mirror SystemCopilot's provider logic)
      const state = useApexStore.getState();
      const provider = state.llmProvider === "ollama" ? "ollama" : "gemini";
      const model = provider === "ollama" ? state.ollamaModel : state.geminiModel;
      const apiKey = provider === "ollama" ? "ollama-local" : state.geminiApiKey;
      const ollamaUrl = state.ollamaUrl || "http://localhost:11434";

      const stream = await streamLlmQuery({
        copilotMessages: [
          { id: "abl-1", role: "user", content: prompt, timestamp: Date.now() },
        ],
        graph: graphData,
        apiKey,
        model,
        provider,
        selectedNode: null,
        severedEdges: [],
        shocks: [],
        interventionMode: false,
        interventionTarget: null,
        ollamaUrl,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setInterpretation(fullText);
      }
    } catch (err) {
      setInterpretation(`⚠ Could not generate interpretation: ${err instanceof Error ? err.message : "Unknown error"}. Make sure Ollama is running.`);
    } finally {
      setInterpreting(false);
    }
  }, [ablatedNodeNames, ablatedEdgeLabels, graphData]);

  const handleReset = useCallback(() => {
    resetAblation();
    setInterpretation(null);
  }, [resetAblation]);

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
        ABLATION ANALYSIS
      </div>
      <button
        onClick={() => setAblationMode(!ablationMode)}
        className="w-full text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-2 rounded border transition-colors"
        style={{
          borderColor: ablationMode ? "#e040fb" : "var(--border)",
          color: ablationMode ? "#e040fb" : "var(--text-muted)",
          backgroundColor: ablationMode ? "rgba(224,64,251,0.08)" : "transparent",
        }}
      >
        {ablationMode ? "\u2316 ABLATION ACTIVE" : "\u2316 ENABLE ABLATION"}
      </button>

      {ablationMode && (
        <div className="text-[8px] font-mono p-2 border rounded bg-[rgba(224,64,251,0.05)]" style={{ borderColor: "rgba(224,64,251,0.2)", color: "rgba(224,64,251,0.8)" }}>
          Click nodes or edges to mark for ablation. Nodes auto-mark connected edges.
        </div>
      )}

      {hasSelections && (
        <>
          <div className="text-[9px] font-mono text-text-muted">
            Marked: <span style={{ color: "#e040fb" }}>{ablatedNodeIds.length}</span> node{ablatedNodeIds.length !== 1 ? "s" : ""},{" "}
            <span style={{ color: "#e040fb" }}>{ablatedEdgeIds.length}</span> edge{ablatedEdgeIds.length !== 1 ? "s" : ""}
          </div>

          {comparison && (
            <div className="p-2 rounded border border-border bg-surface-elevated space-y-1.5">
              <div className="font-[family-name:var(--font-michroma)] text-[8px] tracking-wider text-text-muted">
                BEFORE / AFTER
              </div>
              <MetricRow label="Nodes" before={comparison.before.nodeCount} after={comparison.after.nodeCount} delta={comparison.deltas.nodeCount} />
              <MetricRow label="Edges" before={comparison.before.edgeCount} after={comparison.after.edgeCount} delta={comparison.deltas.edgeCount} />
              <MetricRow label="Density" before={comparison.before.density} after={comparison.after.density} delta={comparison.deltas.density} precision={3} />
              <MetricRow label={"\u03BB_max"} before={comparison.before.lambdaMax} after={comparison.after.lambdaMax} delta={comparison.deltas.lambdaMax} invertColor />
              <div className="flex justify-between text-[8px] font-mono">
                <span className="text-text-muted">Stability</span>
                <span style={{ color: comparison.deltas.stability.includes("\u2192") ? "#ffab00" : comparison.after.isStable ? "#00e676" : "#ff1744" }}>
                  {comparison.deltas.stability}
                </span>
              </div>
              <MetricRow label="Mean \u03A9" before={comparison.before.meanOmega} after={comparison.after.meanOmega} delta={comparison.deltas.meanOmega} invertColor />
              <MetricRow label="Max \u03A9" before={comparison.before.maxOmega} after={comparison.after.maxOmega} delta={comparison.deltas.maxOmega} invertColor />
              <div className="flex justify-between text-[8px] font-mono">
                <span className="text-text-muted">Integrity</span>
                <span style={{ color: comparison.deltas.structuralIntegrityPct < -20 ? "#ff1744" : comparison.deltas.structuralIntegrityPct < -5 ? "#ffab00" : "#00e676" }}>
                  {comparison.deltas.structuralIntegrityPct > 0 ? "+" : ""}{comparison.deltas.structuralIntegrityPct.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* LLM Interpretation */}
          {comparison && (
            <button
              onClick={() => requestInterpretation(comparison)}
              disabled={interpreting}
              className="w-full text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1.5 rounded border transition-colors disabled:opacity-50"
              style={{
                borderColor: interpreting ? "rgba(224,64,251,0.6)" : "rgba(0,229,255,0.4)",
                color: interpreting ? "#e040fb" : "var(--accent-cyan)",
                backgroundColor: interpreting ? "rgba(224,64,251,0.08)" : "rgba(0,229,255,0.05)",
              }}
            >
              {interpreting ? "INTERPRETING..." : interpretation ? "RE-INTERPRET" : "INTERPRET WITH AI"}
            </button>
          )}

          {interpretation && (
            <div
              className="p-2.5 rounded border text-[8px] font-mono leading-relaxed overflow-y-auto"
              style={{
                borderColor: "rgba(0,229,255,0.2)",
                backgroundColor: "rgba(0,229,255,0.03)",
                color: "var(--foreground)",
                maxHeight: "200px",
              }}
            >
              <div className="font-[family-name:var(--font-michroma)] text-[7px] tracking-wider text-accent-cyan mb-1.5">
                AI INTERPRETATION
              </div>
              <div className="whitespace-pre-wrap">{interpretation}</div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={startAblationReplay}
              className="flex-1 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1.5 rounded border transition-colors"
              style={{
                borderColor: "rgba(224,64,251,0.4)",
                color: "#e040fb",
                backgroundColor: "rgba(224,64,251,0.08)",
              }}
            >
              APPLY TO REPLAY
            </button>
            <button
              onClick={handleReset}
              className="text-[8px] font-mono px-2 py-1.5 rounded border border-border text-text-muted hover:text-accent-red transition-colors"
            >
              RESET
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── LLM Prompt Builder ──────────────────────────────────────────

function buildAblationPrompt(
  comparison: AblationComparison,
  ablatedNodeNames: string[],
  ablatedEdgeLabels: string[]
): string {
  return `You are a causal network analyst. Interpret the following ablation results in 3-4 concise sentences. Explain what removing these elements means for system resilience, cascade risk, and stability. Be specific about the practical implications — avoid restating the raw numbers.

ABLATED NODES: ${ablatedNodeNames.join(", ") || "none"}
ABLATED EDGES: ${ablatedEdgeLabels.join("; ") || "none"}

BEFORE:
- Nodes: ${comparison.before.nodeCount}, Edges: ${comparison.before.edgeCount}
- Density: ${comparison.before.density.toFixed(3)}
- Lambda_max (spectral radius): ${comparison.before.lambdaMax.toFixed(2)} (${comparison.before.isStable ? "STABLE" : "UNSTABLE"})
- Mean Omega fragility: ${comparison.before.meanOmega.toFixed(2)}, Max Omega: ${comparison.before.maxOmega.toFixed(2)}
- Structural integrity: 100%

AFTER:
- Nodes: ${comparison.after.nodeCount}, Edges: ${comparison.after.edgeCount}
- Density: ${comparison.after.density.toFixed(3)}
- Lambda_max (spectral radius): ${comparison.after.lambdaMax.toFixed(2)} (${comparison.after.isStable ? "STABLE" : "UNSTABLE"})
- Mean Omega fragility: ${comparison.after.meanOmega.toFixed(2)}, Max Omega: ${comparison.after.maxOmega.toFixed(2)}
- Structural integrity: ${(100 + comparison.deltas.structuralIntegrityPct).toFixed(1)}%

KEY DELTAS:
- Lambda_max change: ${comparison.deltas.lambdaMax > 0 ? "+" : ""}${comparison.deltas.lambdaMax.toFixed(2)} (${comparison.deltas.lambdaMax < 0 ? "reduced cascade amplification" : "increased cascade amplification"})
- Stability: ${comparison.deltas.stability}
- Mean Omega change: ${comparison.deltas.meanOmega > 0 ? "+" : ""}${comparison.deltas.meanOmega.toFixed(2)}
- Integrity change: ${comparison.deltas.structuralIntegrityPct > 0 ? "+" : ""}${comparison.deltas.structuralIntegrityPct.toFixed(1)}%

Respond concisely. No bullet points. Plain paragraph format.`;
}

function MetricRow({
  label,
  before,
  after,
  delta,
  precision = 2,
  invertColor = false,
}: {
  label: string;
  before: number;
  after: number;
  delta: number;
  precision?: number;
  invertColor?: boolean;
}) {
  // For inverted metrics (like lambda_max, omega), decrease is good (green)
  const isGood = invertColor ? delta < 0 : delta > 0;
  const isBad = invertColor ? delta > 0 : delta < 0;
  const deltaColor = delta === 0 ? "var(--text-muted)" : isGood ? "#00e676" : isBad ? "#ff1744" : "var(--text-muted)";

  return (
    <div className="flex justify-between text-[8px] font-mono">
      <span className="text-text-muted">{label}</span>
      <span>
        <span className="text-text-muted">{typeof before === "number" ? before.toFixed(precision) : before}</span>
        <span className="text-text-muted mx-1">{"\u2192"}</span>
        <span style={{ color: deltaColor }}>{typeof after === "number" ? after.toFixed(precision) : after}</span>
        <span className="ml-1" style={{ color: deltaColor }}>
          ({delta > 0 ? "+" : ""}{delta.toFixed(precision)})
        </span>
      </span>
    </div>
  );
}
