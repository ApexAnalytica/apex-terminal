"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";

export const DOMAIN_CARDS = [
  {
    id: "energy-systems",
    label: "Energy Systems",
    icon: "\u{26A1}",
    color: "#00e676",
    colorVar: "var(--accent-green)",
    description: "Saudi Aramco crude/gas infrastructure, QatarEnergy LNG export chains",
  },
  {
    id: "manufacturing",
    label: "Fertilizer & Agrochemical",
    icon: "\u{1F3ED}",
    color: "#76ff03",
    colorVar: "var(--accent-green)",
    description: "QAFCO urea/ammonia complex, Ma'aden phosphate supply chains, food price transmission",
  },
] as const;

const CASCADE_EXAMPLES: Record<string, string> = {
  "energy-systems+manufacturing":
    "Saudi gas supply disruption \u2192 ammonia feedstock shortage \u2192 QAFCO/Ma'aden output collapse \u2192 global fertilizer price spike \u2192 food inflation",
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
