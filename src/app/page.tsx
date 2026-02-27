"use client";

import dynamic from "next/dynamic";
import { useApexStore } from "@/stores/useApexStore";
import HeaderBar from "@/components/HeaderBar";
import SystemCopilot from "@/components/SystemCopilot";
import RiskPropagationFlow from "@/components/RiskPropagationFlow";
import ModulePanel from "@/components/ModulePanel";
import StructuralMetrics from "@/components/StructuralMetrics";
import CausalDAG2D from "@/components/CausalDAG2D";

// Dynamic import for 3D canvas (no SSR)
const CausalDAG3D = dynamic(() => import("@/components/CausalDAG3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="text-[10px] font-mono text-text-muted animate-pulse">
        INITIALIZING WEBGL_3D RENDERER...
      </div>
    </div>
  ),
});

export default function Home() {
  const viewMode = useApexStore((s) => s.viewMode);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Header with module tabs */}
      <HeaderBar />

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: System Copilot */}
        <SystemCopilot />

        {/* Center: DAG + Risk Cards + Metrics */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* DAG Canvas */}
          <div className="flex-1 relative min-h-0">
            {viewMode === "3d" ? <CausalDAG3D /> : <CausalDAG2D />}
          </div>

          {/* Risk Propagation Flow */}
          <RiskPropagationFlow />

          {/* Structural Metrics Footer */}
          <StructuralMetrics />
        </div>

        {/* Right: Module Panel */}
        <ModulePanel />
      </div>
    </div>
  );
}
