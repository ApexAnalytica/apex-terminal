"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { MAIN_GRAPH, EMPTY_GRAPH } from "@/lib/graph-data";
import { ATHENA_GRAPH } from "@/lib/athena-graph-data";
import { mergeGraphs } from "@/lib/import/merge";
import type { NodeCategory, CausalGraph } from "@/lib/types";

const NODE_CATEGORIES: { id: NodeCategory; label: string; icon: string }[] = [
  { id: "economic", label: "ECONOMIC", icon: "📊" },
  { id: "finance", label: "FINANCE", icon: "💰" },
  { id: "energy", label: "ENERGY", icon: "⚡" },
  { id: "infrastructure", label: "INFRASTRUCTURE", icon: "🏗" },
  { id: "manufacturing", label: "MANUFACTURING", icon: "🏭" },
  { id: "agriculture", label: "AGRICULTURE", icon: "🌾" },
  { id: "geopolitical", label: "GEOPOLITICAL", icon: "🌐" },
  { id: "communications", label: "COMMUNICATIONS", icon: "📡" },
  { id: "science", label: "SCIENCE", icon: "🔬" },
];

const DISCOVERY_SOURCES = [
  { id: "DCD", label: "DCD / NOTEARS", desc: "Structural" },
  { id: "PCMCI+", label: "PCMCI+", desc: "Temporal" },
  { id: "FCI", label: "FCI", desc: "Latent confounders" },
  { id: "merged", label: "MERGED", desc: "Cross-engine" },
];

const DATA_SOURCES = [
  {
    id: "middle-east-playbooks",
    label: "Middle East Playbooks",
    desc: "Saudi Aramco, QatarEnergy LNG, QAFCO, Ma'aden, supply chain, sovereign risk, infrastructure",
    nodeCount: MAIN_GRAPH.nodes.length,
    edgeCount: MAIN_GRAPH.edges.length,
    color: "#00e5ff",
    hasData: true,
  },
  {
    id: "athena-isr",
    label: "Athena ISR",
    desc: "Drone swarms, SATCOM, ISR fusion, chip embargo, secure compute, kill chain",
    nodeCount: ATHENA_GRAPH.nodes.length,
    edgeCount: ATHENA_GRAPH.edges.length,
    color: "#ff6d00",
    hasData: true,
  },
  {
    id: "satellite-networks",
    label: "Satellite Networks",
    desc: "Starlink, GPS III, launch vehicles, ground stations, space weather",
    nodeCount: 0,
    edgeCount: 0,
    color: "#7c4dff",
    hasData: false,
  },
] as const;

function buildGraphFromSources(sourceIds: string[]): CausalGraph {
  let graph: CausalGraph = { nodes: [], edges: [], metadata: EMPTY_GRAPH.metadata };
  for (const id of sourceIds) {
    if (id === "middle-east-playbooks") {
      const { graph: merged } = mergeGraphs(graph, { nodes: MAIN_GRAPH.nodes, edges: MAIN_GRAPH.edges });
      graph = merged;
    } else if (id === "athena-isr") {
      const { graph: merged } = mergeGraphs(graph, { nodes: ATHENA_GRAPH.nodes, edges: ATHENA_GRAPH.edges });
      graph = merged;
    }
  }
  return graph;
}

export const DOMAIN_CARDS = [
  {
    id: "financial-contagion",
    label: "Financial Contagion Risk",
    icon: "\u{1F3E6}",
    color: "#ff6d00",
    colorVar: "var(--accent-orange)",
    description: "Systemic banking failures, credit default cascades, liquidity traps",
    hasData: true,
  },
  {
    id: "supply-chain",
    label: "Supply Chain Shock Risk",
    icon: "\u{1F517}",
    color: "#00e5ff",
    colorVar: "var(--accent-cyan)",
    description: "MENA food security, Bunge/Almarai supply chains, wheat price transmission, strategic reserves",
    hasData: true,
  },
  {
    id: "sovereign-risk",
    label: "Emerging Market Sovereign Risk",
    icon: "\u{1F30D}",
    color: "#ffab00",
    colorVar: "var(--accent-amber)",
    description: "Currency crises, debt restructuring, capital flight contagion",
    hasData: true,
  },
  {
    id: "infrastructure",
    label: "Infrastructure Resilience Risk",
    icon: "\u{1F3D7}",
    color: "#7c4dff",
    colorVar: "var(--accent-purple)",
    description: "Undersea cable systems, Red Sea exposure, Telecom Egypt/Orange Marine landing station concentration",
    hasData: true,
  },
  {
    id: "ai-systems",
    label: "Scaled AI System Risk",
    icon: "\u{1F916}",
    color: "#00e676",
    colorVar: "var(--accent-green)",
    description: "Drone swarms, SATCOM, ISR fusion, chip embargo, secure compute, kill chain",
    hasData: true,
  },
  {
    id: "energy-systems",
    label: "Energy Systems",
    icon: "\u{26A1}",
    color: "#ff1744",
    colorVar: "var(--accent-red)",
    description: "Saudi Aramco crude/gas infrastructure, QatarEnergy LNG export chains",
    hasData: true,
  },
  {
    id: "manufacturing",
    label: "Fertilizer & Agrochemical",
    icon: "\u{1F3ED}",
    color: "#448aff",
    colorVar: "var(--accent-blue)",
    description: "QAFCO urea/ammonia complex, Ma'aden phosphate supply chains, food price transmission",
    hasData: true,
  },
  {
    id: "frontier-science",
    label: "Frontier Science",
    icon: "\u269B\uFE0F",
    color: "#e040fb",
    colorVar: "var(--accent-magenta)",
    description: "Post-Standard Model physics, neutrino frontier, quantum gravity, dark sector detection",
    hasData: false,
  },
] as const;

const CASCADE_EXAMPLES: Record<string, string> = {
  "energy-systems+manufacturing":
    "Saudi gas supply disruption \u2192 ammonia feedstock shortage \u2192 QAFCO/Ma'aden output collapse \u2192 global fertilizer price spike \u2192 food inflation",
  "financial-contagion+supply-chain":
    "Bank credit freeze \u2192 trade finance collapse \u2192 shipping delays \u2192 manufacturing halt",
  "financial-contagion+sovereign-risk":
    "Sovereign default \u2192 bank exposure losses \u2192 cross-border contagion \u2192 currency crisis",
  "financial-contagion+infrastructure":
    "Infrastructure bond default \u2192 municipal credit freeze \u2192 utility service degradation",
  "financial-contagion+ai-systems":
    "AI compute capex pullback \u2192 chip vendor revenue shock \u2192 semiconductor credit tightening",
  "supply-chain+sovereign-risk":
    "Export ban \u2192 critical mineral shortage \u2192 manufacturing re-routing \u2192 cost inflation",
  "supply-chain+infrastructure":
    "Port failure \u2192 rerouting bottleneck \u2192 energy grid overload \u2192 cascading blackouts",
  "supply-chain+ai-systems":
    "Chip fab disruption \u2192 GPU allocation crisis \u2192 AI training delays \u2192 compute rationing",
  "sovereign-risk+infrastructure":
    "Fiscal crisis \u2192 infrastructure maintenance cuts \u2192 grid instability \u2192 industrial output drop",
  "sovereign-risk+ai-systems":
    "Data sovereignty laws \u2192 compute localization \u2192 efficiency loss \u2192 AI capability fragmentation",
  "infrastructure+ai-systems":
    "Power grid failure \u2192 data center outage \u2192 AI service disruption \u2192 dependent system cascades",
  "energy-systems+financial-contagion":
    "Grid instability \u2192 utility bond default \u2192 energy credit freeze \u2192 rolling blackout financing gap",
  "energy-systems+supply-chain":
    "Transformer shortage \u2192 grid expansion halt \u2192 industrial power rationing \u2192 manufacturing delays",
  "energy-systems+sovereign-risk":
    "Nuclear fuel enrichment bottleneck \u2192 energy import dependency \u2192 sovereign credit downgrade",
  "energy-systems+infrastructure":
    "HVDC cable failure \u2192 grid island separation \u2192 frequency instability \u2192 cascading load shed",
  "ai-systems+energy-systems":
    "AI data center load surge \u2192 grid capacity breach \u2192 emergency curtailment \u2192 compute rationing",
  "financial-contagion+manufacturing":
    "Credit contraction \u2192 biomanufacturing capex freeze \u2192 vaccine production gap \u2192 pandemic vulnerability",
  "manufacturing+supply-chain":
    "Rare earth embargo \u2192 industrial robotics shortage \u2192 factory automation halt \u2192 output collapse",
  "manufacturing+sovereign-risk":
    "Export controls \u2192 fertilizer supply disruption \u2192 food price shock \u2192 sovereign instability",
};

function getCascadeExamples(domainIds: string[]): string[] {
  if (domainIds.length < 2) return [];
  const examples: string[] = [];
  for (let i = 0; i < domainIds.length; i++) {
    for (let j = i + 1; j < domainIds.length; j++) {
      const key = [domainIds[i], domainIds[j]].sort().join("+");
      const ex = CASCADE_EXAMPLES[key];
      if (ex) examples.push(ex);
    }
  }
  return examples;
}

export default function DomainSelector() {
  const {
    domainSelectorOpen,
    setDomainSelectorOpen,
    isMultiDomainMode,
    setIsMultiDomainMode,
    setSelectedDomains,
    setVisibleCategories,
    setVisibleDiscoverySources,
    setSelectedDataSources,
    setGraphData,
  } = useApexStore();

  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localMulti, setLocalMulti] = useState(false);
  const [localCategories, setLocalCategories] = useState<Set<string>>(new Set());
  const [localSources, setLocalSources] = useState<Set<string>>(new Set());
  const [showDataLayers, setShowDataLayers] = useState(false);
  const [localDataSources, setLocalDataSources] = useState<string[]>(["middle-east-playbooks"]);

  const toggleDomain = useCallback(
    (id: string) => {
      setLocalSelected((prev) => {
        if (prev.includes(id)) return prev.filter((d) => d !== id);
        if (!localMulti) return [id];
        if (prev.length >= 3) return prev;
        return [...prev, id];
      });
    },
    [localMulti]
  );

  const switchMode = useCallback(
    (multi: boolean) => {
      setLocalMulti(multi);
      if (!multi) {
        // In single mode keep only first selection
        setLocalSelected((prev) => (prev.length > 0 ? [prev[0]] : []));
      }
    },
    []
  );

  const toggleCategory = useCallback((id: string) => {
    setLocalCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSource = useCallback((id: string) => {
    setLocalSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleDataSource = useCallback((id: string) => {
    setLocalDataSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }, []);

  const handleLaunch = useCallback(() => {
    if (localSelected.length === 0) return;
    // Build and set the merged graph from selected data sources
    const mergedGraph = buildGraphFromSources(localDataSources);
    setGraphData(mergedGraph);
    setSelectedDataSources(localDataSources);
    setSelectedDomains(localSelected);
    setIsMultiDomainMode(localMulti);
    setVisibleCategories(localCategories);
    setVisibleDiscoverySources(localSources);
    setDomainSelectorOpen(false);
  }, [localSelected, localMulti, localCategories, localSources, localDataSources, setGraphData, setSelectedDataSources, setSelectedDomains, setIsMultiDomainMode, setVisibleCategories, setVisibleDiscoverySources, setDomainSelectorOpen]);

  const cascadeExamples = getCascadeExamples(localSelected);

  return (
    <AnimatePresence>
      {domainSelectorOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-2xl mx-4 rounded-lg border border-border bg-background shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.15em] text-foreground">
                  DOMAIN WORKSPACE
                </h2>
                <span className="text-[9px] font-mono text-text-muted tracking-wider">
                  Select risk domain{localMulti ? "s" : ""} to initialize causal graph
                </span>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="px-6 pt-4 flex gap-2">
              <button
                onClick={() => switchMode(false)}
                className="px-3 py-1.5 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors border"
                style={{
                  color: !localMulti ? "var(--accent-cyan)" : "var(--text-muted)",
                  borderColor: !localMulti ? "var(--accent-cyan)" : "var(--border)",
                  backgroundColor: !localMulti ? "rgba(0,229,255,0.08)" : "transparent",
                }}
              >
                SINGLE DOMAIN
              </button>
              <button
                onClick={() => switchMode(true)}
                className="px-3 py-1.5 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors border"
                style={{
                  color: localMulti ? "var(--accent-cyan)" : "var(--text-muted)",
                  borderColor: localMulti ? "var(--accent-cyan)" : "var(--border)",
                  backgroundColor: localMulti ? "rgba(0,229,255,0.08)" : "transparent",
                }}
              >
                MULTI-DOMAIN NETWORK
              </button>
              {localMulti && (
                <span className="text-[8px] font-mono text-text-muted self-center ml-2">
                  Select 2-3 domains
                </span>
              )}
            </div>

            {/* Domain Cards */}
            <div className="px-6 py-4 grid gap-1.5 max-h-[400px] overflow-y-auto">
              {DOMAIN_CARDS.map((domain) => {
                const isSelected = localSelected.includes(domain.id);
                const isDisabled =
                  !domain.hasData ||
                  (!isSelected && localMulti && localSelected.length >= 3);

                return (
                  <button
                    key={domain.id}
                    onClick={() => !isDisabled && toggleDomain(domain.id)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded border transition-all text-left"
                    style={{
                      borderColor: isSelected ? domain.color : "var(--border)",
                      backgroundColor: isSelected
                        ? `${domain.color}10`
                        : "var(--surface)",
                      opacity: isDisabled ? 0.35 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      boxShadow: isSelected
                        ? `0 0 12px ${domain.color}20, 0 0 4px ${domain.color}15`
                        : "none",
                    }}
                  >
                    <span className="text-xl flex-shrink-0">{domain.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider flex items-center gap-2"
                        style={{ color: isSelected ? domain.color : domain.hasData ? "var(--foreground)" : "var(--text-muted)" }}
                      >
                        {domain.label.toUpperCase()}
                        {!domain.hasData && (
                          <span className="text-[7px] px-1.5 py-0.5 rounded border border-border text-text-muted bg-surface/50">
                            COMING SOON
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-mono text-text-muted mt-0.5 truncate">
                        {domain.description}
                      </div>
                    </div>
                    {isSelected && (
                      <span
                        className="text-[10px] font-mono flex-shrink-0"
                        style={{ color: domain.color }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Cascade Examples */}
            <AnimatePresence>
              {cascadeExamples.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-2">
                    <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1.5">
                      CROSS-DOMAIN CASCADE PATHS
                    </div>
                    <div className="space-y-1">
                      {cascadeExamples.map((ex, i) => (
                        <div
                          key={i}
                          className="text-[9px] font-mono text-accent-amber/80 px-3 py-1.5 rounded bg-accent-amber/5 border border-accent-amber/15"
                        >
                          {ex}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Data Sources */}
            <div className="px-6 pb-3">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-2">
                DATA SOURCES
                <span className="ml-2 text-[7px] font-mono text-text-muted/50">
                  {localDataSources.length} active
                </span>
              </div>
              <div className="space-y-1">
                {DATA_SOURCES.map((src) => {
                  const active = localDataSources.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      onClick={() => src.hasData && toggleDataSource(src.id)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded border transition-all text-left"
                      style={{
                        borderColor: active ? src.color : "var(--border)",
                        backgroundColor: active ? `${src.color}10` : "var(--surface)",
                        opacity: src.hasData ? 1 : 0.35,
                        cursor: src.hasData ? "pointer" : "not-allowed",
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: active ? src.color : "var(--border)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider flex items-center gap-2"
                          style={{ color: active ? src.color : src.hasData ? "var(--foreground)" : "var(--text-muted)" }}
                        >
                          {src.label.toUpperCase()}
                          {!src.hasData && (
                            <span className="text-[7px] px-1.5 py-0.5 rounded border border-border text-text-muted bg-surface/50">
                              COMING SOON
                            </span>
                          )}
                        </div>
                        <div className="text-[8px] font-mono text-text-muted mt-0.5 truncate">
                          {src.desc}
                        </div>
                      </div>
                      {src.hasData && (
                        <span className="text-[7px] font-mono text-text-muted/60 flex-shrink-0">
                          {src.nodeCount}n / {src.edgeCount}e
                        </span>
                      )}
                      {active && (
                        <span className="text-[8px] font-mono flex-shrink-0" style={{ color: src.color }}>
                          ON
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Data Layers */}
            <div className="px-6 pb-2">
              <button
                onClick={() => setShowDataLayers((p) => !p)}
                className="flex items-center gap-2 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-accent-cyan transition-colors"
              >
                <span style={{ transform: showDataLayers ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
                DATA LAYERS
                <span className="text-[7px] font-mono text-text-muted/50">
                  {localCategories.size === 0 && localSources.size === 0 ? "ALL" : `${localCategories.size + localSources.size} filters`}
                </span>
              </button>
              <AnimatePresence>
                {showDataLayers && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-3">
                      {/* Node Categories */}
                      <div>
                        <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-1.5">
                          NODE CATEGORIES
                          <span className="ml-2 text-[7px] font-mono text-text-muted/40">
                            {localCategories.size === 0 ? "showing all" : `${localCategories.size} selected`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {NODE_CATEGORIES.map((cat) => {
                            const active = localCategories.size === 0 || localCategories.has(cat.id);
                            return (
                              <button
                                key={cat.id}
                                onClick={() => toggleCategory(cat.id)}
                                className="px-2 py-1 rounded border text-[8px] font-mono transition-all"
                                style={{
                                  borderColor: localCategories.has(cat.id) ? "var(--accent-cyan)" : "var(--border)",
                                  backgroundColor: localCategories.has(cat.id) ? "rgba(0,229,255,0.08)" : "transparent",
                                  color: active ? "var(--foreground)" : "var(--text-muted)",
                                  opacity: active ? 1 : 0.4,
                                }}
                              >
                                {cat.icon} {cat.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Discovery Sources */}
                      <div>
                        <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-1.5">
                          DISCOVERY ENGINES
                          <span className="ml-2 text-[7px] font-mono text-text-muted/40">
                            {localSources.size === 0 ? "showing all" : `${localSources.size} selected`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {DISCOVERY_SOURCES.map((src) => {
                            const active = localSources.size === 0 || localSources.has(src.id);
                            return (
                              <button
                                key={src.id}
                                onClick={() => toggleSource(src.id)}
                                className="px-2 py-1 rounded border text-[8px] font-mono transition-all"
                                style={{
                                  borderColor: localSources.has(src.id) ? "var(--accent-cyan)" : "var(--border)",
                                  backgroundColor: localSources.has(src.id) ? "rgba(0,229,255,0.08)" : "transparent",
                                  color: active ? "var(--foreground)" : "var(--text-muted)",
                                  opacity: active ? 1 : 0.4,
                                }}
                              >
                                {src.label} <span className="text-text-muted/50">{src.desc}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {(localCategories.size > 0 || localSources.size > 0) && (
                        <button
                          onClick={() => { setLocalCategories(new Set()); setLocalSources(new Set()); }}
                          className="text-[7px] font-mono text-accent-cyan/60 hover:text-accent-cyan transition-colors"
                        >
                          ✕ CLEAR ALL FILTERS
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <span className="text-[9px] font-mono text-text-muted">
                {localSelected.length === 0
                  ? "No domain selected"
                  : `${localSelected.length} domain${localSelected.length > 1 ? "s" : ""} selected`}
              </span>
              <button
                onClick={handleLaunch}
                disabled={localSelected.length === 0}
                className="px-5 py-2 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-wider transition-all border"
                style={{
                  color:
                    localSelected.length > 0
                      ? "var(--accent-cyan)"
                      : "var(--text-muted)",
                  borderColor:
                    localSelected.length > 0
                      ? "var(--accent-cyan)"
                      : "var(--border)",
                  backgroundColor:
                    localSelected.length > 0
                      ? "rgba(0,229,255,0.1)"
                      : "transparent",
                  cursor:
                    localSelected.length > 0 ? "pointer" : "not-allowed",
                }}
              >
                LAUNCH WORKSPACE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
