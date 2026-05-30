"use client";

import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import type { TimeGranularity, TemporalEvent } from "@/lib/temporal-data";
import { getEventsInRange } from "@/lib/temporal-data";

// Two groups so we can render a subtle visual divider between fast presets
// (sub-monthly, suitable for daily/weekly FRED + EIA Hormuz) and long presets
// (year+, suitable for World Bank annual / WGI governance). The divider is
// rendered inline in the JSX below.
const GRANULARITY_OPTIONS: { value: TimeGranularity; label: string; group: "short" | "long" }[] = [
  { value: "hour", label: "1H", group: "short" },
  { value: "day", label: "1D", group: "short" },
  { value: "week", label: "1W", group: "short" },
  { value: "month", label: "1M", group: "short" },
  { value: "year", label: "1Y", group: "long" },
  { value: "5year", label: "5Y", group: "long" },
  { value: "all", label: "ALL", group: "long" },
];

const SPEED_OPTIONS = [0.5, 1, 2, 4];

function formatDate(ts: number, granularity: TimeGranularity): string {
  const d = new Date(ts);
  switch (granularity) {
    case "hour":
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    case "day":
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    case "week":
      return `W${getWeekNumber(d)} ${d.toLocaleDateString("en-US", { month: "short" })}`;
    case "month":
      return d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
    case "year":
    case "5year":
    case "all":
      // For long presets, year is the only meaningful x-axis label —
      // showing month/day on a multi-year axis is noise.
      return d.toLocaleDateString("en-US", { year: "numeric" });
  }
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Generate evenly-spaced tick marks for the timeline */
function generateTicks(
  start: number,
  end: number,
  granularity: TimeGranularity,
): { ts: number; label: string }[] {
  const ticks: { ts: number; label: string }[] = [];
  const range = end - start;
  const DAY = 86400000;

  let step: number;
  switch (granularity) {
    case "hour":
      step = DAY / 4; // every 6 hours
      break;
    case "day":
      step = DAY * 7; // weekly ticks
      break;
    case "week":
      step = DAY * 14; // bi-weekly
      break;
    case "month":
      step = DAY * 30;
      break;
    case "year":
      step = DAY * 90; // quarterly ticks across a 1y span
      break;
    case "5year":
      step = DAY * 365; // annual ticks across 5y
      break;
    case "all":
      step = DAY * 365 * 5; // 5-year ticks across the full span
      break;
  }

  // Aim for 6-12 ticks
  const maxTicks = 12;
  if (range / step > maxTicks) {
    step = range / maxTicks;
  }

  let cursor = start;
  while (cursor <= end) {
    ticks.push({ ts: cursor, label: formatDate(cursor, granularity) });
    cursor += step;
  }

  return ticks;
}

export default function TimeDial() {
  const {
    timelinePosition,
    timelineRange,
    timelineSelection,
    timelineFullRange,
    isLive,
    timelineGranularity,
    temporalData,
    setTimelinePosition,
    setIsLive,
    setTimelineGranularity,
    setTimelineSelection,
    zoomToSelection,
    zoomOut,
    initTemporalData,
    goLive,
    // Replay state
    replayActive,
    replayPlaying,
    replaySpeed,
    currentEpoch,
    baselineEpochs,
    interventionEpochs,
    activeTimeline,
    replayBranchEpoch,
    shocks,
    startReplay,
    stopReplay,
    setReplayPlaying,
    setReplaySpeed,
    setCurrentEpoch,
    stepEpoch,
    setActiveTimeline,
    branchFromCurrentEpoch,
    setTimelineDragging,
  } = useApexStore();

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRangeSelecting, setIsRangeSelecting] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TemporalEvent | null>(null);
  const [historicalPlaying, setHistoricalPlaying] = useState(false);
  // Granularity row used to render all 7 presets (1H..ALL) inline,
  // which crowded the dial header on narrow viewports. Now collapses
  // to a single chip showing the active preset; clicking expands the
  // full row, picking any preset re-collapses. User feedback:
  // "the time dial itself has a very extensive selection window …
  // we should make that collapsible so there's more room for the
  // time dial itself."
  const [granularityExpanded, setGranularityExpanded] = useState(false);
  const historicalPlayRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Initialize temporal data on mount
  useEffect(() => {
    initTemporalData();
  }, [initTemporalData]);

  const { start, end } = timelineRange;

  // Determine step size for historical playback based on granularity
  const historicalStepMs = useMemo(() => {
    const DAY = 86400000;
    switch (timelineGranularity) {
      case "hour": return DAY / 24;
      case "day": return DAY;
      case "week": return DAY * 7;
      case "month": return DAY * 30;
      case "year": return DAY * 30; // step monthly through a 1y span
      case "5year": return DAY * 90; // step quarterly through 5y
      case "all": return DAY * 365; // step annually through ALL
    }
  }, [timelineGranularity]);

  // Historical playback animation loop
  useEffect(() => {
    if (!historicalPlaying || replayActive) {
      if (historicalPlayRef.current !== null) {
        cancelAnimationFrame(historicalPlayRef.current);
        historicalPlayRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      if (!historicalPlaying) return;

      // Advance every ~150ms
      if (now - lastTickRef.current >= 150) {
        lastTickRef.current = now;
        const currentPos = useApexStore.getState().timelinePosition;
        const newPos = currentPos + historicalStepMs;
        const timeEnd = useApexStore.getState().timelineRange.end;

        if (newPos >= timeEnd) {
          // Reached the end — auto-pause and go live
          setHistoricalPlaying(false);
          goLive();
          return;
        }

        setTimelinePosition(newPos);
      }

      historicalPlayRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    historicalPlayRef.current = requestAnimationFrame(tick);

    return () => {
      if (historicalPlayRef.current !== null) {
        cancelAnimationFrame(historicalPlayRef.current);
        historicalPlayRef.current = null;
      }
    };
  }, [historicalPlaying, replayActive, historicalStepMs, setTimelinePosition, goLive]);
  const range = end - start;

  // Replay derived state
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const maxEpoch = Math.max(0, replayEpochs.length - 1);
  const clampedEpoch = Math.min(currentEpoch, maxEpoch);
  const currentSnapshot = replayActive && replayEpochs.length > 0
    ? replayEpochs[clampedEpoch] ?? null
    : null;
  const hasBranch = interventionEpochs.length > 0;

  // Position as fraction 0-1
  const positionFraction = replayActive
    ? maxEpoch > 0 ? clampedEpoch / maxEpoch : 0
    : range > 0 ? (timelinePosition - start) / range : 1;

  // Selection as fractions 0-1
  const selectionFracs = useMemo(() => {
    if (!timelineSelection || range <= 0) return null;
    return {
      start: Math.max(0, (timelineSelection.start - start) / range),
      end: Math.min(1, (timelineSelection.end - start) / range),
    };
  }, [timelineSelection, start, range]);

  // Tick marks (only for historical mode)
  const ticks = useMemo(
    () => generateTicks(start, end, timelineGranularity),
    [start, end, timelineGranularity],
  );

  // Events on the timeline (only for historical mode)
  const events = useMemo(
    () => (temporalData ? getEventsInRange(temporalData, start, end) : []),
    [temporalData, start, end],
  );

  // Events within selection (for context)
  const selectionEventCount = useMemo(() => {
    if (!timelineSelection || !temporalData) return 0;
    return getEventsInRange(temporalData, timelineSelection.start, timelineSelection.end).length;
  }, [timelineSelection, temporalData]);

  // Convert pixel position to timestamp
  const pixelToTimestamp = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return start;
      const rect = trackRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return start + fraction * range;
    },
    [start, range],
  );

  // Convert pixel position to timestamp (historical) or epoch (replay)
  const handleTrackScrub = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      if (replayActive) {
        // Map fraction to epoch — clamp to valid range
        const epoch = Math.min(maxEpoch, Math.max(0, Math.round(fraction * maxEpoch)));
        setCurrentEpoch(epoch);
        setReplayPlaying(false);
      } else {
        const ts = start + fraction * range;
        setTimelinePosition(ts);
      }
    },
    [start, range, replayActive, maxEpoch, setTimelinePosition, setCurrentEpoch, setReplayPlaying],
  );

  // Handle click/drag on the track
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Shift+drag = range selection (historical mode only)
      if (e.shiftKey && !replayActive) {
        setIsRangeSelecting(true);
        const ts = pixelToTimestamp(e.clientX);
        setRangeAnchor(ts);
        setTimelineSelection({ start: ts, end: ts });
        return;
      }

      // Normal drag = scrub
      setIsDragging(true);
      // Tell the TimeSeriesOverlay to pin its tooltip to the dial position
      // while we drag, so the smaller curves show their values next to the
      // playhead instead of just an unlabeled line.
      setTimelineDragging(true);
      setTimelineSelection(null); // Clear selection on normal click
      handleTrackScrub(e.clientX);
    },
    [handleTrackScrub, replayActive, pixelToTimestamp, setTimelineSelection, setTimelineDragging],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isRangeSelecting && rangeAnchor !== null) {
        const ts = pixelToTimestamp(e.clientX);
        setTimelineSelection({
          start: Math.min(rangeAnchor, ts),
          end: Math.max(rangeAnchor, ts),
        });
        return;
      }
      if (!isDragging) return;
      handleTrackScrub(e.clientX);
    },
    [isDragging, isRangeSelecting, rangeAnchor, handleTrackScrub, pixelToTimestamp, setTimelineSelection],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsRangeSelecting(false);
    setRangeAnchor(null);
    setTimelineDragging(false);
  }, [setTimelineDragging]);

  // Criticality display for cascade mode
  let critLabel = "STABLE";
  let critColor = "var(--accent-green)";
  if (currentSnapshot) {
    if (currentSnapshot.isCritical) {
      critLabel = "CRITICAL";
      critColor = "var(--accent-red)";
    } else if (currentSnapshot.criticalityEstimate !== null) {
      critLabel = `~${currentSnapshot.criticalityEstimate} EPOCHS`;
      critColor = "var(--accent-amber)";
    } else if (currentSnapshot.isStable) {
      critLabel = "STABLE";
      critColor = "var(--accent-green)";
    }
  }

  const bufferValue = currentSnapshot?.omegaBuffer ?? 100;
  const bufferSegments = 20;
  const filledSegments = Math.round((bufferValue / 100) * bufferSegments);

  // Keyboard navigation — merges historical and replay shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Replay-mode shortcuts
      if (replayActive) {
        switch (e.key) {
          case " ":
            e.preventDefault();
            setReplayPlaying(!replayPlaying);
            return;
          case "ArrowLeft":
            if (!e.shiftKey) {
              e.preventDefault();
              stepEpoch(-1);
              return;
            }
            break;
          case "ArrowRight":
            if (!e.shiftKey) {
              e.preventDefault();
              stepEpoch(1);
              return;
            }
            break;
          case "[": {
            e.preventDefault();
            const idx = SPEED_OPTIONS.indexOf(replaySpeed);
            if (idx > 0) setReplaySpeed(SPEED_OPTIONS[idx - 1]);
            return;
          }
          case "]": {
            e.preventDefault();
            const idx = SPEED_OPTIONS.indexOf(replaySpeed);
            if (idx < SPEED_OPTIONS.length - 1)
              setReplaySpeed(SPEED_OPTIONS[idx + 1]);
            return;
          }
          case "b":
          case "B":
            e.preventDefault();
            if (!replayPlaying) branchFromCurrentEpoch();
            return;
          case "Escape":
            e.preventDefault();
            stopReplay();
            return;
        }
      }

      // Historical-mode shortcuts (Shift+Arrow, Space for play/pause)
      if (!replayActive) {
        // Space toggles historical playback
        if (e.key === " ") {
          e.preventDefault();
          setHistoricalPlaying((prev) => !prev);
          return;
        }


        // Escape clears time window selection
        if (e.key === "Escape" && timelineSelection) {
          e.preventDefault();
          setTimelineSelection(null);
          return;
        }

        const DAY = 86400000;
        let step = 0;

        switch (timelineGranularity) {
          case "hour":
            step = DAY / 24;
            break;
          case "day":
            step = DAY;
            break;
          case "week":
            step = DAY * 7;
            break;
          case "month":
            step = DAY * 30;
            break;
          case "year":
            step = DAY * 30;
            break;
          case "5year":
            step = DAY * 90;
            break;
          case "all":
            step = DAY * 365;
            break;
        }

        if (e.key === "ArrowLeft" && e.shiftKey) {
          e.preventDefault();
          setTimelinePosition(Math.max(start, timelinePosition - step));
        } else if (e.key === "ArrowRight" && e.shiftKey) {
          e.preventDefault();
          const newTs = Math.min(end, timelinePosition + step);
          if (newTs >= end - step / 2) {
            goLive();
          } else {
            setTimelinePosition(newTs);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    replayActive, replayPlaying, replaySpeed, timelineGranularity,
    timelinePosition, timelineSelection, start, end, setTimelinePosition, goLive,
    setReplayPlaying, stepEpoch, setReplaySpeed, branchFromCurrentEpoch,
    stopReplay, setTimelineSelection, setHistoricalPlaying,
  ]);

  if (!temporalData) return null;

  return (
    <div
      data-tour="time-dial"
      className="relative flex items-center gap-3 px-4 py-2 border-t border-border bg-surface-elevated/90 backdrop-blur-sm select-none"
    >
      {/* Label — switches between Time Dial and CASCADE MODE */}
      <div className="flex flex-col items-center gap-0.5 min-w-[72px]">
        <AnimatePresence mode="wait">
          {replayActive ? (
            <motion.span
              key="cascade"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.15em] uppercase"
              style={{ color: "var(--accent-amber)" }}
            >
              Cascade
            </motion.span>
          ) : timelineSelection ? (
            <motion.span
              key="window"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.15em] uppercase"
              style={{ color: "var(--accent-cyan)" }}
            >
              Window
            </motion.span>
          ) : (
            <motion.span
              key="timedial"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.2em] text-text-muted uppercase"
            >
              Time Dial
            </motion.span>
          )}
        </AnimatePresence>
        <span className="text-[9px] font-mono text-foreground">
          {replayActive
            ? `E${currentEpoch}/${maxEpoch}`
            : timelineSelection
              ? `${Math.round((timelineSelection.end - timelineSelection.start) / 86400000)}d`
              : isLive
                ? "LIVE"
                : formatDate(timelinePosition, timelineGranularity)}
        </span>
      </div>

      {/* Cascade transport controls — only shown during replay */}
      <AnimatePresence>
        {replayActive && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-1 overflow-hidden"
          >
            {/* Step back */}
            <button
              onClick={() => stepEpoch(-1)}
              className="w-6 h-6 flex items-center justify-center rounded text-[9px] transition-colors hover:bg-white/10"
              style={{ color: "var(--accent-amber)" }}
              title="Step back (Left arrow)"
            >
              &#9664;&#9664;
            </button>
            {/* Play/Pause */}
            <button
              onClick={() => setReplayPlaying(!replayPlaying)}
              className="w-7 h-7 flex items-center justify-center rounded text-[11px] transition-colors hover:bg-white/10"
              style={{ color: "var(--accent-amber)" }}
              title="Play/Pause (Space)"
            >
              {replayPlaying ? "\u2590\u2590" : "\u25B6"}
            </button>
            {/* Step forward */}
            <button
              onClick={() => stepEpoch(1)}
              className="w-6 h-6 flex items-center justify-center rounded text-[9px] transition-colors hover:bg-white/10"
              style={{ color: "var(--accent-amber)" }}
              title="Step forward (Right arrow)"
            >
              &#9654;&#9654;
            </button>

            {/* Speed selector */}
            <div className="flex items-center gap-0.5 ml-1">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setReplaySpeed(s)}
                  className="px-1 py-0.5 rounded text-[7px] font-mono transition-colors"
                  style={{
                    color:
                      replaySpeed === s ? "var(--accent-amber)" : "var(--text-muted)",
                    background:
                      replaySpeed === s ? "rgba(255, 171, 0, 0.12)" : "transparent",
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Granularity selector + historical play button — hidden during cascade */}
      <AnimatePresence>
        {!replayActive && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-1 overflow-hidden"
          >
            {granularityExpanded ? (
              <div className="flex gap-0.5 rounded border border-border overflow-hidden">
                {GRANULARITY_OPTIONS.map((opt, i) => {
                  // Insert a slightly heavier separator between "month" (short
                  // group) and "year" (long group) so the eye picks up the
                  // cadence-tier boundary without needing a legend.
                  const prev = i > 0 ? GRANULARITY_OPTIONS[i - 1] : null;
                  const isGroupBoundary = prev && prev.group !== opt.group;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setTimelineGranularity(opt.value);
                        setGranularityExpanded(false);
                      }}
                      className="px-1.5 py-0.5 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
                      style={{
                        backgroundColor:
                          timelineGranularity === opt.value
                            ? "rgba(0,229,255,0.15)"
                            : "transparent",
                        color:
                          timelineGranularity === opt.value
                            ? "var(--accent-cyan)"
                            : "var(--text-muted)",
                        borderRight: "1px solid var(--border)",
                        borderLeft: isGroupBoundary
                          ? "1px solid var(--border-bright)"
                          : undefined,
                      }}
                      title={
                        opt.value === "year"
                          ? "1 year window — for annual signals (World Bank, WGI)"
                          : opt.value === "5year"
                            ? "5 year window — multi-year trend on annual signals"
                            : opt.value === "all"
                              ? "Full data span — shows every published observation"
                              : undefined
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                onClick={() => setGranularityExpanded(true)}
                className="px-2 py-0.5 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider rounded border border-border flex items-center gap-1 hover:bg-white/5 transition-colors"
                style={{
                  color: "var(--accent-cyan)",
                  backgroundColor: "rgba(0,229,255,0.08)",
                }}
                title="Click to change time-window preset"
              >
                <span>
                  {GRANULARITY_OPTIONS.find((o) => o.value === timelineGranularity)?.label ?? "—"}
                </span>
                <span className="opacity-60 text-[7px]">▾</span>
              </button>
            )}
            {/* Historical play/pause button — only in non-live, non-replay mode */}
            {!isLive && (
              <button
                onClick={() => setHistoricalPlaying(!historicalPlaying)}
                className="w-6 h-6 flex items-center justify-center rounded border transition-colors hover:bg-white/10"
                style={{
                  color: historicalPlaying ? "var(--accent-cyan)" : "var(--text-muted)",
                  borderColor: historicalPlaying ? "rgba(0,229,255,0.4)" : "var(--border)",
                  backgroundColor: historicalPlaying ? "rgba(0,229,255,0.1)" : "transparent",
                }}
                title="Play/Pause historical scrub (Space)"
              >
                <span className="text-[10px]">
                  {historicalPlaying ? "\u2590\u2590" : "\u25B6"}
                </span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline track */}
      <div className="flex-1 flex flex-col gap-1">
        {/* Date at cursor / epoch count / selection range */}
        <div className="flex justify-between items-center h-3">
          {replayActive ? (
            <>
              <span
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider"
                style={{ color: "var(--accent-amber)" }}
              >
                EPOCH {currentEpoch}/{maxEpoch}
              </span>
              {/* Criticality */}
              <span
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider"
                style={{ color: critColor }}
              >
                {critLabel}
              </span>
            </>
          ) : timelineSelection ? (
            <>
              <span className="text-[8px] font-mono" style={{ color: "var(--accent-cyan)" }}>
                {formatShortDate(timelineSelection.start)}
              </span>
              <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider" style={{ color: "var(--accent-cyan)" }}>
                {selectionEventCount > 0 ? `${selectionEventCount} event${selectionEventCount > 1 ? "s" : ""} in window` : "Shift+drag to adjust"}
              </span>
              <span className="text-[8px] font-mono" style={{ color: "var(--accent-cyan)" }}>
                {formatShortDate(timelineSelection.end)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[8px] font-mono text-text-muted">
                {formatDate(start, timelineGranularity)}
              </span>
              {!isLive && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[9px] font-mono text-accent-cyan"
                >
                  {formatFullDate(timelinePosition)}
                </motion.span>
              )}
              <span className="text-[8px] font-mono text-text-muted">
                {formatDate(end, timelineGranularity)}
              </span>
            </>
          )}
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          data-timedial-track="true"
          className="relative h-6 cursor-crosshair rounded"
          style={{ backgroundColor: "rgba(26,28,46,0.8)" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Filled portion */}
          <div
            className="absolute top-0 left-0 h-full rounded-l transition-[width] duration-75"
            style={{
              width: `${positionFraction * 100}%`,
              background: replayActive
                ? "linear-gradient(90deg, rgba(255,171,0,0.05), rgba(255,171,0,0.2))"
                : isLive
                  ? "linear-gradient(90deg, rgba(0,229,255,0.05), rgba(0,229,255,0.15))"
                  : "linear-gradient(90deg, rgba(0,229,255,0.03), rgba(0,229,255,0.12))",
            }}
          />

          {/* Time window selection overlay */}
          {!replayActive && selectionFracs && (
            <div
              className="absolute top-0 h-full z-10 pointer-events-none rounded"
              style={{
                left: `${selectionFracs.start * 100}%`,
                width: `${(selectionFracs.end - selectionFracs.start) * 100}%`,
                background: "rgba(0,229,255,0.15)",
                borderLeft: "2px solid rgba(0,229,255,0.6)",
                borderRight: "2px solid rgba(0,229,255,0.6)",
                boxShadow: "inset 0 0 8px rgba(0,229,255,0.1)",
              }}
            />
          )}

          {/* Cascade epoch markers — show epoch positions as small amber ticks */}
          {replayActive && maxEpoch > 0 && (
            <>
              {/* Show ~20 evenly spaced epoch ticks max */}
              {Array.from({ length: Math.min(maxEpoch + 1, 30) }).map((_, i) => {
                const epochIdx = maxEpoch <= 29 ? i : Math.round((i / 29) * maxEpoch);
                const frac = epochIdx / maxEpoch;
                return (
                  <div
                    key={epochIdx}
                    className="absolute top-0 h-full pointer-events-none"
                    style={{ left: `${frac * 100}%` }}
                  >
                    <div
                      className="w-px h-1.5"
                      style={{ backgroundColor: "rgba(255,171,0,0.3)" }}
                    />
                  </div>
                );
              })}
            </>
          )}

          {/* Historical tick marks — only when not in cascade */}
          {!replayActive &&
            ticks.map((tick, i) => {
              const frac = range > 0 ? (tick.ts - start) / range : 0;
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full flex flex-col items-center justify-end pointer-events-none"
                  style={{ left: `${frac * 100}%` }}
                >
                  <div
                    className="w-px h-2"
                    style={{ backgroundColor: "var(--border-bright)" }}
                  />
                  <span
                    className="text-[7px] font-mono absolute -bottom-3 whitespace-nowrap"
                    style={{
                      color: "var(--text-muted)",
                      transform: "translateX(-50%)",
                    }}
                  >
                    {tick.label}
                  </span>
                </div>
              );
            })}

          {/* Event markers — only when not in cascade */}
          {!replayActive &&
            events.map((evt) => {
              const frac =
                range > 0 ? (evt.date.getTime() - start) / range : 0;
              return (
                <div
                  key={evt.id}
                  className="absolute top-0.5 w-1.5 h-1.5 rounded-full cursor-pointer z-10"
                  style={{
                    left: `${frac * 100}%`,
                    transform: "translateX(-50%)",
                    backgroundColor:
                      evt.severity > 0.7
                        ? "var(--accent-red)"
                        : evt.severity > 0.4
                          ? "var(--accent-amber)"
                          : "var(--accent-cyan)",
                    boxShadow:
                      evt.severity > 0.7
                        ? "0 0 4px var(--accent-red)"
                        : "none",
                  }}
                  onMouseEnter={() => setHoveredEvent(evt)}
                  onMouseLeave={() => setHoveredEvent(null)}
                />
              );
            })}

          {/* Playhead */}
          <div
            className="absolute top-0 h-full w-0.5 z-20 pointer-events-none"
            style={{
              left: `${positionFraction * 100}%`,
              transform: "translateX(-50%)",
              backgroundColor: replayActive
                ? "var(--accent-amber)"
                : isLive
                  ? "var(--accent-green)"
                  : "var(--accent-cyan)",
              boxShadow: replayActive
                ? "0 0 6px var(--accent-amber)"
                : isLive
                  ? "0 0 6px var(--accent-green)"
                  : "0 0 4px var(--accent-cyan)",
            }}
          >
            {/* Playhead diamond */}
            <div
              className="absolute -top-1 left-1/2 w-2 h-2 rotate-45"
              style={{
                transform: "translateX(-50%) rotate(45deg)",
                backgroundColor: replayActive
                  ? "var(--accent-amber)"
                  : isLive
                    ? "var(--accent-green)"
                    : "var(--accent-cyan)",
              }}
            />
          </div>
        </div>

        {/* Bottom tick labels spacer */}
        <div className="h-2" />
      </div>

      {/* Time window actions — shown when selection is active */}
      <AnimatePresence>
        {!replayActive && timelineSelection && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1"
          >
            <button
              onClick={zoomToSelection}
              className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors hover:bg-cyan-500/10 whitespace-nowrap"
              style={{
                color: "var(--accent-cyan)",
                border: "1px solid rgba(0, 229, 255, 0.3)",
              }}
              title="Zoom into selected range"
            >
              ZOOM IN
            </button>
            <button
              onClick={() => setTimelineSelection(null)}
              className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors hover:bg-red-500/10 whitespace-nowrap"
              style={{
                color: "var(--accent-red)",
                border: "1px solid rgba(255, 23, 68, 0.3)",
              }}
              title="Clear time window (Escape)"
            >
              CLEAR
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom out button — shown when zoomed in */}
      <AnimatePresence>
        {!replayActive && !timelineSelection && timelineFullRange && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={zoomOut}
            className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors hover:bg-cyan-500/10 whitespace-nowrap"
            style={{
              color: "var(--accent-cyan)",
              border: "1px solid rgba(0, 229, 255, 0.3)",
            }}
            title="Zoom out to full range"
          >
            ZOOM OUT
          </motion.button>
        )}
      </AnimatePresence>

      {/* Cascade mode: omega buffer + timeline tabs + branch + stop */}
      <AnimatePresence>
        {replayActive && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-2 overflow-hidden"
          >
            {/* Mini omega-buffer bar */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                {"\u03A9"}-BUF
              </span>
              <div className="flex gap-[1px]">
                {Array.from({ length: bufferSegments }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[3px] h-[6px] rounded-[1px]"
                    style={{
                      background:
                        i < filledSegments
                          ? bufferValue < 15
                            ? "var(--accent-red)"
                            : bufferValue < 35
                              ? "var(--accent-amber)"
                              : "var(--accent-cyan)"
                          : "color-mix(in srgb, var(--text-muted) 20%, transparent)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="h-5 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

            {/* Timeline tabs */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setActiveTimeline("baseline")}
                className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
                style={{
                  color:
                    activeTimeline === "baseline"
                      ? "var(--accent-cyan)"
                      : "var(--text-muted)",
                  background:
                    activeTimeline === "baseline"
                      ? "rgba(0, 229, 255, 0.1)"
                      : "transparent",
                }}
              >
                BASE
              </button>
              {hasBranch && (
                <button
                  onClick={() => setActiveTimeline("intervention")}
                  className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
                  style={{
                    color:
                      activeTimeline === "intervention"
                        ? "var(--accent-amber)"
                        : "var(--text-muted)",
                    background:
                      activeTimeline === "intervention"
                        ? "rgba(255, 171, 0, 0.1)"
                        : "transparent",
                  }}
                >
                  INTV
                  {replayBranchEpoch !== null && (
                    <span className="ml-0.5 opacity-60">@{replayBranchEpoch}</span>
                  )}
                </button>
              )}
            </div>

            {/* Branch button */}
            <button
              onClick={branchFromCurrentEpoch}
              disabled={replayPlaying}
              className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors disabled:opacity-30"
              style={{
                color: "var(--accent-amber)",
                border: "1px solid rgba(255, 171, 0, 0.3)",
              }}
              title="Branch from current epoch (B)"
            >
              BRANCH
            </button>

            <div className="h-5 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

            {/* Stop button */}
            <button
              onClick={stopReplay}
              className="px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors hover:bg-red-500/10"
              style={{
                color: "var(--accent-red)",
                border: "1px solid rgba(255, 23, 68, 0.3)",
              }}
              title="Stop cascade (Escape)"
            >
              STOP
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start cascade button — shown when shocks active but replay not started */}
      <AnimatePresence>
        {!replayActive && shocks.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={startReplay}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all duration-200 hover:scale-105 whitespace-nowrap"
            style={{
              borderColor: "rgba(255, 171, 0, 0.5)",
              color: "var(--accent-amber)",
              background: "rgba(255, 171, 0, 0.08)",
            }}
          >
            <span className="text-[10px]">{"\u25B6"}</span>
            <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.1em]">
              CASCADE
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Live button — hidden during cascade */}
      <AnimatePresence>
        {!replayActive && (
          <motion.button
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            onClick={goLive}
            className="flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 overflow-hidden"
            style={{
              borderColor: isLive
                ? "var(--accent-green)"
                : "var(--border)",
              backgroundColor: isLive
                ? "rgba(0,230,118,0.1)"
                : "transparent",
            }}
          >
            <span
              className="relative flex h-2 w-2"
              style={{ opacity: isLive ? 1 : 0.4 }}
            >
              {isLive && (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: "var(--accent-green)" }}
                />
              )}
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{
                  backgroundColor: isLive
                    ? "var(--accent-green)"
                    : "var(--text-muted)",
                }}
              />
            </span>
            <span
              className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider"
              style={{
                color: isLive ? "var(--accent-green)" : "var(--text-muted)",
              }}
            >
              LIVE
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Event tooltip */}
      <AnimatePresence>
        {hoveredEvent && !replayActive && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-2 rounded border z-50 max-w-xs"
            style={{
              backgroundColor: "var(--surface-elevated)",
              borderColor: "var(--border-bright)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            <div className="text-[9px] font-[family-name:var(--font-michroma)] text-accent-amber tracking-wider">
              {hoveredEvent.label}
            </div>
            <div className="text-[8px] font-mono text-text-muted mt-1">
              {formatFullDate(hoveredEvent.date.getTime())}
            </div>
            <div className="text-[9px] font-mono text-foreground mt-1">
              {hoveredEvent.description}
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {hoveredEvent.affectedNodeIds.map((id) => (
                <span
                  key={id}
                  className="text-[7px] font-mono px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: "rgba(0,229,255,0.1)",
                    color: "var(--accent-cyan)",
                  }}
                >
                  {id}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
