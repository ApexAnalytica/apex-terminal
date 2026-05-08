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
import TimeDial from "@/components/TimeDial";
import FeedbackWidget from "@/components/FeedbackWidget";
import TimeSeriesOverlay from "@/components/TimeSeriesOverlay";

// Lazy-loaded modals — neither is on the critical path. Both render
// nothing visible until the user explicitly opens them, so deferring
// their JS chunks costs nothing on first paint:
//   - ImportModal pulls parsers + framer-motion + sub-components.
//   - SpotlightTour pulls framer-motion + onboarding logic.
const ImportModal = dynamic(
  () => import("@/components/import/ImportModal"),
  { ssr: false }
);
const SpotlightTour = dynamic(
  () => import("@/components/SpotlightTour"),
  { ssr: false }
);

// DomainSelector + DemoFlowPlayerHost both transitively pull the
// four large graph-data modules (~3000 lines combined) via
// `@/lib/build-domain-graph`. They render nothing until the user
// opens the picker / runs a demo, so defer their chunks. The catalog
// surface used elsewhere (HeaderBar's tab labels, copilot context)
// imports from the lighter `@/lib/domains` module which is unaffected
// by this lazy load.
const DomainSelector = dynamic(
  () => import("@/components/DomainSelector"),
  { ssr: false }
);
const DemoFlowPlayerHost = dynamic(
  () =>
    import("@/components/DemoFlowPlayer").then((m) => ({
      default: m.DemoFlowPlayerHost,
    })),
  { ssr: false }
);

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

// CausalDAG2D was previously statically imported and rendered alongside
// CausalDAG3D with `visibility: hidden` so view switches were instant.
// Cost: on launch the 2D layout sim + Brandes' centrality ran in parallel
// with the 3D ones, doubling the work in the launch frame. User reports
// of "manifold keeps freezing on LAUNCH WORKSPACE" came back even after
// the omega-pillar O(N×E) fix and the metric deferrals — this was the
// remaining sync budget hog. 2D doesn't carry a WebGL context (it uses
// React Flow), so the comment about GPU-context preservation that
// motivated the always-mount pattern doesn't apply to 2D.
//
// Trade-off: first switch from 3D → 2D incurs chunk-load + layout
// compute (~300-500ms on a 500-node CROSS-DOMAIN workspace), same shape
// as the existing first-switch latency for Map / Relief.
const CausalDAG2D = dynamic(() => import("@/components/CausalDAG2D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="text-[10px] font-mono text-text-muted animate-pulse">
        INITIALIZING 2D RENDERER...
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

// Dynamic import for Relief view — r3f scene with a Gaussian heightfield.
// Mount only when active; unlike 2D/3D it doesn't keep its own WebGL context
// alive in the background.
const CausalDAGRelief = dynamic(() => import("@/components/CausalDAGRelief"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="text-[10px] font-mono text-text-muted animate-pulse">
        INITIALIZING RELIEF RENDERER...
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
      <DemoFlowPlayerHost />
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
            {/* 3D stays always-mounted with visibility:hidden so the WebGL
                context isn't torn down on view switches (the browser's GPU
                process can deallocate it across remounts). 2D / Map / Relief
                are conditionally rendered — they don't carry a WebGL context
                that needs preserving (2D uses React Flow), so paying first-
                switch chunk-load latency once is cheaper than running their
                layout sims on every page launch. */}
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
            {viewMode === "2d" && (
              <div className="absolute inset-0" style={{ zIndex: 1 }}>
                <CausalDAG2D />
              </div>
            )}
            {viewMode === "map" && (
              <div className="absolute inset-0" style={{ zIndex: 1 }}>
                <CausalDAGMap />
              </div>
            )}
            {viewMode === "relief" && (
              <div className="absolute inset-0" style={{ zIndex: 1 }}>
                <CausalDAGRelief />
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
