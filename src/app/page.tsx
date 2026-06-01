"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useApexStore } from "@/stores/useApexStore";
import { protectGraphData } from "@/lib/data-protection";
import { useFeedRegistry } from "@/hooks/useFeedRegistry";
import { mark, measureBetween } from "@/lib/perf/instrument";

// Earliest mark on the launch path — fires when this module is
// evaluated (before any React render). Paired with "launch:firstFrame"
// emitted from the first canvas's onCreated to give a real
// page-load-to-pixels number in __manifoldPerf.
mark("launch:moduleLoad");
import HeaderBar from "@/components/HeaderBar";
import StructuralMetrics from "@/components/StructuralMetrics";
import FeedbackWidget from "@/components/FeedbackWidget";

// SystemCopilot pulls a heavy dep tree on its static-import chain:
// copilot-actions → tools.ts → tarski-data (891 LOC) + (lazy-imported
// since this change) the four large graph-data modules; copilot-engine
// + copilot-context also pull AXIOM_LIBRARY at their top level. Roughly
// 1-2 KLOC of axiom text + 6-7 KLOC of graph-data definitions used to
// land in the initial-paint bundle just because the left-column copilot
// panel is statically imported. Lazy-loading the whole copilot column
// punts that entire chain into its own chunk; the column shows a small
// "loading copilot…" placeholder for ~50-100ms after first paint, then
// the chat surface mounts.
const SystemCopilot = dynamic(
  () => import("@/components/SystemCopilot"),
  {
    ssr: false,
    loading: () => (
      <aside className="w-[340px] border-r border-border bg-surface flex items-start px-4 pt-4">
        <div className="text-[10px] font-mono text-text-muted/60 animate-pulse">
          LOADING COPILOT…
        </div>
      </aside>
    ),
  },
);

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

// ΩF Time Series dock (watchlist + comparison chart, ~1000 LOC + the
// folded-in discovery logic). Deferred until a workspace is loaded
// (`hasGraph`); the empty splash has nothing to chart. This single dock
// replaces the former RiskPropagationFlow strip + pinned-overlay pair.
const TimeSeriesOverlay = dynamic(
  () => import("@/components/TimeSeriesOverlay"),
  { ssr: false }
);

// ModulePanel (842 LOC + DiscoveryRunsPanel 523 + community-detection
// 209 + discovery-uncertainty 106 + omega-engine 180 in transitive
// chain) is the right pane. Visible on first paint but mostly empty
// while the user is still in the DomainSelector modal — defer the
// chunk with a placeholder matching the panel's fixed-width column.
const ModulePanel = dynamic(() => import("@/components/ModulePanel"), {
  ssr: false,
  loading: () => (
    <aside className="flex flex-col border-l border-border bg-surface h-full overflow-hidden" style={{ width: 320, minWidth: 320 }}>
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="text-[10px] font-mono text-text-muted/60 animate-pulse">
          LOADING MODULES…
        </div>
      </div>
    </aside>
  ),
});

// TimeDial is the largest single static-imported component on the
// critical path (1207 LOC). It IS visible on first paint (timeline
// scrubber at the bottom) but the canvas above is the user's focus,
// and the dial can land ~50-100ms later without breaking flow. A
// static placeholder matches the dial's geometry so the layout
// doesn't jump when the real chunk lands.
const TimeDial = dynamic(() => import("@/components/TimeDial"), {
  ssr: false,
  loading: () => (
    <div className="relative flex items-center gap-3 px-4 py-2 border-t border-border bg-surface-elevated/90 backdrop-blur-sm h-[72px]">
      <div className="text-[8px] font-mono text-text-muted/60 animate-pulse">
        LOADING TIMELINE…
      </div>
    </div>
  ),
});

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
  // Gate to defer the ΩF Time Series dock chunk until a graph is loaded.
  // An empty workspace has nothing to watch, suggest, or chart.
  const hasGraph = useApexStore((s) => s.graphData.nodes.length > 0);

  // App-wide hydration of persisted user state. Non-graph-dependent
  // entries (axioms, snapshot history) run once on mount; severed
  // edges wait for the graph so the prune-to-valid-ids step has
  // something to match against. The ref-guard prevents a re-hydration
  // if hasGraph ever flips false→true again (e.g. workspace reset).
  const hydrateEnabledAxioms = useApexStore((s) => s.hydrateEnabledAxioms);
  const hydrateSnapshotHistory = useApexStore(
    (s) => s.hydrateSnapshotHistory,
  );
  const hydrateSeveredEdges = useApexStore((s) => s.hydrateSeveredEdges);
  const hydrateUserPrefs = useApexStore((s) => s.hydrateUserPrefs);
  useEffect(() => {
    hydrateEnabledAxioms();
    hydrateSnapshotHistory();
    hydrateUserPrefs();
  }, [hydrateEnabledAxioms, hydrateSnapshotHistory, hydrateUserPrefs]);
  const severedHydratedRef = useRef(false);
  useEffect(() => {
    if (!hasGraph || severedHydratedRef.current) return;
    severedHydratedRef.current = true;
    hydrateSeveredEdges();
  }, [hasGraph, hydrateSeveredEdges]);

  // View-switch instrumentation. setViewMode in the store stamps a
  // "view-switch:start:{mode}" mark; this effect closes the loop on
  // the next paint after the new view commits. rAF gives a real
  // "switch felt complete" number — measuring just the React commit
  // skips browser layout / paint cost which is where the user-felt
  // latency actually lives. Skips the initial mount: no setViewMode
  // call was made, so there's no matching start mark to measure from.
  const viewMountedRef = useRef(false);
  useEffect(() => {
    if (!viewMountedRef.current) {
      viewMountedRef.current = true;
      return;
    }
    const startMark = `view-switch:start:${viewMode}`;
    requestAnimationFrame(() => {
      const endMark = `view-switch:end:${viewMode}:${performance.now()}`;
      mark(endMark);
      measureBetween("view-switch", startMark, endMark);
    });
  }, [viewMode]);

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
            {/* The bottom-right CLIENT DEPLOYMENT → /client CTA was removed.
                It pointed at an Athena Defense sandbox that had drifted out
                of date and read as a stray promo on a workspace canvas the
                user is actively analysing. The /client route itself still
                exists for direct access; surfacing a sandbox at all (and in
                what shape) is a UX decision we'll revisit separately. */}
          </div>

          {/* ΩF Time Series dock — consolidated watchlist + comparison
              chart (replaces the old separate risk-card strip and the
              pinned-comparison overlay). Gated on workspace load: the
              empty graph has nothing to watch or chart. The left rail
              surfaces suggestions so the panel is useful before anything
              is pinned. */}
          {hasGraph && <TimeSeriesOverlay />}

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
