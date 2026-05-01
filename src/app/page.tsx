"use client";

import { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useApexStore } from "@/stores/useApexStore";
import { protectGraphData } from "@/lib/data-protection";
import { useFeedRegistry } from "@/hooks/useFeedRegistry";
import HeaderBar from "@/components/HeaderBar";
import SystemCopilot from "@/components/SystemCopilot";
import RiskPropagationFlow from "@/components/RiskPropagationFlow";
import ModulePanel from "@/components/ModulePanel";
import StructuralMetrics from "@/components/StructuralMetrics";
import CausalDAG2D from "@/components/CausalDAG2D";
import ImportModal from "@/components/import/ImportModal";
import SpotlightTour from "@/components/SpotlightTour";
import TimeDial from "@/components/TimeDial";
import DomainSelector from "@/components/DomainSelector";
import FeedbackWidget from "@/components/FeedbackWidget";
import TimeSeriesOverlay from "@/components/TimeSeriesOverlay";

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

// Dynamic import for Map view (no SSR — MapLibre needs DOM)
const CausalDAGMap = dynamic(() => import("@/components/CausalDAGMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="text-[10px] font-mono text-text-muted animate-pulse">
        INITIALIZING MAP RENDERER...
      </div>
    </div>
  ),
});

export default function Home() {
  const viewMode = useApexStore((s) => s.viewMode);

  // Live-data feed registry — single hook that polls every registered
  // provider on its declared cadence. Add a new provider in
  // `src/lib/feeds/providers/` and register it in `src/lib/feeds/registry.ts`;
  // no changes here.
  useFeedRegistry();

  // Protect graph data from console extraction — import dynamically so the
  // 2,920-line graph-data module isn't on the critical-path bundle (item #6).
  useEffect(() => {
    import("@/lib/graph-data").then(({ MAIN_GRAPH }) => {
      protectGraphData(MAIN_GRAPH);
    });
  }, []);

  // Block DevTools shortcuts in production
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const block = (e: KeyboardEvent) => {
      // Ctrl/Cmd+U (view source), Ctrl/Cmd+Shift+I (devtools), F12
      if (
        (e.ctrlKey && e.key === "u") ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        (e.metaKey && e.altKey && e.key === "i") ||
        e.key === "F12"
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", block);
    return () => window.removeEventListener("keydown", block);
  }, []);

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden bg-background"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Overlays */}
      <ImportModal />
      <DomainSelector />
      <SpotlightTour />
      <FeedbackWidget />

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
            {/* Keep both views mounted — use visibility:hidden instead of display:none
                to prevent WebGL context deallocation by the browser GPU process */}
            <div
              className="absolute inset-0"
              style={{
                visibility: viewMode === "3d" ? "visible" : "hidden",
                pointerEvents: viewMode === "3d" ? "auto" : "none",
                zIndex: viewMode === "3d" ? 1 : 0,
              }}
            >
              <CausalDAG3D />
            </div>
            <div
              className="absolute inset-0"
              style={{
                visibility: viewMode === "2d" ? "visible" : "hidden",
                pointerEvents: viewMode === "2d" ? "auto" : "none",
                zIndex: viewMode === "2d" ? 1 : 0,
              }}
            >
              <CausalDAG2D />
            </div>
            {viewMode === "map" && (
              <div className="absolute inset-0" style={{ zIndex: 1 }}>
                <CausalDAGMap />
              </div>
            )}
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

          {/* Pinned time series comparison overlay */}
          <TimeSeriesOverlay />

          {/* Time Dial — persistent timeline scrubber */}
          <TimeDial />

          {/* Structural Metrics Footer */}
          <StructuralMetrics />
        </div>

        {/* Right: Module Panel */}
        <ModulePanel />
      </div>
    </div>
  );
}
