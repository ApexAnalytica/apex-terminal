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
    title: "WELCOME TO APEX",
    description:
      "APEX Analytica is a causal-inference workbench for discovering, verifying, and stress-testing causal graphs. This tour highlights the key regions of the interface.",
    tooltipPosition: "center",
  },
  {
    id: "module-tabs",
    targetSelector: '[data-tour="module-tabs"]',
    title: "MODULE TABS",
    description:
      "Switch between the four analysis engines: Spirtes (structure discovery), Tarski (truth verification), Pearl (counterfactuals), and Pareto (criticality warnings).",
    tooltipPosition: "bottom",
  },
  {
    id: "spirtes-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "SPIRTES ENGINE",
    description:
      "The Spirtes Engine runs structural causal discovery. The header shows the spectral radius (\u03BB_max) \u2014 values below 1.0 mean the cascade is stable. Below it, the Trinity panel displays three algorithm sub-graphs.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("spirtes"),
  },
  {
    id: "spirtes-graphs",
    targetSelector: '[data-tour="module-panel"]',
    title: "TRINITY SUB-GRAPHS",
    description:
      "DCD/NOTEARS discovers nonlinear structure \u2014 nodes arranged in a circle with directed arrows showing causal flow. PCMCI+ reveals temporal lags \u2014 nodes laid out in T\u20112/T\u20111/T\u20110 columns showing how effects propagate over time. FCI detects hidden confounders \u2014 dashed red edges with \u2018?\u2019 markers flag latent common causes.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("spirtes"),
  },
  {
    id: "tarski-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "TARSKI ENGINE",
    description:
      "The Tarski Engine verifies the DAG against physical and regulatory axioms. Toggle RAW/VERIFIED to see which edges fail. The axiom library has 3 levels: L0 (physics \u2014 immutable), L1 (regulatory \u2014 red alert), L2 (heuristic \u2014 anomaly flags). In VERIFIED mode, proof traces show which axioms each edge violated and the solver used.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("tarski"),
  },
  {
    id: "pearl-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "PEARL ENGINE",
    description:
      "The Pearl Engine enables counterfactual reasoning via do-calculus. Intervention Controls let you select a do(X) target node. The scissors tool severs causal links. Ablation removes nodes/edges and replays the cascade to compare. Network Interdiction runs minimax optimization to find the best edges to cut for minimal damage.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pearl"),
  },
  {
    id: "pareto-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "PARETO ENGINE",
    description:
      "The Pareto Engine monitors tail risk. The Doomsday Clock shows T-days until system failure, regime type, and dragon king probability. The \u03A9-Fragility Assessment tracks buffer depletion. Below, the top critical nodes are ranked by \u03A9 score. Use the Shock Injector to stress-test with preset scenarios like Taiwan Blockade or Carrington Event.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "cd-omega",
    targetSelector: '[data-tour="cd-omega"]',
    title: "CD\u03A9 MONITOR",
    description:
      "The Causal Distance Omega monitor tracks system-wide robustness in real time. Watch the buffer level and status indicators as shocks propagate.",
    tooltipPosition: "bottom",
  },
  {
    id: "dag-canvas",
    targetSelector: '[data-tour="dag-canvas"]',
    title: "CAUSAL DAG",
    description:
      "The 3D directed acyclic graph visualizes causal relationships between variables. Click nodes to inspect, drag to rotate, scroll to zoom.",
    tooltipPosition: "top",
  },
  {
    id: "system-copilot",
    targetSelector: '[data-tour="system-copilot"]',
    title: "SYSTEM COPILOT",
    description:
      "The AI copilot answers questions about your causal graph, explains rejections, and runs analyses. Type queries or use the action buttons.",
    tooltipPosition: "right",
  },
  {
    id: "action-buttons",
    targetSelector: '[data-tour="action-buttons"]',
    title: "ACTION BUTTONS",
    description:
      "Quick-launch common analyses: Discover Structure runs causal discovery, Explain Rejection interprets failed edges, and Verify Logic checks axiom consistency.",
    tooltipPosition: "right",
  },
  {
    id: "compute-button",
    targetSelector: '[data-tour="action-buttons"]',
    title: "COMPUTE WITH CLAUDE",
    description:
      "Compute with Claude generates a System State Snapshot \u2014 a structured analysis of the entire graph. Claude handles computation; Gemini reads the results to answer your questions. If no Claude key is set, a local snapshot is computed instead.",
    tooltipPosition: "right",
  },
  {
    id: "risk-flow",
    targetSelector: '[data-tour="risk-flow"]',
    title: "RISK PROPAGATION",
    description:
      "Risk cards show per-node vulnerability scores. Click a card to focus the DAG on that node and see its causal neighborhood.",
    tooltipPosition: "top",
  },
  {
    id: "module-panel",
    targetSelector: '[data-tour="module-panel"]',
    title: "MODULE PANEL",
    description:
      "This panel changes based on the active module. You\u2019ve now seen all four.",
    tooltipPosition: "left",
  },
  {
    id: "import-button",
    targetSelector: '[data-tour="import-button"]',
    title: "IMPORT DATA",
    description:
      "Import your own datasets (CSV, JSON, or adjacency matrices) to build custom causal graphs and run analyses on your data.",
    tooltipPosition: "bottom",
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
