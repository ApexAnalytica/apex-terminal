"use client";

import { useEffect, useCallback } from "react";
import { useApexStore } from "@/stores/useApexStore";

const SPEED_OPTIONS = [0.5, 1, 2, 4];

function getStatusColor(status: string): string {
  switch (status) {
    case "OMEGA_BREACH":
    case "CRITICAL":
      return "var(--accent-red)";
    case "ELEVATED":
      return "var(--accent-amber)";
    default:
      return "var(--accent-green)";
  }
}

export default function ReplayControls() {
  const {
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
  } = useApexStore();

  const epochs =
    activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const maxEpoch = Math.max(0, epochs.length - 1);
  const currentSnapshot = epochs[currentEpoch] ?? null;
  const hasBranch = interventionEpochs.length > 0;

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!replayActive) return;
      // Don't intercept if user is in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          setReplayPlaying(!replayPlaying);
          break;
        case "ArrowLeft":
          e.preventDefault();
          stepEpoch(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          stepEpoch(1);
          break;
        case "[": {
          e.preventDefault();
          const idx = SPEED_OPTIONS.indexOf(replaySpeed);
          if (idx > 0) setReplaySpeed(SPEED_OPTIONS[idx - 1]);
          break;
        }
        case "]": {
          e.preventDefault();
          const idx = SPEED_OPTIONS.indexOf(replaySpeed);
          if (idx < SPEED_OPTIONS.length - 1)
            setReplaySpeed(SPEED_OPTIONS[idx + 1]);
          break;
        }
        case "b":
        case "B":
          e.preventDefault();
          if (!replayPlaying) branchFromCurrentEpoch();
          break;
      }
    },
    [
      replayActive,
      replayPlaying,
      replaySpeed,
      setReplayPlaying,
      stepEpoch,
      setReplaySpeed,
      branchFromCurrentEpoch,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Start button (shown when shocks active but replay off)
  if (!replayActive) {
    if (shocks.length === 0) return null;
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={startReplay}
          className="px-5 py-2.5 rounded border font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.15em] transition-all duration-200 hover:scale-105"
          style={{
            borderColor: "rgba(0, 229, 255, 0.5)",
            color: "var(--accent-cyan)",
            background: "rgba(0, 229, 255, 0.08)",
            backdropFilter: "blur(12px)",
          }}
        >
          START CASCADE REPLAY
        </button>
      </div>
    );
  }

  // Criticality display
  let critLabel = "STABLE";
  let critColor = "var(--accent-green)";
  if (currentSnapshot) {
    if (currentSnapshot.isCritical) {
      critLabel = "CRITICAL";
      critColor = "var(--accent-red)";
    } else if (currentSnapshot.criticalityEstimate !== null) {
      critLabel = `CRITICALITY IN ~${currentSnapshot.criticalityEstimate} EPOCHS`;
      critColor = "var(--accent-amber)";
    } else if (currentSnapshot.isStable) {
      critLabel = "STABLE";
      critColor = "var(--accent-green)";
    }
  }

  const bufferValue = currentSnapshot?.omegaBuffer ?? 100;
  const bufferSegments = 20;
  const filledSegments = Math.round((bufferValue / 100) * bufferSegments);

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
      style={{ minWidth: "520px" }}
    >
      {/* Main control bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
        style={{
          background: "rgba(10, 11, 16, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid color-mix(in srgb, var(--text-muted) 30%, transparent)",
        }}
      >
        {/* Transport controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => stepEpoch(-1)}
            className="w-7 h-7 flex items-center justify-center rounded text-[10px] transition-colors hover:bg-white/10"
            style={{ color: "var(--accent-cyan)" }}
            title="Step back (Left arrow)"
          >
            &#9664;&#9664;
          </button>
          <button
            onClick={() => setReplayPlaying(!replayPlaying)}
            className="w-8 h-8 flex items-center justify-center rounded text-[12px] transition-colors hover:bg-white/10"
            style={{ color: "var(--accent-cyan)" }}
            title="Play/Pause (Space)"
          >
            {replayPlaying ? "▐▐" : "▶"}
          </button>
          <button
            onClick={() => stepEpoch(1)}
            className="w-7 h-7 flex items-center justify-center rounded text-[10px] transition-colors hover:bg-white/10"
            style={{ color: "var(--accent-cyan)" }}
            title="Step forward (Right arrow)"
          >
            &#9654;&#9654;
          </button>
        </div>

        <div className="h-6 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setReplaySpeed(s)}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors"
              style={{
                color:
                  replaySpeed === s ? "var(--accent-cyan)" : "var(--text-muted)",
                background:
                  replaySpeed === s ? "rgba(0, 229, 255, 0.12)" : "transparent",
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="h-6 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

        {/* Epoch slider */}
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input
            type="range"
            min={0}
            max={maxEpoch}
            value={currentEpoch}
            onChange={(e) => {
              setCurrentEpoch(Number(e.target.value));
              setReplayPlaying(false);
            }}
            className="flex-1 h-1 accent-[var(--accent-cyan)] cursor-pointer"
            style={{ accentColor: "var(--accent-cyan)" }}
          />
          <span
            className="text-[9px] font-mono tabular-nums min-w-[80px] text-right"
            style={{ color: "var(--text-muted)" }}
          >
            EPOCH {currentEpoch}/{maxEpoch}
          </span>
        </div>

        <div className="h-6 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

        {/* Criticality display */}
        <div className="flex flex-col items-center gap-1">
          <span
            className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider"
            style={{ color: critColor }}
          >
            {critLabel}
          </span>
          {/* Mini omega-buffer bar */}
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

        <div className="h-6 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

        {/* Stop button */}
        <button
          onClick={stopReplay}
          className="px-2.5 py-1 rounded text-[8px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors hover:bg-red-500/10"
          style={{
            color: "var(--accent-red)",
            border: "1px solid rgba(255, 23, 68, 0.3)",
          }}
        >
          STOP
        </button>
      </div>

      {/* Timeline toggle + branch */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{
          background: "rgba(10, 11, 16, 0.75)",
          backdropFilter: "blur(12px)",
          border: "1px solid color-mix(in srgb, var(--text-muted) 20%, transparent)",
        }}
      >
        {/* Timeline tabs */}
        <button
          onClick={() => setActiveTimeline("baseline")}
          className="px-2.5 py-1 rounded text-[8px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
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
          BASELINE
        </button>
        {hasBranch && (
          <button
            onClick={() => setActiveTimeline("intervention")}
            className="px-2.5 py-1 rounded text-[8px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
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
            INTERVENTION
            {replayBranchEpoch !== null && (
              <span className="ml-1 opacity-60">@{replayBranchEpoch}</span>
            )}
          </button>
        )}

        <div className="h-4 w-px" style={{ background: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }} />

        {/* Branch button */}
        <button
          onClick={branchFromCurrentEpoch}
          disabled={replayPlaying}
          className="px-2.5 py-1 rounded text-[8px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors disabled:opacity-30"
          style={{
            color: "var(--accent-amber)",
            border: "1px solid rgba(255, 171, 0, 0.3)",
          }}
          title="Branch from current epoch (B)"
        >
          BRANCH FROM EPOCH {currentEpoch}
        </button>
      </div>
    </div>
  );
}
