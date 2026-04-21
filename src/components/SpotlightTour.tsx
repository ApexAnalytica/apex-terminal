"use client";

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";

interface TourStep {
  id: string;
  targetSelector: string | null;
  title: string;
  description: string;
  tooltipPosition: "top" | "bottom" | "left" | "right" | "center";
  onEnter?: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    targetSelector: null,
    title: "WELCOME TO MANIFOLD",
    description:
      "APEX Analytica MANIFOLD is a causal-inference platform for discovering, verifying, and stress-testing causal networks across multiple domains. It combines four analysis engines with an AI copilot, 3D graph visualization, and real-time criticality monitoring. This tour will walk you through every feature.",
    tooltipPosition: "center",
  },
  {
    id: "domain-selection",
    targetSelector: '[data-tour="module-tabs"]',
    title: "DOMAIN SELECTION",
    description:
      "Start by selecting your analysis domains. Click the domain selector to choose from categories like Saudi Aramco Energy, QatarEnergy LNG, QAFCO Fertilizer, Ma\u2019aden Phosphate, and more. You can select as many domains as you want \u2014 the platform builds cross-domain causal connections automatically, letting you compare risks across completely different sectors.",
    tooltipPosition: "bottom",
  },
  {
    id: "module-tabs",
    targetSelector: '[data-tour="module-tabs"]',
    title: "ENGINE TABS",
    description:
      "Four analysis engines power the platform. SPIRTES discovers causal structure from data. TARSKI verifies edges against physical laws. PEARL runs counterfactual interventions (do-calculus). PARETO monitors tail risk and criticality horizons. Click any tab to switch \u2014 the right panel updates to show that engine\u2019s controls.",
    tooltipPosition: "bottom",
  },
  {
    id: "dag-canvas",
    targetSelector: '[data-tour="dag-canvas"]',
    title: "CAUSAL NETWORK \u2014 2D & 3D",
    description:
      "The central canvas renders the causal directed acyclic graph. Toggle between 2D (flat layout with animated causal flow) and 3D (WebGL with orbit controls). In 3D: drag to rotate, scroll to zoom, click nodes to inspect. Directed edges show arrows; dashed lines indicate confounded relationships. Node size and color intensity reflect \u03A9-Fragility scores \u2014 hotter colors mean higher systemic risk.",
    tooltipPosition: "top",
  },
  {
    id: "node-inspection",
    targetSelector: '[data-tour="module-panel"]',
    title: "NODE INSPECTOR",
    description:
      "Click any node to open the Node Inspector in the right panel. It shows the node\u2019s \u03A9-Fragility composite score (0\u201310) broken into five pillars: Irreplaceability, Restoration Latency, Jurisdictional Hazard, Cascade Load, and Tail Depth. Each pillar is expandable with a detailed explanation, formula, and physical constraint. Connected edges are listed below with causal mechanisms.",
    tooltipPosition: "left",
  },
  {
    id: "spirtes-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "SPIRTES ENGINE \u2014 STRUCTURE DISCOVERY",
    description:
      "The Spirtes Engine runs three causal discovery algorithms in parallel. The cascade header shows spectral radius (\u03BBmax) \u2014 when below 1.0 the network is stable. The Trinity panel renders three sub-graphs: DCD/NOTEARS (nonlinear structure in circular layout), PCMCI+ (temporal lags across T-2/T-1/T-0 columns), and FCI (hidden confounder detection with dashed edges and \u2018?\u2019 markers for latent causes).",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("spirtes"),
  },
  {
    id: "tarski-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "TARSKI ENGINE \u2014 CONSTRAINT VERIFICATION",
    description:
      "The Tarski Engine verifies your causal graph against domain-aware physical and regulatory constraints. Constraints are automatically ranked by relevance to your selected domains \u2014 energy chokepoints surface for energy domains, jurisdictional checks for sovereign risk, etc. Toggle individual constraints on/off, then hit VERIFY to run. Three tiers: PHYSICAL (immutable laws), REGULATORY (sanctions, export controls), and HEURISTIC (anomaly flags). Results show exactly which edges violated which constraints, with clickable proof traces.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("tarski"),
  },
  {
    id: "pearl-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "PEARL ENGINE \u2014 COUNTERFACTUAL ANALYSIS",
    description:
      "The Pearl Engine implements do-calculus for structural interventions. Select a do(X) target node to isolate it from upstream causes. Use the scissors tool to sever individual causal links. The Ablation panel lets you remove nodes or edges and replay the cascade to compare baseline vs. intervention outcomes. Network Interdiction runs minimax optimization to identify the most cost-effective edges to cut for maximum damage reduction.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pearl"),
  },
  {
    id: "pareto-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "PARETO ENGINE \u2014 CRITICALITY HORIZONS",
    description:
      "The Pareto Engine tracks three independent criticality measures. CSD (Critical Slowing Down) monitors recovery rate decay via spectral radius \u2014 as \u03BBmax approaches 1.0, the system loses its ability to absorb shocks. PH (Persistent Homology) sweeps a filtration to detect topological fragility holes. LPPLS (Log-Periodic Power Law Singularity) fits the Sornette crash prediction model. Each shows a T-N epoch countdown with confidence scores.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "pareto-charts",
    targetSelector: '[data-tour="module-panel"]',
    title: "INTERACTIVE CRITICALITY CHARTS",
    description:
      "Expand any criticality card to see its temporal signal chart. Hover to see exact values at each timestep (observed data as solid line, model fit as dashed line). Click \u201C\u25C0 expand panel\u201D to widen the right panel for a larger, more legible chart view. The expanded chart shows observed vs. model values and the residual. Each card also shows model confidence, methodology, formula, and current assessment.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "pareto-shocks",
    targetSelector: '[data-tour="module-panel"]',
    title: "SHOCK INJECTION & TOP CRITICAL NODES",
    description:
      "Below the criticality horizons, the \u03A9-Fragility Assessment shows the system\u2019s buffer (NOMINAL/ELEVATED/CRITICAL/OMEGA_BREACH). The top 8 most critical nodes are ranked by \u03A9-score \u2014 click any to select it in the graph. The Scenario Injector lets you stress-test with preset shocks: Strait of Hormuz Closure, Abqaiq Processing Attack, Ras Laffan LNG Train Outage, and more. Each shock has a calibrated severity that depletes the \u03A9-buffer.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "cd-omega",
    targetSelector: '[data-tour="cd-omega"]',
    title: "CD\u03A9 DOOMSDAY MONITOR",
    description:
      "The Causal Distance Omega monitor is always visible in the header. The segmented buffer bar shows depletion (green \u2192 amber \u2192 red). It displays: time-to-failure (T-Nd), regime type (STABLE, MELT_UP, CRASH, PHASE_TRANSITION, STAGNATION), and Dragon King probability. The bar flashes when the system enters OMEGA_BREACH. Active shock count is shown alongside the alert level indicator.",
    tooltipPosition: "bottom",
  },
  {
    id: "system-copilot",
    targetSelector: '[data-tour="system-copilot"]',
    title: "AI SYSTEM COPILOT",
    description:
      "The left panel is your AI copilot powered by Gemini. Type questions about the network, ask for explanations, or request analysis. The copilot has full context of the graph structure, active shocks, and engine outputs. It supports voice input (microphone icon) and voice output (speaker icon \u2014 reads responses aloud). Action buttons provide one-click analysis: Discover Structure, Explain Rejection, Verify Logic.",
    tooltipPosition: "right",
  },
  {
    id: "voice-features",
    targetSelector: '[data-tour="system-copilot"]',
    title: "VOICE I/O & CLICK-TO-SPEAK",
    description:
      "Enable the speaker icon (\uD83D\uDD0A) for voice output \u2014 the copilot will read all responses aloud in a Jarvis-style voice. Use the microphone icon (\uD83C\uDF99\uFE0F) for voice input \u2014 speak your query instead of typing. Additionally, click any explanation text in the Node Inspector or Module Panel to have it rendered in the copilot and spoken aloud. This lets you click around the interface and have every detail explained audibly.",
    tooltipPosition: "right",
  },
  {
    id: "compute-button",
    targetSelector: '[data-tour="action-buttons"]',
    title: "COMPUTE WITH CLAUDE",
    description:
      "The COMPUTE WITH CLAUDE button generates a comprehensive System State Snapshot \u2014 a structured analysis of all nodes, edges, engine outputs, and criticality metrics. Claude performs the deep computation; Gemini reads the results to answer follow-up questions. If no Claude API key is configured, a local snapshot is computed from the graph structure. Snapshots are shown as a status badge in the copilot.",
    tooltipPosition: "right",
  },
  {
    id: "time-dial",
    targetSelector: '[data-tour="risk-flow"]',
    title: "TIME DIAL & CASCADE REPLAY",
    description:
      "The timeline scrubber at the bottom controls cascade replay. After injecting shocks and running a cascade simulation, drag the dial to scrub through epochs \u2014 watch nodes activate, edges propagate, and the \u03A9-buffer deplete in real time. Switch between baseline and intervention timelines to compare outcomes. Use keyboard arrows for fine control, or let it auto-play.",
    tooltipPosition: "top",
  },
  {
    id: "risk-flow",
    targetSelector: '[data-tour="risk-flow"]',
    title: "RISK PROPAGATION CARDS",
    description:
      "The risk card strip shows per-node vulnerability scores in a scrollable horizontal band. Cards are color-coded by severity. Click any card to select that node in the DAG and open its inspector. During cascade replay, cards update in real time to reflect shock propagation.",
    tooltipPosition: "top",
  },
  {
    id: "view-toggle",
    targetSelector: '[data-tour="module-tabs"]',
    title: "2D / 3D VIEW TOGGLE",
    description:
      "Switch between 2D and 3D graph views using the toggle in the header. Both views stay mounted to prevent WebGL context loss. In 2D, directed edges show animated dashes for one-way causal flow. In 3D, arrows appear only on directed/temporal edges. Node positioning is consistent across both views. Shift+drag to box-select multiple nodes for subgraph analysis.",
    tooltipPosition: "bottom",
  },
  {
    id: "import-button",
    targetSelector: '[data-tour="import-button"]',
    title: "IMPORT YOUR OWN DATA",
    description:
      "Import custom datasets via CSV, JSON, or adjacency matrices to build your own causal graphs. The platform auto-detects format and maps your data into the \u03A9-Fragility framework. All four engines \u2014 structure discovery, truth verification, counterfactual analysis, and criticality monitoring \u2014 work on imported data just as they do on the built-in domains.",
    tooltipPosition: "bottom",
  },
  {
    id: "finish",
    targetSelector: null,
    title: "YOU\u2019RE READY",
    description:
      "You\u2019ve seen every major feature. Start by selecting domains, exploring nodes in the 3D graph, and running analyses with the AI copilot. Inject shocks to stress-test, use Pearl for counterfactual reasoning, and monitor the criticality horizons in real time. Click the \u201C?\u201D button anytime to relaunch this tour. For voice interaction, enable the speaker and microphone icons in the copilot.",
    tooltipPosition: "center",
  },
];

const PADDING = 8;
const GAP = 16;

interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOOLTIP_WIDTH = 320; // w-80
const VIEWPORT_MARGIN = 12;

function computeTooltipPosition(
  cutout: CutoutRect | null,
  position: TourStep["tooltipPosition"],
  tooltipHeight: number
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const th = tooltipHeight || 200; // fallback estimate before first measure

  if (!cutout || position === "center") {
    return {
      top: (vh - th) / 2,
      left: (vw - TOOLTIP_WIDTH) / 2,
    };
  }

  let top = 0;
  let left = 0;

  switch (position) {
    case "bottom":
      top = cutout.y + cutout.height + GAP;
      left = cutout.x + cutout.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "top":
      top = cutout.y - GAP - th;
      left = cutout.x + cutout.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "left":
      top = cutout.y + cutout.height / 2 - th / 2;
      left = cutout.x - GAP - TOOLTIP_WIDTH;
      break;
    case "right":
      top = cutout.y + cutout.height / 2 - th / 2;
      left = cutout.x + cutout.width + GAP;
      break;
  }

  // Clamp to viewport
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - th - VIEWPORT_MARGIN));
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - TOOLTIP_WIDTH - VIEWPORT_MARGIN));

  return { top, left };
}

export default function SpotlightTour() {
  const tourActive = useApexStore((s) => s.tourActive);
  const tourStep = useApexStore((s) => s.tourStep);
  const setTourActive = useApexStore((s) => s.setTourActive);
  const setTourStep = useApexStore((s) => s.setTourStep);

  const [cutout, setCutout] = useState<CutoutRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipHeightRef = useRef(200);
  const preTourModuleRef = useRef<string | null>(null);

  const step = TOUR_STEPS[tourStep];
  const isFirst = tourStep === 0;
  const isLast = tourStep === TOUR_STEPS.length - 1;

  const measureTarget = useCallback(() => {
    if (!step?.targetSelector) {
      setCutout(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setCutout(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setCutout({
      x: rect.x - PADDING,
      y: rect.y - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    });
  }, [step]);

  const updatePositions = useCallback(() => {
    measureTarget();
  }, [measureTarget]);

  // Save pre-tour module on tour start
  useEffect(() => {
    if (tourActive) {
      preTourModuleRef.current = useApexStore.getState().activeModule;
    }
  }, [tourActive]);

  // Call onEnter when step changes
  useEffect(() => {
    if (!tourActive || !step) return;
    step.onEnter?.();
  }, [tourActive, tourStep, step]);

  useEffect(() => {
    if (!tourActive) return;
    updatePositions();
    window.addEventListener("resize", updatePositions);
    return () => window.removeEventListener("resize", updatePositions);
  }, [tourActive, tourStep, updatePositions]);

  // Recompute tooltip position when cutout or step changes
  useLayoutEffect(() => {
    if (!tourActive || !step) return;
    // Measure tooltip height from ref if available
    if (tooltipRef.current) {
      tooltipHeightRef.current = tooltipRef.current.offsetHeight;
    }
    setTooltipPos(computeTooltipPosition(cutout, step.tooltipPosition, tooltipHeightRef.current));
  }, [tourActive, step, cutout]);

  // Re-clamp after tooltip renders (height may change per step)
  useEffect(() => {
    if (!tourActive || !step || !tooltipRef.current) return;
    const measured = tooltipRef.current.offsetHeight;
    if (measured !== tooltipHeightRef.current) {
      tooltipHeightRef.current = measured;
      setTooltipPos(computeTooltipPosition(cutout, step.tooltipPosition, measured));
    }
  });

  const close = useCallback(() => {
    if (preTourModuleRef.current) {
      useApexStore.getState().setActiveModule(preTourModuleRef.current as "spirtes" | "tarski" | "pearl" | "pareto");
    }
    setTourActive(false);
  }, [setTourActive]);

  const next = useCallback(() => {
    if (isLast) {
      close();
    } else {
      setTourStep(tourStep + 1);
    }
  }, [isLast, close, setTourStep, tourStep]);

  const back = useCallback(() => {
    if (!isFirst) setTourStep(tourStep - 1);
  }, [isFirst, setTourStep, tourStep]);

  // Keyboard navigation
  useEffect(() => {
    if (!tourActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tourActive, close, next, back]);

  if (!tourActive || !step) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60]" style={{ pointerEvents: "auto" }}>
        {/* SVG overlay with mask cutout */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {cutout && (
                <motion.rect
                  x={cutout.x}
                  y={cutout.y}
                  width={cutout.width}
                  height={cutout.height}
                  rx={6}
                  fill="black"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  key={step.id}
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Click-blocker on dimmed area (clicking closes tour) */}
        <div className="absolute inset-0" onClick={close} />

        {/* Tooltip card */}
        <motion.div
          ref={tooltipRef}
          key={step.id}
          className="w-80 rounded-lg border border-border bg-surface-elevated p-4 shadow-2xl"
          style={{
            position: "absolute",
            top: tooltipPos.top,
            left: tooltipPos.left,
            zIndex: 61,
            pointerEvents: "auto",
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Step counter */}
          <div className="text-[9px] font-mono tracking-wider text-text-muted mb-2">
            {tourStep + 1} OF {TOUR_STEPS.length}
          </div>

          {/* Title */}
          <h3 className="font-[family-name:var(--font-michroma)] text-sm tracking-wider text-accent-cyan mb-2">
            {step.title}
          </h3>

          {/* Description */}
          <p className="text-[11px] font-mono leading-relaxed text-text-muted mb-4">
            {step.description}
          </p>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={close}
              className="text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground transition-colors"
            >
              SKIP TOUR
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={back}
                  className="px-3 py-1.5 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  BACK
                </button>
              )}
              <button
                onClick={next}
                className="px-3 py-1.5 rounded border border-accent-cyan/40 bg-accent-cyan/10 text-[9px] font-mono tracking-wider text-accent-cyan hover:bg-accent-cyan/20 transition-colors"
              >
                {isLast ? "FINISH" : "NEXT"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
