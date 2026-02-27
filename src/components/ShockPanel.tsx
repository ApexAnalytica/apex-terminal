"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CausalShock } from "@/lib/types";
import { getPresetShocks } from "@/lib/omega-engine";

interface ShockPanelProps {
  activeShocks: CausalShock[];
  onShockAdd: (shock: CausalShock) => void;
  onShockRemove: (id: string) => void;
}

export default function ShockPanel({
  activeShocks,
  onShockAdd,
  onShockRemove,
}: ShockPanelProps) {
  const presets = getPresetShocks();

  return (
    <div className="flex flex-col h-full border-l border-border bg-surface w-72">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] text-text-muted">
          CAUSAL SHOCK INJECTOR
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          Bits &rarr; Atoms | Physical Constraints
        </div>
      </div>

      {/* Active Shocks */}
      <div className="px-4 py-2 border-b border-border">
        <div className="text-[9px] text-accent-red font-mono tracking-wider mb-2">
          ACTIVE ({activeShocks.length})
        </div>
        <AnimatePresence>
          {activeShocks.map((shock) => (
            <motion.div
              key={shock.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2"
            >
              <div className="flex items-start justify-between gap-2 p-2 rounded border border-accent-red/30 bg-accent-red/5">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-accent-red font-mono truncate">
                    {shock.name}
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">
                    SEV: {(shock.severity * 100).toFixed(0)}%
                  </div>
                </div>
                <button
                  onClick={() => onShockRemove(shock.id)}
                  className="text-[10px] text-text-muted hover:text-accent-red transition-colors px-1"
                >
                  &times;
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {activeShocks.length === 0 && (
          <div className="text-[9px] text-text-muted italic">
            No active shocks
          </div>
        )}
      </div>

      {/* Preset Shocks */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="text-[9px] text-text-muted font-mono tracking-wider mb-2">
          SCENARIOS
        </div>
        {presets.map((shock) => {
          const isActive = activeShocks.some((s) => s.id === shock.id);
          return (
            <button
              key={shock.id}
              onClick={() => !isActive && onShockAdd(shock)}
              disabled={isActive}
              className="w-full text-left mb-1.5 p-2 rounded border transition-all"
              style={{
                borderColor: isActive ? "var(--border-bright)" : "var(--border)",
                opacity: isActive ? 0.4 : 1,
                backgroundColor: isActive ? "transparent" : "var(--surface-elevated)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px]"
                  style={{
                    color: getCategoryColor(shock.category),
                  }}
                >
                  {getCategoryIcon(shock.category)}
                </span>
                <span className="text-[10px] font-mono text-foreground truncate">
                  {shock.name}
                </span>
              </div>
              <div className="text-[9px] text-text-muted mt-0.5 ml-5 truncate">
                {shock.description}
              </div>
              {shock.physicalConstraint && (
                <div className="text-[9px] text-accent-amber/60 mt-0.5 ml-5 truncate">
                  &laquo; {shock.physicalConstraint} &raquo;
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getCategoryColor(cat: string): string {
  switch (cat) {
    case "compute": return "var(--accent-cyan)";
    case "energy": return "var(--accent-green)";
    case "cooling": return "#448aff";
    case "supply": return "var(--accent-amber)";
    case "geopolitical": return "var(--accent-red)";
    default: return "var(--text-muted)";
  }
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case "compute": return "⬡";
    case "energy": return "⚡";
    case "cooling": return "◈";
    case "supply": return "◆";
    case "geopolitical": return "⚠";
    default: return "●";
  }
}
