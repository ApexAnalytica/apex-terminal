"use client";

import { motion } from "framer-motion";
import { ManifoldModule, ModuleId } from "@/lib/types";

const MODULES: ManifoldModule[] = [
  {
    id: "spirtes",
    name: "SPIRTES",
    subtitle: "Structure Discovery",
    description: "Causal DAG learning from observational data",
    icon: "◇",
    color: "var(--accent-cyan)",
    status: "ACTIVE",
  },
  {
    id: "tarski",
    name: "TARSKI",
    subtitle: "Truth Verification",
    description: "Physical constraint validation — reject hallucinations",
    icon: "⊢",
    color: "var(--accent-green)",
    status: "ACTIVE",
  },
  {
    id: "pearl",
    name: "PEARL",
    subtitle: "Counterfactual Engine",
    description: "do-calculus reasoning — interventional queries",
    icon: "⟐",
    color: "var(--accent-amber)",
    status: "STANDBY",
  },
  {
    id: "pareto",
    name: "PARETO",
    subtitle: "Criticality Warning",
    description: "Strategic risk & Ω-fragility assessment",
    icon: "⚠",
    color: "var(--accent-red)",
    status: "ALERT",
  },
];

interface ManifoldSidebarProps {
  activeModule: ModuleId;
  onModuleSelect: (id: ModuleId) => void;
}

export default function ManifoldSidebar({
  activeModule,
  onModuleSelect,
}: ManifoldSidebarProps) {
  return (
    <aside className="flex flex-col w-64 border-r border-border bg-surface h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted uppercase">
          Manifold Engine
        </div>
        <div className="font-[family-name:var(--font-michroma)] text-[11px] tracking-wider text-foreground mt-1">
          NAVIGATION
        </div>
      </div>

      {/* Module List */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {MODULES.map((mod) => {
          const isActive = activeModule === mod.id;
          return (
            <motion.button
              key={mod.id}
              onClick={() => onModuleSelect(mod.id)}
              className="w-full text-left px-4 py-3 border-l-2 transition-colors relative"
              style={{
                borderLeftColor: isActive ? mod.color : "transparent",
                backgroundColor: isActive
                  ? `color-mix(in srgb, ${mod.color} 5%, transparent)`
                  : "transparent",
              }}
              whileHover={{
                backgroundColor: `color-mix(in srgb, ${mod.color} 8%, transparent)`,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-lg w-6 text-center"
                  style={{ color: mod.color }}
                >
                  {mod.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-[family-name:var(--font-michroma)] text-[11px] tracking-wider"
                      style={{ color: isActive ? mod.color : "var(--foreground)" }}
                    >
                      {mod.name}
                    </span>
                    <StatusDot status={mod.status} color={mod.color} />
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5 truncate">
                    {mod.subtitle}
                  </div>
                </div>
              </div>
              {isActive && (
                <motion.div
                  className="text-[9px] text-text-muted mt-2 ml-9 leading-relaxed"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                >
                  {mod.description}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-[9px] text-text-muted tracking-wider uppercase">
          Apex Analytica
        </div>
        <div className="text-[9px] text-text-muted mt-0.5">
          &Omega;-Critical AI Systems&trade; Playbook
        </div>
        <div className="text-[9px] text-text-muted mt-1 font-mono">
          Tech 2.0 — Causal Derivation
        </div>
      </div>
    </aside>
  );
}

function StatusDot({
  status,
  color,
}: {
  status: ManifoldModule["status"];
  color: string;
}) {
  return (
    <span className="relative flex h-2 w-2">
      {status === "ALERT" && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75 pulse-ring"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{
          backgroundColor: status === "STANDBY" ? "var(--text-muted)" : color,
        }}
      />
    </span>
  );
}
