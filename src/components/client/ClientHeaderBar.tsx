"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useApexStore } from "@/stores/useApexStore";
import { computeOmegaState, computeDoomsdayState, computeAlertLevel } from "@/lib/omega-engine";
import CDOmegaMonitor from "../CDOmegaMonitor";
import ImportButton from "@/components/import/ImportButton";
import { EMPTY_GRAPH } from "@/lib/graph-data";
import { ModuleId } from "@/lib/types";

const MODULE_TABS: { id: ModuleId; label: string; icon: string; color: string }[] = [
  { id: "spirtes", label: "SPIRTES", icon: "◇", color: "var(--accent-cyan)" },
  { id: "tarski", label: "TARSKI", icon: "⊢", color: "var(--accent-green)" },
  { id: "pearl", label: "PEARL", icon: "⟐", color: "var(--accent-amber)" },
  { id: "pareto", label: "PARETO", icon: "⚠", color: "var(--accent-red)" },
];

export default function ClientHeaderBar() {
  const {
    activeModule,
    setActiveModule,
    shocks,
    sandboxOrgName,
    sandboxGraphs,
    activeSandboxGraphId,
    switchSandboxGraph,
    addSandboxGraph,
    deleteSandboxGraph,
  } = useApexStore();

  const state = useMemo(() => computeOmegaState(shocks), [shocks]);
  const doomsday = useMemo(() => computeDoomsdayState(shocks, state.buffer), [shocks, state.buffer]);
  const alertLevel = useMemo(() => computeAlertLevel(state.status, doomsday), [state.status, doomsday]);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close switcher on outside click
  useEffect(() => {
    if (!switcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [switcherOpen]);

  const activeGraph = sandboxGraphs.find((g) => g.id === activeSandboxGraphId);

  const handleNewGraph = () => {
    const idx = sandboxGraphs.length + 1;
    addSandboxGraph(`Graph ${idx}`, EMPTY_GRAPH);
    setSwitcherOpen(false);
  };

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
              APEX TERMINAL
            </span>
            {sandboxOrgName && (
              <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.35em] text-text-muted -mt-0.5">
                {sandboxOrgName.toUpperCase()}
              </span>
            )}
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

      {/* Right: Import + Graph Switcher + Session */}
      <div className="flex items-center gap-3">
        <ImportButton />

        {/* Graph Switcher */}
        <div className="relative" ref={switcherRef}>
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors"
          >
            <span className="text-[10px]">◇</span>
            {activeGraph?.name ?? "NO GRAPH"}
            <span className="text-[8px] ml-1">▾</span>
          </button>

          {switcherOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-elevated border border-border rounded shadow-lg z-20">
              {sandboxGraphs.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-accent-cyan/5 transition-colors group"
                >
                  <button
                    onClick={() => {
                      switchSandboxGraph(g.id);
                      setSwitcherOpen(false);
                    }}
                    className={`flex-1 text-left text-[9px] font-mono tracking-wider ${
                      g.id === activeSandboxGraphId ? "text-accent-cyan" : "text-text-muted"
                    }`}
                  >
                    {g.id === activeSandboxGraphId && (
                      <span className="mr-1.5">&#9656;</span>
                    )}
                    {g.name}
                    <span className="ml-1.5 text-[8px] text-text-muted">
                      ({g.graph.nodes.length}N)
                    </span>
                  </button>
                  {sandboxGraphs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSandboxGraph(g.id);
                      }}
                      className="text-[9px] text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleNewGraph}
                className="w-full text-left px-3 py-2 text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/5 border-t border-border transition-colors"
              >
                + NEW GRAPH
              </button>
            </div>
          )}
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
