"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { computeOmegaState, computeDoomsdayState, computeAlertLevel } from "@/lib/omega-engine";
import CDOmegaMonitor from "./CDOmegaMonitor";
import ImportButton from "./import/ImportButton";
import { ModuleId } from "@/lib/types";
import { DOMAIN_CARDS } from "./DomainSelector";

const MODULE_TABS: { id: ModuleId; label: string; icon: string; color: string }[] = [
  { id: "spirtes", label: "SPIRTES", icon: "◇", color: "var(--accent-cyan)" },
  { id: "tarski", label: "TARSKI", icon: "⊢", color: "var(--accent-green)" },
  { id: "pearl", label: "PEARL", icon: "⟐", color: "var(--accent-amber)" },
  { id: "pareto", label: "PARETO", icon: "⚠", color: "var(--accent-red)" },
];

export default function HeaderBar() {
  const { activeModule, setActiveModule, shocks, replayActive, currentEpoch, baselineEpochs, interventionEpochs, activeTimeline, setTourActive, selectedDomains, setDomainSelectorOpen } = useApexStore();
  const baseState = useMemo(() => computeOmegaState(shocks), [shocks]);

  // During replay, override omega state with current epoch's values
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const currentSnapshot = replayActive && replayEpochs.length > 0 ? replayEpochs[currentEpoch] ?? null : null;

  const state = useMemo(() => {
    if (currentSnapshot) {
      return {
        buffer: currentSnapshot.omegaBuffer,
        shocks,
        status: currentSnapshot.omegaStatus,
        lastUpdate: Date.now(),
      };
    }
    return baseState;
  }, [currentSnapshot, baseState, shocks]);

  const doomsday = useMemo(() => computeDoomsdayState(shocks, state.buffer), [shocks, state.buffer]);
  const alertLevel = useMemo(() => computeAlertLevel(state.status, doomsday), [state.status, doomsday]);

  return (
    <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-surface-elevated relative scanlines">
      {/* Left: Logo */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="font-[family-name:var(--font-michroma)] text-[13px] tracking-[0.2em] text-foreground">
            APEX
          </span>
          <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.35em] text-text-muted -mt-0.5">
            ANALYTICA
          </span>
          <span className="font-[family-name:var(--font-michroma)] text-[7px] tracking-[0.4em] text-accent-cyan/60 -mt-0.5">
            MANIFOLD
          </span>
        </div>
        <div className="h-8 w-px bg-border" />

        {/* Selected Domains */}
        {selectedDomains.length > 0 && (
          <>
            <button
              onClick={() => setDomainSelectorOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-accent-cyan/40 transition-colors group"
              title="Change domain workspace"
            >
              {selectedDomains.map((id) => {
                const domain = DOMAIN_CARDS.find((d) => d.id === id);
                if (!domain) return null;
                return (
                  <span
                    key={id}
                    className="text-sm"
                    title={domain.label}
                  >
                    {domain.icon}
                  </span>
                );
              })}
              <span className="text-[8px] font-mono text-text-muted group-hover:text-accent-cyan transition-colors ml-0.5">
                {selectedDomains.length > 1 ? "MULTI" : "SINGLE"}
              </span>
            </button>
            <div className="h-8 w-px bg-border" />
          </>
        )}

        {/* Module Tabs */}
        <div className="flex items-center gap-1" data-tour="module-tabs">
          {MODULE_TABS.map((tab) => {
            const isActive = activeModule === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
                style={{
                  color: isActive ? tab.color : "var(--text-muted)",
                  backgroundColor: isActive
                    ? `color-mix(in srgb, ${tab.color} 10%, transparent)`
                    : "transparent",
                  borderBottom: isActive ? `1px solid ${tab.color}` : "1px solid transparent",
                }}
              >
                <span className="text-xs">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: CDΩ Monitor */}
      <CDOmegaMonitor state={state} doomsday={doomsday} alertLevel={alertLevel} />

      {/* Right: Meta */}
      <div className="flex items-center gap-4">
        <ImportButton />
        <button
          onClick={() => setTourActive(true)}
          className="flex items-center justify-center w-7 h-7 rounded border border-border text-[11px] font-[family-name:var(--font-michroma)] text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors"
          title="Feature Tour"
        >
          ?
        </button>
        <div className="h-8 w-px bg-border" />
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-text-muted font-mono tracking-wider">
            TECH 2.0
          </span>
          <span className="text-[9px] text-text-muted font-mono">
            CAUSAL DERIVATION
          </span>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-text-muted font-mono tracking-wider">
            SESSION
          </span>
          <span className="text-[9px] text-accent-green font-mono">
            ACTIVE
          </span>
        </div>
      </div>
    </header>
  );
}
