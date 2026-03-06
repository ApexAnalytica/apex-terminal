"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useApexStore } from "@/stores/useApexStore";
import HeaderBar from "@/components/HeaderBar";
import SystemCopilot from "@/components/SystemCopilot";
import RiskPropagationFlow from "@/components/RiskPropagationFlow";
import ModulePanel from "@/components/ModulePanel";
import StructuralMetrics from "@/components/StructuralMetrics";
import CausalDAG2D from "@/components/CausalDAG2D";
import ImportModal from "@/components/import/ImportModal";
import SpotlightTour from "@/components/SpotlightTour";

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
      {/* Import Modal (overlay) */}
      <ImportModal />
      <SpotlightTour />

      {/* Header with module tabs */}
      <HeaderBar />

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: System Copilot */}
        <SystemCopilot />

        {/* Center: DAG + Risk Cards + Metrics */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* DAG Canvas — relative container with explicit flex sizing,
               children use absolute positioning to fill */}
          <div className="flex-1 relative min-h-0" data-tour="dag-canvas" style={{ contain: "strict" }}>
            <div className="absolute inset-0">
              {viewMode === "3d" ? <CausalDAG3D /> : <CausalDAG2D />}
            </div>
            {/* Client deployment CTA */}
            <Link
              href="/client"
              className="absolute bottom-4 right-4 z-10 group flex items-center gap-2 px-3 py-2 rounded border border-border bg-surface-elevated/80 backdrop-blur-sm hover:border-accent-cyan/60 transition-all duration-200"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan" />
              </span>
              <div className="flex flex-col">
                <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground group-hover:text-accent-cyan transition-colors">
                  CLIENT DEPLOYMENT
                </span>
                <span className="text-[8px] font-mono text-text-muted">
                  ATHENA DEFENSE SYSTEMS — Try it live
                </span>
              </div>
              <span className="text-[10px] text-text-muted group-hover:text-accent-cyan transition-colors ml-1">
                &rarr;
              </span>
            </Link>
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
