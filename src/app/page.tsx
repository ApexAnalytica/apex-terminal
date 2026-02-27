"use client";

import { useState, useCallback } from "react";
import { CausalShock, ModuleId, OmegaState } from "@/lib/types";
import { computeOmegaState } from "@/lib/omega-engine";
import HeaderBar from "@/components/HeaderBar";
import ManifoldSidebar from "@/components/ManifoldSidebar";
import CausalDAG from "@/components/CausalDAG";
import SyntheticTerminal from "@/components/SyntheticTerminal";
import ShockPanel from "@/components/ShockPanel";

export default function Home() {
  const [activeModule, setActiveModule] = useState<ModuleId>("pareto");
  const [shocks, setShocks] = useState<CausalShock[]>([]);

  const omegaState: OmegaState = computeOmegaState(shocks);

  const handleShockAdd = useCallback((shock: CausalShock) => {
    setShocks((prev) => {
      if (prev.some((s) => s.id === shock.id)) return prev;
      return [...prev, shock];
    });
  }, []);

  const handleShockRemove = useCallback((id: string) => {
    setShocks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Header */}
      <HeaderBar state={omegaState} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Manifold Sidebar */}
        <ManifoldSidebar
          activeModule={activeModule}
          onModuleSelect={setActiveModule}
        />

        {/* Center: DAG + Terminal */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* DAG Canvas */}
          <div className="flex-1 relative min-h-0">
            <CausalDAG shocks={shocks} />
          </div>

          {/* Terminal */}
          <div className="h-64 min-h-[200px]">
            <SyntheticTerminal
              shocks={shocks}
              onShockAdd={handleShockAdd}
              onShockRemove={handleShockRemove}
            />
          </div>
        </div>

        {/* Right: Shock Panel */}
        <ShockPanel
          activeShocks={shocks}
          onShockAdd={handleShockAdd}
          onShockRemove={handleShockRemove}
        />
      </div>
    </div>
  );
}
