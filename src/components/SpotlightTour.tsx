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
    id: "welcome-and-domain",
    targetSelector: '[data-tour="domain-selector-modal"]',
    title: "WELCOME \u2014 PICK A DOMAIN",
    description:
      "Welcome to APEX Analytica MANIFOLD \u2014 a causal-inference platform for discovering, verifying, and stress-testing networks across sectors. Everything starts here with a domain. Use the selector on the left to pick one or more: Financial, Macro, Geopolitical, Scientist (including Type-1 Diabetes \u03B2-cell dynamics), or Cross-Domain. Pick what fits your analysis, confirm, and the tour will continue on the platform. You can relaunch this tour anytime from the \u201C?\u201D in the top-right.",
    tooltipPosition: "right",
  },
  {
    id: "module-tabs",
    targetSelector: '[data-tour="module-tabs"]',
    title: "FOUR ANALYSIS ENGINES",
    description:
      "The four engine tabs drive the right-hand panel. SPIRTES discovers causal structure from data. TARSKI verifies edges against physical, regulatory, and heuristic constraints. PEARL runs do-calculus interventions and network interdiction. PARETO monitors tail risk and criticality horizons. Switching tabs updates the right panel \u2014 the graph stays put.",
    tooltipPosition: "bottom",
  },
  {
    id: "dag-canvas",
    targetSelector: '[data-tour="dag-canvas"]',
    title: "CAUSAL NETWORK CANVAS",
    description:
      "The center canvas renders your causal DAG. Node size and color intensity encode \u03A9-Fragility \u2014 hotter means more systemic risk. Solid arrows are directed causal edges; dashed lines are confounded or latent relationships. In 3D: drag to orbit, scroll to zoom. Click any node to open the inspector on the right. Shift+drag for box-select when you need a subgraph.",
    tooltipPosition: "top",
  },
  {
    id: "view-modes",
    targetSelector: '[data-tour="dag-canvas"]',
    title: "3D / 2D / MAP VIEWS",
    description:
      "Top-right of the canvas: three view-mode buttons. 3D (WebGL force-directed, the default), 2D (flat React Flow layout with animated causal flow), and MAP (geographic projection on MapLibre for domains with real-world coordinates, e.g. energy infrastructure). All three stay mounted to preserve WebGL context; you can flip between them without losing state.",
    tooltipPosition: "top",
  },
  {
    id: "node-inspection",
    targetSelector: '[data-tour="module-panel"]',
    title: "NODE INSPECTOR & \u03A9 PILLARS",
    description:
      "Click any node to open the Node Inspector in the right panel. It shows the node\u2019s \u03A9-Fragility composite score (0\u201310) broken into five pillars: Irreplaceability, Restoration Latency, Jurisdictional Hazard, Cascade Load, and Tail Depth. Each pillar is expandable with a detailed explanation, formula, and physical constraint. Connected edges are listed below with causal mechanisms.",
    tooltipPosition: "left",
  },
  {
    id: "spirtes-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "SPIRTES \u2014 STRUCTURE DISCOVERY",
    description:
      "SPIRTES runs three causal-discovery algorithms in parallel. DCD/NOTEARS for nonlinear structure, PCMCI+ for time-lagged effects across T-2/T-1/T-0 columns, and FCI for hidden-confounder detection (dashed edges with \u2018?\u2019 markers mean a latent common cause). The cascade header shows spectral radius \u03BBmax \u2014 below 1.0 the network is contractive and stable.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("spirtes"),
  },
  {
    id: "tarski-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "TARSKI \u2014 CONSTRAINT VERIFICATION",
    description:
      "TARSKI audits every edge against domain-aware axioms in three tiers: PHYSICAL (immutable laws), REGULATORY (sanctions, export controls, treaties), and HEURISTIC (anomaly flags). Constraints are auto-ranked by relevance to your active domains. Toggle any axiom, hit VERIFY, and the canvas recolors \u2014 violating edges turn red, with clickable proof traces explaining which constraint failed.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("tarski"),
  },
  {
    id: "pearl-interventions",
    targetSelector: '[data-tour="module-panel"]',
    title: "PEARL \u2014 DO-CALCULUS & ABLATIONS",
    description:
      "PEARL implements structural interventions. Select a do(X) target to isolate a node from its causes. Use SEVER to cut individual edges (they go amber \u2014 functionally removed but physically possible) or ABLATE to delete nodes/edges entirely. Run an intervention cascade and the Time Dial gains a second timeline so you can compare baseline vs. counterfactual outcomes side-by-side.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pearl"),
  },
  {
    id: "pearl-interdiction",
    targetSelector: '[data-tour="module-panel"]',
    title: "CASCADE DEFENSE \u2014 AUTO-INTERDICTION",
    description:
      "Below the manual tools: CASCADE DEFENSE runs minimax optimization to find the cheapest set of edges whose removal maximally reduces downstream cascade damage. When an attacker-defender min-cut is solvable, you get explicit SEVER / ABLATE buttons per recommended cut. When it isn\u2019t, the panel falls back to a structural-vulnerability ranking of the next most brittle edges. Results auto-trigger a Monte Carlo forecast so you can see the expected damage distribution before committing.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pearl"),
  },
  {
    id: "pareto-deep",
    targetSelector: '[data-tour="module-panel"]',
    title: "PARETO \u2014 CRITICALITY HORIZONS",
    description:
      "PARETO tracks three independent criticality signals, each with its own T-N countdown and confidence. CSD (Critical Slowing Down) watches recovery-rate decay via \u03BBmax approaching 1.0. PH (Persistent Homology) sweeps a filtration for topological fragility holes. LPPLS (Log-Periodic Power Law Singularity) fits the Sornette crash model. Each card shows observed vs. model signal, formula, methodology, and current assessment.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "pareto-charts",
    targetSelector: '[data-tour="module-panel"]',
    title: "INTERACTIVE CRITICALITY CHARTS",
    description:
      "Expand any criticality card to see its temporal chart \u2014 observed values as a solid line, model fit dashed. Hover for exact values. Click \u201C\u25C0 expand panel\u201D to widen the right panel for a more legible chart, including the residual. Each card exposes its model confidence, methodology, formula, and live assessment in one place.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "pareto-shocks",
    targetSelector: '[data-tour="module-panel"]',
    title: "SHOCK INJECTION & TOP CRITICAL NODES",
    description:
      "Under the criticality cards: the \u03A9-Fragility Assessment summarizes the buffer state \u2014 NOMINAL, ELEVATED, CRITICAL, or OMEGA_BREACH. The top critical nodes are ranked by \u03A9-score; click one to select it in the graph. The Scenario Injector loads preset shocks calibrated for your active domain (Strait of Hormuz closure, Abqaiq attack, LNG train outage, insulin supply-chain disruption, etc.) and each one depletes the buffer according to its severity.",
    tooltipPosition: "left",
    onEnter: () => useApexStore.getState().setActiveModule("pareto"),
  },
  {
    id: "cd-omega",
    targetSelector: '[data-tour="cd-omega"]',
    title: "CD\u03A9 DOOMSDAY MONITOR",
    description:
      "The Causal-Distance-Omega monitor sits in the header, always on. The segmented bar shows buffer depletion (green \u2192 amber \u2192 red). It reports time-to-failure (T-Nd), regime classification (STABLE, MELT_UP, CRASH, PHASE_TRANSITION, STAGNATION), Dragon-King probability, and active-shock count. The bar flashes when the system enters OMEGA_BREACH \u2014 no matter which engine tab you\u2019re on.",
    tooltipPosition: "bottom",
  },
  {
    id: "system-copilot",
    targetSelector: '[data-tour="system-copilot"]',
    title: "AI SYSTEM COPILOT",
    description:
      "The left panel is your AI copilot. It has full context of the graph, active shocks, engine outputs, and recent interventions. Type questions, request explanations, or ask for analysis in plain language \u2014 the copilot responds with graph-grounded reasoning rather than generic prose. It also powers the click-to-speak behavior in the Node Inspector.",
    tooltipPosition: "right",
  },
  {
    id: "voice-features",
    targetSelector: '[data-tour="system-copilot"]',
    title: "VOICE I/O & CLICK-TO-SPEAK",
    description:
      "Turn on the speaker icon and the copilot reads every response aloud in a Jarvis-style voice. Turn on the microphone and you can dictate queries instead of typing. Separately, clicking any explanation text in the Node Inspector, pillar breakdowns, or constraint traces routes that text through the copilot and has it spoken aloud \u2014 useful for hands-free exploration.",
    tooltipPosition: "right",
  },
  {
    id: "compute-button",
    targetSelector: '[data-tour="action-buttons"]',
    title: "COMPUTE WITH CLAUDE",
    description:
      "COMPUTE WITH CLAUDE generates a full System State Snapshot \u2014 a structured digest of nodes, edges, engine outputs, and criticality metrics. Claude does the heavy computation; the copilot uses that snapshot as context for follow-up questions. If no Claude key is configured, a local snapshot is computed from graph structure instead. Snapshot status appears as a badge in the copilot header.",
    tooltipPosition: "right",
  },
  {
    id: "time-dial",
    targetSelector: '[data-tour="risk-flow"]',
    title: "TIME DIAL & CASCADE REPLAY",
    description:
      "The timeline scrubber at the bottom controls cascade replay. After injecting shocks or running an intervention, drag the dial to scrub epochs \u2014 watch nodes activate, edges propagate, and the \u03A9-buffer deplete step-by-step. When a counterfactual exists, the dial gains two timelines: BASELINE vs. INTERVENTION. Use arrow keys for fine control, or let it auto-play.",
    tooltipPosition: "top",
  },
  {
    id: "risk-flow",
    targetSelector: '[data-tour="risk-flow"]',
    title: "RISK PROPAGATION CARDS",
    description:
      "The horizontal card strip above the time dial shows per-node vulnerability scores in real time, color-coded by severity. Click any card to select that node and open its inspector. During cascade replay the cards update every epoch so you can watch which nodes light up first and how the shock spreads.",
    tooltipPosition: "top",
  },
  {
    id: "text-size-toggle",
    targetSelector: '[data-tour="text-size-toggle"]',
    title: "TEXT SIZE (S / M / L)",
    description:
      "Some analysts run Manifold on large displays or from a distance. Use the S / M / L toggle in the header to scale the entire UI up or down. Your choice persists across sessions \u2014 it\u2019s saved in local storage and applied before the page renders so there\u2019s no flash.",
    tooltipPosition: "bottom",
  },
  {
    id: "import-button",
    targetSelector: '[data-tour="import-button"]',
    title: "IMPORT YOUR OWN DATA",
    description:
      "Bring your own graph. IMPORT accepts CSV, JSON, or adjacency matrices; the platform auto-detects format and maps columns into the \u03A9-Fragility framework. All four engines \u2014 discovery, verification, counterfactual, criticality \u2014 work on imported graphs exactly as they do on built-in domains. Multiple datasets can coexist and merge via cross-domain edges.",
    tooltipPosition: "bottom",
  },
  {
    id: "feedback-widget",
    targetSelector: '[data-tour="feedback-widget"]',
    title: "FEEDBACK & FEATURE REQUESTS",
    description:
      "The floating pill in the bottom-right corner is your direct line to the team. File bugs, request features, or ask for new datasets \u2014 each category routes into our triage pipeline and becomes a tracked GitHub issue. If a feature request is approved it can be auto-implemented and shipped back to you as a PR. Use it liberally.",
    tooltipPosition: "left",
  },
  {
    id: "finish",
    targetSelector: null,
    title: "YOU\u2019RE READY",
    description:
      "You\u2019ve seen every major feature. Typical flow: pick a domain \u2192 explore nodes \u2192 run SPIRTES or TARSKI \u2192 inject a shock or run PEARL interdiction \u2192 watch the cascade on the time dial \u2192 monitor PARETO horizons. The \u201C?\u201D button in the top-right replays this tour at any time. If something feels missing or off, use the feedback widget \u2014 it goes straight to us.",
    tooltipPosition: "center",
  },
];

const PADDING = 8;
const GAP = 16;

// Bump this whenever the tour content changes substantially enough that
// already-onboarded users should see it again. Currently unused — the
// first-visit auto-launch only triggers when nothing has been stored yet.
const TOUR_STORAGE_KEY = "manifold:tour-seen";

interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOOLTIP_WIDTH = 320; // w-80
const VIEWPORT_MARGIN = 12;

function computeArrow(
  cutout: CutoutRect | null,
  position: TourStep["tooltipPosition"],
  tooltipTop: number,
  tooltipLeft: number,
  tooltipHeight: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (!cutout || position === "center") return null;
  const h = tooltipHeight || 200;
  const ttCenterX = tooltipLeft + TOOLTIP_WIDTH / 2;
  const ttCenterY = tooltipTop + h / 2;
  const cuCenterX = cutout.x + cutout.width / 2;
  const cuCenterY = cutout.y + cutout.height / 2;
  switch (position) {
    case "top":
      return {
        from: { x: ttCenterX, y: tooltipTop + h },
        to: { x: cuCenterX, y: cutout.y },
      };
    case "bottom":
      return {
        from: { x: ttCenterX, y: tooltipTop },
        to: { x: cuCenterX, y: cutout.y + cutout.height },
      };
    case "left":
      return {
        from: { x: tooltipLeft + TOOLTIP_WIDTH, y: ttCenterY },
        to: { x: cutout.x, y: cuCenterY },
      };
    case "right":
      return {
        from: { x: tooltipLeft, y: ttCenterY },
        to: { x: cutout.x + cutout.width, y: cuCenterY },
      };
  }
}

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
  const domainSelectorOpen = useApexStore((s) => s.domainSelectorOpen);
  const sawDomainSelectorRef = useRef(false);

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

  // First-visit auto-launch: open the tour exactly once per browser, keyed on
  // localStorage. Dismissing (SKIP / close / finish) sets the flag so it won't
  // trigger again. Users can still relaunch manually via the "?" button.
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!seen) {
        setTourActive(true);
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — skip auto-launch
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call onEnter when step changes
  useEffect(() => {
    if (!tourActive || !step) return;
    step.onEnter?.();
  }, [tourActive, tourStep, step]);

  // Auto-advance the welcome/domain step when the user closes the selector
  // (i.e. they've picked a domain and committed). Only fires if we observed
  // the modal open while on this step.
  useEffect(() => {
    if (!tourActive || step?.id !== "welcome-and-domain") {
      sawDomainSelectorRef.current = false;
      return;
    }
    if (domainSelectorOpen) {
      sawDomainSelectorRef.current = true;
      return;
    }
    if (sawDomainSelectorRef.current && !domainSelectorOpen) {
      sawDomainSelectorRef.current = false;
      setTourStep(tourStep + 1);
    }
  }, [tourActive, step, domainSelectorOpen, tourStep, setTourStep]);

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
    // Also close the domain-selector modal in case a tour step opened it
    useApexStore.getState().setDomainSelectorOpen(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // ignore
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

  const arrow = computeArrow(
    cutout,
    step.tooltipPosition,
    tooltipPos.top,
    tooltipPos.left,
    tooltipHeightRef.current,
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60]" style={{ pointerEvents: "auto" }}>
        {/* SVG overlay with mask cutout + connector arrow */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
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
            <marker
              id="spotlight-arrowhead"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-cyan, #00e5ff)" />
            </marker>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#spotlight-mask)"
          />
          {/* Highlight ring around cutout */}
          {cutout && (
            <motion.rect
              x={cutout.x}
              y={cutout.y}
              width={cutout.width}
              height={cutout.height}
              rx={6}
              fill="none"
              stroke="var(--accent-cyan, #00e5ff)"
              strokeWidth={1.5}
              strokeOpacity={0.85}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              key={`ring-${step.id}`}
            />
          )}
          {/* Connector arrow from tooltip edge to highlighted element */}
          {arrow && (
            <motion.line
              key={`arrow-${step.id}`}
              x1={arrow.from.x}
              y1={arrow.from.y}
              x2={arrow.to.x}
              y2={arrow.to.y}
              stroke="var(--accent-cyan, #00e5ff)"
              strokeWidth={1.5}
              strokeOpacity={0.9}
              strokeDasharray="4 3"
              markerEnd="url(#spotlight-arrowhead)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            />
          )}
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
