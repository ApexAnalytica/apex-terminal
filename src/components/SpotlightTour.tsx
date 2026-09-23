"use client";

import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import {
  TOUR_STEPS,
  FIRST_RUN_IDS,
  DEEP_DIVE_TRACKS,
  STEP_PADDING,
  DEFAULT_PADDING,
  resolveCopy,
  trackForPersona,
  type TourStep,
  type DeepDiveTrack,
} from "@/lib/tour-steps";
import { logTourEvent, newTourSessionId } from "@/lib/onboarding/metrics";
import TTSControls from "@/components/TTSControls";

// ─── Constants ──────────────────────────────────────────────────────────

const GAP = 16;
const TOUR_STORAGE_KEY = "manifold:tour-seen";
const TOOLTIP_WIDTH = 320; // w-80
const VIEWPORT_MARGIN = 12;

// Escalating-hint thresholds. After ESCALATE_1 ms with no interaction, the
// cutout starts a slow pulse. After ESCALATE_2 ms it pulses faster + stronger
// and the tooltip's hint goes bold. No skip button — the user can still bail
// from the whole tour via SKIP TOUR / Esc.
const ESCALATE_1_MS = 8000;
const ESCALATE_2_MS = 15000;

// After predicate flips true, hold the success state briefly so the user
// sees the "you did it" feedback before the step changes.
const SUCCESS_HOLD_MS = 400;

// ─── Geometry helpers ───────────────────────────────────────────────────

interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

function autoArrow(
  cutout: CutoutRect | null,
  tooltipTop: number,
  tooltipLeft: number,
  tooltipHeight: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (!cutout) return null;
  const h = tooltipHeight || 200;
  const ttCenterX = tooltipLeft + TOOLTIP_WIDTH / 2;
  const ttCenterY = tooltipTop + h / 2;
  const cuCenterX = cutout.x + cutout.width / 2;
  const cuCenterY = cutout.y + cutout.height / 2;
  const dx = cuCenterX - ttCenterX;
  const dy = cuCenterY - ttCenterY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        from: { x: tooltipLeft + TOOLTIP_WIDTH, y: ttCenterY },
        to: { x: cutout.x, y: cuCenterY },
      };
    }
    return {
      from: { x: tooltipLeft, y: ttCenterY },
      to: { x: cutout.x + cutout.width, y: cuCenterY },
    };
  }
  if (dy >= 0) {
    return {
      from: { x: ttCenterX, y: tooltipTop + h },
      to: { x: cuCenterX, y: cutout.y },
    };
  }
  return {
    from: { x: ttCenterX, y: tooltipTop },
    to: { x: cuCenterX, y: cutout.y + cutout.height },
  };
}

function computeTooltipPosition(
  cutout: CutoutRect | null,
  position: TourStep["tooltipPosition"],
  tooltipHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const th = tooltipHeight || 200;

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

  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - th - VIEWPORT_MARGIN));
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - TOOLTIP_WIDTH - VIEWPORT_MARGIN));

  return { top, left };
}

// ─── Component ──────────────────────────────────────────────────────────

type Mode = "first-run" | "deep-dive-menu" | DeepDiveTrack;

export default function SpotlightTour() {
  const tourActive = useApexStore((s) => s.tourActive);
  const tourStep = useApexStore((s) => s.tourStep);
  const setTourActive = useApexStore((s) => s.setTourActive);
  const setTourStep = useApexStore((s) => s.setTourStep);
  const domainSelectorOpen = useApexStore((s) => s.domainSelectorOpen);
  const setDomainSelectorOpen = useApexStore((s) => s.setDomainSelectorOpen);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const activePersona = useApexStore((s) => s.activePersona);
  const sawDomainSelectorRef = useRef(false);

  // Which step list is active. First-run by default; switches to a deep-dive
  // track when the user picks one from the menu after the first-run finish.
  const [mode, setMode] = useState<Mode>("first-run");

  const [cutout, setCutout] = useState<CutoutRect | null>(null);
  const [secondaryCutout, setSecondaryCutout] = useState<CutoutRect | null>(null);
  const [pulseCutout, setPulseCutout] = useState<CutoutRect | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [showDomainHint, setShowDomainHint] = useState(false);

  // Escalating-hint state. 0 = idle, 1 = soft pulse, 2 = strong pulse.
  const [escalation, setEscalation] = useState<0 | 1 | 2>(0);
  // Brief success state flashed before auto-advancing on a satisfied predicate.
  const [interactionSatisfied, setInteractionSatisfied] = useState(false);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipHeightRef = useRef(200);
  const preTourModuleRef = useRef<string | null>(null);

  // Telemetry. tourSessionId is a fresh uuid per tour-open, reused
  // across all events inside that open. tourSessionStartRef gives us
  // an elapsedMs base for funnel analysis. Both reset on the rising
  // edge of tourActive — see the effect a few blocks below.
  const tourSessionIdRef = useRef<string>("");
  const tourSessionStartRef = useRef<number>(0);

  const track = trackForPersona(activePersona);

  // Active step list driven by mode. Memoized so step indices stay stable.
  const currentSteps = useMemo<TourStep[]>(() => {
    if (mode === "first-run") return TOUR_STEPS.filter((s) => s.phase === "first-run");
    if (mode === "deep-dive-menu") return [];
    return TOUR_STEPS.filter(
      (s) => s.phase === "deep-dive" && s.deepDiveTrack === mode,
    );
  }, [mode]);

  const step = currentSteps[tourStep];
  const isMenu = mode === "deep-dive-menu";
  const isFirst = tourStep === 0;
  const isLast = currentSteps.length > 0 && tourStep === currentSteps.length - 1;

  // Reset escalation + success on every step change.
  useEffect(() => {
    setEscalation(0);
    setInteractionSatisfied(false);
  }, [step?.id]);

  // ─── Cutout measurement ──────────────────────────────────────────────

  const measureTarget = useCallback(() => {
    const pad = step ? STEP_PADDING[step.id] ?? DEFAULT_PADDING : DEFAULT_PADDING;
    const measure = (sel: string | null | undefined): CutoutRect | null => {
      if (!sel) return null;
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x - pad,
        y: rect.y - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      };
    };
    setCutout(measure(step?.targetSelector ?? null));
    setSecondaryCutout(measure(step?.secondaryTargetSelector));
    setPulseCutout(measure(step?.awaitInteraction?.pulseSelector ?? null));
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, [step]);

  const updatePositions = useCallback(() => {
    measureTarget();
  }, [measureTarget]);

  // Save pre-tour module on tour start so we can restore it on close.
  useEffect(() => {
    if (tourActive) {
      preTourModuleRef.current = useApexStore.getState().activeModule;
    }
  }, [tourActive]);

  // First-visit auto-launch: open the tour exactly once per browser, keyed
  // on localStorage. Dismissing sets the flag so it won't re-trigger.
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!seen) {
        setMode("first-run");
        setTourActive(true);
      }
    } catch {
      // localStorage unavailable
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the tour is re-opened externally (the "?" button), reset to first-run.
  // Without this, re-opening after a deep-dive ended in the same session would
  // start mid-track. Also fires the `tour_started` telemetry event and stamps
  // a fresh tourSessionId for downstream events to share.
  const prevActiveRef = useRef(tourActive);
  useEffect(() => {
    if (tourActive && !prevActiveRef.current) {
      setMode("first-run");
      setTourStep(0);
      tourSessionIdRef.current = newTourSessionId();
      tourSessionStartRef.current = Date.now();
      void logTourEvent({
        event: "tour_started",
        stepId: null,
        phase: "first-run",
        track,
        persona: activePersona ?? null,
        tourSessionId: tourSessionIdRef.current,
        elapsedMs: 0,
      });
    }
    prevActiveRef.current = tourActive;
  }, [tourActive, setTourStep, track, activePersona]);

  // Run a step's onEnter side effect (e.g. switch active module).
  useEffect(() => {
    if (!tourActive || !step) return;
    step.onEnter?.();
  }, [tourActive, tourStep, step]);

  // Welcome-step gating: auto-advance when the user closes the selector AFTER
  // picking a domain. If they close without picking, reopen so the tour stays
  // coherent.
  useEffect(() => {
    if (!tourActive || step?.id !== "welcome-and-domain") {
      sawDomainSelectorRef.current = false;
      return;
    }
    if (domainSelectorOpen) {
      sawDomainSelectorRef.current = true;
      return;
    }
    if (!sawDomainSelectorRef.current) return;
    if (selectedDomains.length > 0) {
      sawDomainSelectorRef.current = false;
      setTourStep(tourStep + 1);
    } else {
      setDomainSelectorOpen(true);
    }
  }, [
    tourActive,
    step,
    domainSelectorOpen,
    selectedDomains,
    tourStep,
    setTourStep,
    setDomainSelectorOpen,
  ]);

  useEffect(() => {
    if (step?.id !== "welcome-and-domain" || selectedDomains.length > 0) {
      setShowDomainHint(false);
    }
  }, [step, selectedDomains]);

  useEffect(() => {
    if (!tourActive) return;
    updatePositions();
    window.addEventListener("resize", updatePositions);
    return () => window.removeEventListener("resize", updatePositions);
  }, [tourActive, tourStep, updatePositions]);

  useLayoutEffect(() => {
    if (!tourActive || !step) return;
    if (tooltipRef.current) {
      tooltipHeightRef.current = tooltipRef.current.offsetHeight;
    }
    setTooltipPos(computeTooltipPosition(cutout, step.tooltipPosition, tooltipHeightRef.current));
  }, [tourActive, step, cutout]);

  useEffect(() => {
    if (!tourActive || !step || !tooltipRef.current) return;
    const measured = tooltipRef.current.offsetHeight;
    if (measured !== tooltipHeightRef.current) {
      tooltipHeightRef.current = measured;
      setTooltipPos(computeTooltipPosition(cutout, step.tooltipPosition, measured));
    }
  });

  // ─── Interactive-gate subscription ───────────────────────────────────

  const advance = useCallback(() => {
    if (currentSteps.length === 0) return;
    if (tourStep < currentSteps.length - 1) {
      setTourStep(tourStep + 1);
    }
  }, [currentSteps, tourStep, setTourStep]);

  // Subscribe to store changes; when the predicate is satisfied, flash success
  // and advance.
  useEffect(() => {
    if (!tourActive || !step?.awaitInteraction) return;
    const { predicate } = step.awaitInteraction;
    // Check immediately — the user may have already done it.
    if (predicate(useApexStore.getState())) {
      setInteractionSatisfied(true);
      const t = setTimeout(advance, SUCCESS_HOLD_MS);
      return () => clearTimeout(t);
    }
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useApexStore.subscribe((s) => {
      if (predicate(s) && !advanceTimer) {
        setInteractionSatisfied(true);
        advanceTimer = setTimeout(advance, SUCCESS_HOLD_MS);
      }
    });
    return () => {
      unsub();
      if (advanceTimer) clearTimeout(advanceTimer);
    };
  }, [tourActive, step, advance]);

  // Escalating-hint timers. Reset on step change; clear on satisfaction.
  useEffect(() => {
    if (!tourActive || !step?.awaitInteraction || interactionSatisfied) return;
    const t1 = setTimeout(() => setEscalation(1), ESCALATE_1_MS);
    const t2 = setTimeout(() => setEscalation(2), ESCALATE_2_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tourActive, step?.id, step?.awaitInteraction, interactionSatisfied]);

  // ─── Navigation ──────────────────────────────────────────────────────

  const close = useCallback(() => {
    // Fire BEFORE we wipe state so phase / step are still meaningful.
    if (tourSessionIdRef.current) {
      void logTourEvent({
        event: "tour_closed",
        stepId: step?.id ?? null,
        phase: mode === "first-run" ? "first-run" : mode === "deep-dive-menu" ? "menu" : "deep-dive",
        track:
          mode === "first-run"
            ? track
            : mode === "deep-dive-menu"
              ? null
              : (mode as DeepDiveTrack),
        persona: activePersona ?? null,
        tourSessionId: tourSessionIdRef.current,
        elapsedMs: Date.now() - tourSessionStartRef.current,
      });
    }
    if (preTourModuleRef.current) {
      useApexStore.getState().setActiveModule(preTourModuleRef.current as "spirtes" | "tarski" | "pearl" | "pareto");
    }
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setMode("first-run");
    setTourStep(0);
    setTourActive(false);
  }, [setTourActive, setTourStep, step, mode, track, activePersona]);

  const next = useCallback(() => {
    if (step?.id === "welcome-and-domain") {
      // Don't advance while the workspace modal is still on top of the
      // canvas — the next step highlights the canvas and would render
      // behind the modal. The user has to click LAUNCH WORKSPACE inside
      // the modal (which writes selectedDomains into the store AND
      // closes the modal). The auto-advance effect below picks it up
      // from there.
      if (domainSelectorOpen) {
        setShowDomainHint(true);
        return;
      }
      // Modal is closed but no domains made it into the store — user
      // dismissed without launching. Reopen and surface the hint.
      if (selectedDomains.length === 0) {
        setShowDomainHint(true);
        setDomainSelectorOpen(true);
        return;
      }
      // Modal closed AND domains in store → normal advance below.
    }
    if (step?.id === "first-run-finish") {
      // First-run done → show the deep-dive menu instead of closing.
      void logTourEvent({
        event: "first_run_completed",
        stepId: step.id,
        phase: "first-run",
        track,
        persona: activePersona ?? null,
        tourSessionId: tourSessionIdRef.current,
        elapsedMs: Date.now() - tourSessionStartRef.current,
      });
      setMode("deep-dive-menu");
      setTourStep(0);
      return;
    }
    if (isLast) {
      // Last step of a deep-dive track. Fire deep_dive_completed before
      // close() fires its own tour_closed — funnel readers can tell whether
      // the user finished the track or bailed mid-track from the pair.
      if (mode !== "first-run" && mode !== "deep-dive-menu") {
        void logTourEvent({
          event: "deep_dive_completed",
          stepId: step?.id ?? null,
          phase: "deep-dive",
          track: mode as DeepDiveTrack,
          persona: activePersona ?? null,
          tourSessionId: tourSessionIdRef.current,
          elapsedMs: Date.now() - tourSessionStartRef.current,
        });
      }
      close();
    } else {
      setTourStep(tourStep + 1);
    }
  }, [
    step,
    selectedDomains,
    domainSelectorOpen,
    setDomainSelectorOpen,
    isLast,
    close,
    setTourStep,
    tourStep,
    mode,
    track,
    activePersona,
  ]);

  const back = useCallback(() => {
    if (!isFirst) setTourStep(tourStep - 1);
  }, [isFirst, setTourStep, tourStep]);

  const launchDeepDive = useCallback(
    (deepDiveTrack: DeepDiveTrack) => {
      void logTourEvent({
        event: "deep_dive_launched",
        stepId: null,
        phase: "deep-dive",
        track: deepDiveTrack,
        persona: activePersona ?? null,
        tourSessionId: tourSessionIdRef.current,
        elapsedMs: Date.now() - tourSessionStartRef.current,
      });
      setMode(deepDiveTrack);
      setTourStep(0);
    },
    [setTourStep, activePersona],
  );

  // Keyboard navigation. Disabled on the menu (no step to advance).
  useEffect(() => {
    if (!tourActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (!isMenu && e.key === "ArrowRight") next();
      else if (!isMenu && e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tourActive, close, next, back, isMenu]);

  if (!tourActive) return null;

  // Build dim path with cutout holes (evenodd subtracts).
  const dimPath = (() => {
    const { w, h } = viewport;
    if (!w || !h) return "";
    let d = `M0 0 H${w} V${h} H0 Z`;
    const addHole = (c: CutoutRect) => {
      const r = Math.min(8, c.width / 2, c.height / 2);
      const x2 = c.x + c.width;
      const y2 = c.y + c.height;
      d += ` M${c.x + r} ${c.y}`;
      d += ` H${x2 - r}`;
      d += ` A${r} ${r} 0 0 1 ${x2} ${c.y + r}`;
      d += ` V${y2 - r}`;
      d += ` A${r} ${r} 0 0 1 ${x2 - r} ${y2}`;
      d += ` H${c.x + r}`;
      d += ` A${r} ${r} 0 0 1 ${c.x} ${y2 - r}`;
      d += ` V${c.y + r}`;
      d += ` A${r} ${r} 0 0 1 ${c.x + r} ${c.y}`;
      d += ` Z`;
    };
    if (cutout) addHole(cutout);
    if (secondaryCutout) addHole(secondaryCutout);
    return d;
  })();

  const arrow = step
    ? computeArrow(cutout, step.tooltipPosition, tooltipPos.top, tooltipPos.left, tooltipHeightRef.current)
    : null;
  const secondaryArrow = autoArrow(secondaryCutout, tooltipPos.top, tooltipPos.left, tooltipHeightRef.current);

  // The element to pulse when the user is taking too long. Falls back to the
  // primary cutout if no separate pulse selector was specified.
  const effectivePulse = pulseCutout ?? cutout;
  const pulseClass =
    interactionSatisfied
      ? "tour-pulse-success"
      : escalation === 2
        ? "tour-pulse-strong"
        : escalation === 1
          ? "tour-pulse-soft"
          : "";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60]" style={{ pointerEvents: "none" }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
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
          {dimPath && <path d={dimPath} fillRule="evenodd" fill="rgba(0, 0, 0, 0.78)" />}
          {/* Primary border */}
          {cutout && step && (
            <motion.rect
              x={cutout.x}
              y={cutout.y}
              width={cutout.width}
              height={cutout.height}
              rx={8}
              fill="none"
              stroke="var(--accent-cyan, #00e5ff)"
              strokeWidth={2.5}
              strokeOpacity={1}
              style={{ filter: "drop-shadow(0 0 6px rgba(0, 229, 255, 0.5))" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              key={`border-${step.id}`}
            />
          )}
          {/* Secondary border */}
          {secondaryCutout && step && (
            <motion.rect
              x={secondaryCutout.x}
              y={secondaryCutout.y}
              width={secondaryCutout.width}
              height={secondaryCutout.height}
              rx={8}
              fill="none"
              stroke="var(--accent-cyan, #00e5ff)"
              strokeWidth={2.5}
              strokeOpacity={1}
              style={{ filter: "drop-shadow(0 0 6px rgba(0, 229, 255, 0.5))" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              key={`border-secondary-${step.id}`}
            />
          )}
          {/* Pulse overlay — sits on top of the chosen pulse target when the
              user has stalled. The animation drives a separate rect rather
              than the primary border so the always-on border doesn't flicker. */}
          {effectivePulse && pulseClass && (
            <rect
              key={`pulse-${step?.id ?? ""}-${pulseClass}`}
              x={effectivePulse.x - 2}
              y={effectivePulse.y - 2}
              width={effectivePulse.width + 4}
              height={effectivePulse.height + 4}
              rx={10}
              fill="none"
              stroke="var(--accent-cyan, #00e5ff)"
              strokeWidth={3}
              className={pulseClass}
            />
          )}
          {arrow && step && (
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
          {secondaryArrow && step && (
            <motion.line
              key={`arrow-secondary-${step.id}`}
              x1={secondaryArrow.from.x}
              y1={secondaryArrow.from.y}
              x2={secondaryArrow.to.x}
              y2={secondaryArrow.to.y}
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

        {/* Tooltip card OR deep-dive menu */}
        {isMenu ? (
          <DeepDiveMenu
            onPick={launchDeepDive}
            onClose={close}
          />
        ) : step ? (
          <TooltipCard
            step={step}
            track={track}
            tourStep={tourStep}
            totalSteps={currentSteps.length}
            tooltipPos={tooltipPos}
            tooltipRef={tooltipRef}
            isFirst={isFirst}
            isLast={isLast}
            mode={mode}
            interactionSatisfied={interactionSatisfied}
            escalation={escalation}
            showDomainHint={showDomainHint}
            onNext={next}
            onBack={back}
            onClose={close}
            onReturnToMenu={
              mode === "engines" || mode === "loop" || mode === "customization"
                ? () => {
                    setMode("deep-dive-menu");
                    setTourStep(0);
                  }
                : null
            }
          />
        ) : null}
      </div>
    </AnimatePresence>
  );
}

// ─── Tooltip card ───────────────────────────────────────────────────────

interface TooltipCardProps {
  step: TourStep;
  track: ReturnType<typeof trackForPersona>;
  tourStep: number;
  totalSteps: number;
  tooltipPos: { top: number; left: number };
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  isFirst: boolean;
  isLast: boolean;
  mode: Mode;
  interactionSatisfied: boolean;
  escalation: 0 | 1 | 2;
  showDomainHint: boolean;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onReturnToMenu: (() => void) | null;
}

function TooltipCard({
  step,
  track,
  tourStep,
  totalSteps,
  tooltipPos,
  tooltipRef,
  isFirst,
  isLast,
  mode,
  interactionSatisfied,
  escalation,
  showDomainHint,
  onNext,
  onBack,
  onClose,
  onReturnToMenu,
}: TooltipCardProps) {
  const copy = resolveCopy(step, track);
  const isFirstRunFinish = step.id === "first-run-finish";
  const phaseLabel =
    mode === "first-run"
      ? "FIRST RUN"
      : mode === "engines"
        ? "ENGINES"
        : mode === "loop"
          ? "LOOP"
          : mode === "customization"
            ? "CUSTOM"
            : "";
  // Speaker reads the title and body together so users hear the full
  // step in context, not just the body without the heading.
  const ttsText = `${copy.title}. ${copy.description}`;

  return (
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
      {/* Header row: phase + step counter on the left, TTS controls + the
          optional return-to-menu button on the right. TTS lives here on
          every step so users can read or switch language at any point in
          the tour, not just from the modal. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono tracking-wider text-text-muted truncate">
          {phaseLabel} · {tourStep + 1} OF {totalSteps}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <TTSControls text={ttsText} ariaLabel="Read this step aloud" />
          {onReturnToMenu && (
            <button
              onClick={onReturnToMenu}
              className="text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground transition-colors"
              title="Back to deep-dive menu"
              aria-label="Back to deep-dive menu"
            >
              ◂
            </button>
          )}
        </div>
      </div>

      <h3 className="font-[family-name:var(--font-michroma)] text-sm tracking-wider text-accent-cyan mb-2">
        {copy.title}
      </h3>

      <p className="text-[11px] font-mono leading-relaxed text-text-muted mb-3">
        {copy.description}
      </p>

      {/* Interactive-gate hint */}
      {step.awaitInteraction && (
        <div
          className={`mb-3 rounded border px-2 py-1.5 text-[10px] font-mono tracking-wider ${
            interactionSatisfied
              ? "border-accent-green/50 bg-accent-green/10 text-accent-green"
              : escalation === 2
                ? "border-accent-cyan bg-accent-cyan/15 text-accent-cyan font-bold"
                : escalation === 1
                  ? "border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan"
                  : "border-accent-cyan/30 bg-accent-cyan/5 text-accent-cyan/80"
          }`}
        >
          {interactionSatisfied ? "✓ Got it." : step.awaitInteraction.hint}
        </div>
      )}

      {showDomainHint && (
        <div className="mb-3 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[10px] font-mono tracking-wider text-amber-300">
          Pick at least one domain and click LAUNCH WORKSPACE in the modal to continue.
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground transition-colors"
        >
          SKIP TOUR
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              BACK
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!!step.awaitInteraction && !interactionSatisfied}
            className="px-3 py-1.5 rounded border border-accent-cyan/40 bg-accent-cyan/10 text-[9px] font-mono tracking-wider text-accent-cyan hover:bg-accent-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isFirstRunFinish ? "OPEN DEEP DIVE ▸" : isLast ? "FINISH" : "NEXT"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Deep-dive menu ─────────────────────────────────────────────────────

function DeepDiveMenu({
  onPick,
  onClose,
}: {
  onPick: (track: DeepDiveTrack) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      key="deep-dive-menu"
      className="rounded-lg border border-border bg-surface-elevated p-5 shadow-2xl"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 61,
        pointerEvents: "auto",
        width: 380,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono tracking-wider text-text-muted">
          DEEP DIVE · OPT-IN
        </span>
        <TTSControls
          text="Pick a deeper look. First run done. Pick a track for a deeper walkthrough, or close out and explore on your own. You can always relaunch this from the question mark in the top right."
          ariaLabel="Read this menu aloud"
        />
      </div>
      <h3 className="font-[family-name:var(--font-michroma)] text-sm tracking-wider text-accent-cyan mb-3">
        PICK A DEEPER LOOK
      </h3>
      <p className="text-[11px] font-mono leading-relaxed text-text-muted mb-4">
        First run done. Pick a track for a deeper walkthrough, or close out and explore on your own. You can always relaunch this from the “?” in the top-right.
      </p>
      <div className="space-y-2 mb-4">
        {DEEP_DIVE_TRACKS.map((t) => (
          <FILTERED_TRACK_BUTTON
            key={t.id}
            id={t.id}
            label={t.label}
            desc={t.desc}
            onPick={onPick}
          />
        ))}
      </div>
      <div className="flex items-center justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          CLOSE
        </button>
      </div>
    </motion.div>
  );
}

// PascalCase wrapper — JSX needs an uppercase identifier.
function FILTERED_TRACK_BUTTON({
  id,
  label,
  desc,
  onPick,
}: {
  id: DeepDiveTrack;
  label: string;
  desc: string;
  onPick: (track: DeepDiveTrack) => void;
}) {
  // Count steps so the button shows "ENGINES (4 steps)".
  const count = TOUR_STEPS.filter(
    (s) => s.phase === "deep-dive" && s.deepDiveTrack === id,
  ).length;
  return (
    <button
      onClick={() => onPick(id)}
      className="w-full text-left rounded border border-border hover:border-accent-cyan/50 hover:bg-accent-cyan/5 transition-colors px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-bold text-accent-cyan tracking-wider">
          {label}
        </span>
        <span className="text-[9px] font-mono text-text-muted">{count} STEPS</span>
      </div>
      <div className="text-[10px] font-mono text-text-muted mt-0.5">{desc}</div>
    </button>
  );
}

// Suppress unused ID-export warnings if any code wants to reference these
// without re-importing.
export { FIRST_RUN_IDS };
