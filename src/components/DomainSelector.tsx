"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";

export const DOMAIN_CARDS = [
  {
    id: "financial-contagion",
    label: "Financial Contagion Risk",
    icon: "\u{1F3E6}",
    color: "#ff6d00",
    colorVar: "var(--accent-orange)",
    description: "Systemic banking failures, credit default cascades, liquidity traps",
  },
  {
    id: "supply-chain",
    label: "Supply Chain Shock Risk",
    icon: "\u{1F517}",
    color: "#00e5ff",
    colorVar: "var(--accent-cyan)",
    description: "Critical material bottlenecks, logistics disruption, supplier concentration",
  },
  {
    id: "sovereign-risk",
    label: "Emerging Market Sovereign Risk",
    icon: "\u{1F30D}",
    color: "#ffab00",
    colorVar: "var(--accent-amber)",
    description: "Currency crises, debt restructuring, capital flight contagion",
  },
  {
    id: "infrastructure",
    label: "Infrastructure Resilience Risk",
    icon: "\u{1F3D7}",
    color: "#7c4dff",
    colorVar: "var(--accent-purple)",
    description: "Grid failures, telecom outages, transportation network collapse",
  },
  {
    id: "ai-systems",
    label: "Scaled AI System Risk",
    icon: "\u{1F916}",
    color: "#00e676",
    colorVar: "var(--accent-green)",
    description: "Compute concentration, model failures, AI supply chain disruption",
  },
  {
    id: "energy-systems",
    label: "Energy Systems Risk",
    icon: "\u{26A1}",
    color: "#ff1744",
    colorVar: "var(--accent-red)",
    description: "Grid-scale storage, HVDC transmission, nuclear fuel cycle, transformer supply",
  },
  {
    id: "manufacturing",
    label: "Manufacturing Systems Risk",
    icon: "\u{1F3ED}",
    color: "#448aff",
    colorVar: "var(--accent-blue)",
    description: "Biomanufacturing capacity, fertilizer dependency, industrial robotics",
  },
  {
    id: "frontier-science",
    label: "Frontier Science",
    icon: "\u269B\uFE0F",
    color: "#e040fb",
    colorVar: "var(--accent-magenta)",
    description: "Post-Standard Model physics, neutrino frontier, quantum gravity, dark sector detection",
  },
] as const;

const CASCADE_EXAMPLES: Record<string, string> = {
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
  // Energy Systems pairs
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
  // Manufacturing pairs
  "financial-contagion+manufacturing":
    "Credit contraction \u2192 biomanufacturing capex freeze \u2192 vaccine production gap \u2192 pandemic vulnerability",
  "manufacturing+supply-chain":
    "Rare earth embargo \u2192 industrial robotics shortage \u2192 factory automation halt \u2192 output collapse",
  "manufacturing+sovereign-risk":
    "Export controls \u2192 fertilizer supply disruption \u2192 food price shock \u2192 sovereign instability",
  "infrastructure+manufacturing":
    "Port congestion \u2192 ammonia shipping delays \u2192 fertilizer plant idle \u2192 agricultural yield drop",
  "ai-systems+manufacturing":
    "AI-driven process optimization loss \u2192 yield degradation \u2192 biomanufacturing quality failures",
  "energy-systems+manufacturing":
    "Grid-scale battery material shortage \u2192 storage deployment halt \u2192 renewable intermittency \u2192 factory power cuts",
  // Frontier Science pairs
  "ai-systems+frontier-science":
    "Compute scarcity \u2192 lattice QCD bottleneck \u2192 discovery window narrows \u2192 BSM parameter space unsearched",
  "energy-systems+frontier-science":
    "Grid failure \u2192 accelerator/detector downtime \u2192 irreversible observation window lost",
  "frontier-science+infrastructure":
    "Undersea cable cut \u2192 multi-messenger data sync lost \u2192 cross-channel correlation destroyed",
  "frontier-science+supply-chain":
    "Cryogenic helium shortage \u2192 detector cooling failure \u2192 particle physics experiment halt",
  "financial-contagion+frontier-science":
    "Science funding crisis \u2192 next-gen collider delay \u2192 post-Standard Model discovery window closes",
  "frontier-science+manufacturing":
    "Metamaterial fabrication bottleneck \u2192 quantum sensor production halt \u2192 dark sector search stalls",
  "frontier-science+sovereign-risk":
    "International collaboration collapse \u2192 experiment data-sharing embargo \u2192 discovery fragmentation",
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
  } = useApexStore();

  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localMulti, setLocalMulti] = useState(false);

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

  const handleLaunch = useCallback(() => {
    if (localSelected.length === 0) return;
    setSelectedDomains(localSelected);
    setIsMultiDomainMode(localMulti);
    setDomainSelectorOpen(false);
  }, [localSelected, localMulti, setSelectedDomains, setIsMultiDomainMode, setDomainSelectorOpen]);

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
                  !isSelected && localMulti && localSelected.length >= 3;

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
                      opacity: isDisabled ? 0.4 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      boxShadow: isSelected
                        ? `0 0 12px ${domain.color}20, 0 0 4px ${domain.color}15`
                        : "none",
                    }}
                  >
                    <span className="text-xl flex-shrink-0">{domain.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider"
                        style={{ color: isSelected ? domain.color : "var(--foreground)" }}
                      >
                        {domain.label.toUpperCase()}
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
