"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApexStore } from "@/stores/useApexStore";
import { computeOmegaState, computeDoomsdayState, computeAlertLevel } from "@/lib/omega-engine";
import CDOmegaMonitor from "../CDOmegaMonitor";
import { ModuleId } from "@/lib/types";

const MODULE_TABS: { id: ModuleId; label: string; icon: string; color: string }[] = [
  { id: "spirtes", label: "SPIRTES", icon: "◇", color: "var(--accent-cyan)" },
  { id: "tarski", label: "TARSKI", icon: "⊢", color: "var(--accent-green)" },
  { id: "pearl", label: "PEARL", icon: "⟐", color: "var(--accent-amber)" },
  { id: "pareto", label: "PARETO", icon: "⚠", color: "var(--accent-red)" },
];

export default function ClientHeaderBar() {
  const { activeModule, setActiveModule, shocks } = useApexStore();
  const state = useMemo(() => computeOmegaState(shocks), [shocks]);
  const doomsday = useMemo(() => computeDoomsdayState(shocks, state.buffer), [shocks, state.buffer]);
  const alertLevel = useMemo(() => computeAlertLevel(state.status, doomsday), [state.status, doomsday]);

  return (
    <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-surface-elevated relative scanlines">
      {/* Left: Logo */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 group"
        >
          <span className="text-[10px] text-text-muted group-hover:text-accent-cyan transition-colors">&larr;</span>
          <div className="flex flex-col">
            <span className="font-[family-name:var(--font-michroma)] text-[13px] tracking-[0.2em] text-foreground group-hover:text-accent-cyan transition-colors">
              ATHENA
            </span>
            <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.35em] text-text-muted -mt-0.5">
              DEFENSE SYSTEMS
            </span>
          </div>
        </Link>
        <div className="h-8 w-px bg-border" />

        {/* Module Tabs */}
        <div className="flex items-center gap-1">
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
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-text-muted font-mono tracking-wider">
            ISR OPS
          </span>
          <span className="text-[9px] text-text-muted font-mono">
            AI SUPPLY CHAIN
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
