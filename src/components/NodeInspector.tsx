"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getCategoryColor, getDomainColor, getCategoryLabel } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";

/** Dispatch content to the copilot for display + TTS readout */
function dispatchSpeak(title: string, text: string) {
  window.dispatchEvent(
    new CustomEvent("apex-speak-content", { detail: { title, text } })
  );
}

function getBarColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

const OMEGA_DESCRIPTIONS: Record<string, { short: string; detail: string; formula: string }> = {
  IRREPLACEABILITY: {
    short: "How difficult is it to substitute this node if it fails?",
    detail: "Measures the global concentration of capability. A node scoring 10 means a single facility or entity controls the entire supply — no alternative exists. Derived from market share data, patent exclusivity, and geographic monopoly indicators.",
    formula: "I = f(HHI, market_share_top1, patent_exclusivity, geographic_monopoly)",
  },
  "RESTORATION LATENCY": {
    short: "How long would it take to restore function after disruption?",
    detail: "Captures the time horizon to rebuild or reroute. A semiconductor fab takes 3–5 years to build; a shipping route reroute may take weeks. Scored from replacement time estimates, capital intensity, and regulatory approval cycles.",
    formula: "R = g(replacement_time_months, capex_intensity, regulatory_gates)",
  },
  "JURISDICTIONAL HAZARD": {
    short: "How exposed is this node to sovereign or regulatory risk?",
    detail: "Reflects the political and legal environment governing this asset. Nodes in contested jurisdictions, under sanctions exposure, or subject to export controls score higher. Incorporates governance indices, sanctions lists, and geopolitical tension scores.",
    formula: "J = h(governance_index, sanctions_proximity, export_control_tier, conflict_zone)",
  },
  "CASCADE LOAD": {
    short: "How many downstream nodes depend on this one?",
    detail: "Measures the systemic importance through graph topology. A node with high cascade load sits at a critical junction — its failure propagates to many dependent systems. Computed from edge degree, betweenness centrality, and the omega scores of downstream neighbors.",
    formula: "C = Σ(edge_degree × downstream_ΩF) / normalization_factor",
  },
  "TAIL DEPTH": {
    short: "How severe is the worst-case disruption scenario?",
    detail: "Quantifies fat-tail risk — the potential for extreme, non-linear damage. Nodes where disruption triggers cascading failures across domains (e.g., Strait of Hormuz blocking both energy and fertilizer supply chains) score highest. Derived from historical crisis data and concentration × criticality interaction.",
    formula: "T = concentration_score × system_criticality × historical_tail_events",
  },
};

const OMEGA_METHODOLOGY = "The ΩF (Omega Fragility) composite score is a weighted aggregation of five orthogonal risk pillars, each scored 0–10. The composite weights are: I(0.25) + R(0.20) + J(0.20) + C(0.20) + T(0.15). Scores above 7.0 indicate elevated systemic fragility; above 9.0 indicates critical nodes where disruption would cascade across multiple domains.";

export default function NodeInspector() {
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const graphData = useApexStore((s) => s.graphData);
  const isLive = useApexStore((s) => s.isLive);
  const { graph: temporalGraph } = useTemporalGraph();
  const activeGraph = isLive ? graphData : temporalGraph;

  const node = useMemo(() => {
    if (!selectedNode) return null;
    return activeGraph.nodes.find((n) => n.id === selectedNode) ?? null;
  }, [selectedNode, activeGraph.nodes]);

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return graphData.edges.filter(
      (e) => e.source === selectedNode || e.target === selectedNode
    );
  }, [selectedNode, graphData.edges]);

  const axes = node
    ? [
        { label: "IRREPLACEABILITY", value: node.omegaFragility.irreplaceability },
        { label: "RESTORATION LATENCY", value: node.omegaFragility.restorationLatency },
        { label: "JURISDICTIONAL HAZARD", value: node.omegaFragility.jurisdictionalHazard },
        { label: "CASCADE LOAD", value: node.omegaFragility.cascadeLoad },
        { label: "TAIL DEPTH", value: node.omegaFragility.tailDepth },
      ]
    : [];

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key="node-inspector"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden border-b border-border"
        >
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-foreground truncate">
                  {node.label}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="text-[7px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      color: getDomainColor(node.domain),
                      backgroundColor: `${getDomainColor(node.domain)}15`,
                      border: `1px solid ${getDomainColor(node.domain)}30`,
                    }}
                  >
                    {node.domain.toUpperCase()}
                  </span>
                  <span
                    className="text-[7px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      color: getCategoryColor(node.category),
                      backgroundColor: `${getCategoryColor(node.category)}15`,
                    }}
                  >
                    {getCategoryLabel(node.category)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-[9px] text-text-muted hover:text-foreground transition-colors flex-shrink-0"
              >
                &times;
              </button>
            </div>

            {/* Omega Composite */}
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[28px] font-bold font-mono"
                  style={{ color: getBarColor(node.omegaFragility.composite) }}
                >
                  {"\u03A9"} {node.omegaFragility.composite.toFixed(1)}
                </span>
                <span className="text-[10px] text-text-muted font-mono">/ 10.0</span>
              </div>
              <button
                onClick={() => setShowMethodology((v) => !v)}
                className="text-[7px] font-mono text-accent-cyan/70 hover:text-accent-cyan transition-colors mt-0.5 tracking-wider"
              >
                {showMethodology ? "▾ HIDE METHODOLOGY" : "▸ HOW IS ΩF COMPUTED?"}
              </button>
              <AnimatePresence>
                {showMethodology && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="mt-1.5 p-2 rounded border border-accent-cyan/20 bg-accent-cyan/5 text-[8px] font-mono text-foreground/80 leading-relaxed cursor-pointer hover:border-accent-cyan/40 transition-colors group"
                      onClick={() => dispatchSpeak(
                        `${node.shortLabel} — \u03A9F Methodology`,
                        OMEGA_METHODOLOGY
                      )}
                      title="Click to read aloud"
                    >
                      {OMEGA_METHODOLOGY}
                      <div className="text-[6px] text-text-muted opacity-0 group-hover:opacity-60 transition-opacity mt-1">
                        {"\uD83D\uDD0A"} click to read aloud
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 5-axis bars with expandable descriptions */}
            <div className="space-y-2">
              {axes.map((axis) => {
                const desc = OMEGA_DESCRIPTIONS[axis.label];
                const isExpanded = expandedPillar === axis.label;
                return (
                  <div key={axis.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <button
                        onClick={() => setExpandedPillar(isExpanded ? null : axis.label)}
                        className="text-[8px] text-text-muted font-mono hover:text-accent-cyan transition-colors text-left flex items-center gap-1"
                      >
                        <span className="text-[7px] opacity-50">{isExpanded ? "▾" : "▸"}</span>
                        {axis.label}
                      </button>
                      <span
                        className="text-[9px] font-mono font-bold"
                        style={{ color: getBarColor(axis.value) }}
                      >
                        {axis.value.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(axis.value / 10) * 100}%`,
                          backgroundColor: getBarColor(axis.value),
                        }}
                      />
                    </div>
                    <AnimatePresence>
                      {isExpanded && desc && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div
                            className="mt-1 p-2 rounded border border-border bg-surface-elevated space-y-1.5 cursor-pointer hover:border-accent-cyan/30 transition-colors group"
                            onClick={() => dispatchSpeak(
                              `${node.shortLabel} — ${axis.label} (${axis.value.toFixed(1)}/10)`,
                              `${desc.short} ${desc.detail} Formula: ${desc.formula}`
                            )}
                            title="Click to read aloud"
                          >
                            <div className="text-[8px] font-mono text-foreground/90 leading-relaxed">
                              {desc.short}
                            </div>
                            <div className="text-[7px] font-mono text-text-muted leading-relaxed">
                              {desc.detail}
                            </div>
                            <div className="text-[7px] font-mono text-accent-cyan/60 leading-relaxed border-t border-border pt-1">
                              {desc.formula}
                            </div>
                            <div className="text-[6px] font-mono text-text-muted opacity-0 group-hover:opacity-60 transition-opacity mt-0.5">
                              {"\uD83D\uDD0A"} click to read aloud
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Metadata */}
            <div className="text-[9px] font-mono space-y-1 pt-1 border-t border-border">
              <div>
                <span className="text-text-muted">CONCENTRATION: </span>
                <span className="text-foreground">{node.globalConcentration}</span>
              </div>
              <div>
                <span className="text-text-muted">REPLACEMENT: </span>
                <span className="text-foreground">{node.replacementTime}</span>
              </div>
              {node.physicalConstraint && (
                <div>
                  <span className="text-text-muted">CONSTRAINT: </span>
                  <span className="text-accent-amber">{node.physicalConstraint}</span>
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1">
              <span className="text-[7px] px-1.5 py-0.5 rounded border border-border text-text-muted font-mono">
                SRC: {node.discoverySource}
              </span>
              {node.isConfounded && (
                <span className="text-[7px] px-1.5 py-0.5 rounded border border-accent-red/30 text-accent-red font-mono bg-accent-red/5">
                  CONFOUNDED
                </span>
              )}
              {node.isRestricted && (
                <span className="text-[7px] px-1.5 py-0.5 rounded border border-accent-amber/30 text-accent-amber font-mono bg-accent-amber/5">
                  RESTRICTED
                </span>
              )}
            </div>

            {/* Connected Edges */}
            {connectedEdges.length > 0 && (
              <div className="pt-1 border-t border-border">
                <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1.5">
                  CONNECTED EDGES ({connectedEdges.length})
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto overflow-x-hidden">
                  {connectedEdges.map((edge) => {
                    const isSource = edge.source === node.id;
                    const otherNode = graphData.nodes.find(
                      (n) => n.id === (isSource ? edge.target : edge.source)
                    );
                    return (
                      <div
                        key={edge.id}
                        className="edge-card text-[8px] font-mono p-1.5 rounded border border-border bg-surface-elevated min-w-0"
                      >
                        <div className="flex items-start gap-1">
                          <span className="text-text-muted">
                            {isSource ? "\u2192" : "\u2190"}
                          </span>
                          <span className="text-foreground truncate flex-1">
                            {otherNode?.shortLabel ?? "?"}
                          </span>
                        </div>
                        <span className="edge-meta-hidden text-text-muted text-[7px] min-w-0 break-words block mt-0.5">
                          {edge.physicalMechanism}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
