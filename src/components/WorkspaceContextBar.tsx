"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getStatusColor } from "@/lib/omega-engine";

/**
 * WorkspaceContextBar — the quiet center readout in the header.
 *
 * Replaces the old CDΩ "doomsday monitor" (blinking buffer gauge,
 * fake "Causal Distance" path-length number, RED/AMBER/GREEN alert
 * light, regime label, time-to-failure timer). None of that drove a
 * decision — it just performed urgency. This bar answers two honest
 * questions instead:
 *   - idle: how big is the workspace I'm analyzing, and how many
 *     shock scenarios are live?  →  "312 NODES · 480 EDGES · 1 SHOCK"
 *   - during a cascade replay: how far has it propagated, and what's
 *     the system status right now?  →  "▶ EPOCH 7 / 12 · ELEVATED"
 *
 * No animation, no flashing. Reads its own slice of the store so the
 * header doesn't have to thread omega/doomsday props through.
 */
export default function WorkspaceContextBar() {
  const filteredGraph = useFilteredGraph();
  const shocks = useApexStore((s) => s.shocks);
  const replayActive = useApexStore((s) => s.replayActive);
  const currentEpoch = useApexStore((s) => s.currentEpoch);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const activeTimeline = useApexStore((s) => s.activeTimeline);

  const nodeCount = filteredGraph.nodes.length;
  const edgeCount = filteredGraph.edges.length;
  const shockCount = shocks.length;

  const replayEpochs =
    activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const snapshot =
    replayActive && replayEpochs.length > 0
      ? (replayEpochs[currentEpoch] ?? null)
      : null;

  const statusColor = useMemo(
    () => (snapshot ? getStatusColor(snapshot.omegaStatus) : "var(--text-muted)"),
    [snapshot],
  );

  // Empty workspace: nothing to say. Keep the center clean rather than
  // performing a placeholder.
  if (nodeCount === 0 && !snapshot) return null;

  // ── Active cascade replay: live propagation state ──
  if (snapshot) {
    const total = replayEpochs.length;
    const pct = total > 1 ? (currentEpoch / (total - 1)) * 100 : 0;
    return (
      <div
        className="flex items-center gap-2 lg:gap-3 min-w-0"
        data-tour="workspace-context"
      >
        <span
          className="font-[family-name:var(--font-michroma)] text-[9px] tracking-widest shrink-0"
          style={{ color: statusColor }}
        >
          ▶ REPLAY
        </span>
        <span className="font-mono text-[10px] tabular-nums text-text-muted shrink-0">
          EPOCH {currentEpoch + 1} / {total}
        </span>
        {/* Thin, non-animated progress track */}
        <div className="hidden md:block h-1 w-24 rounded-full bg-border overflow-hidden shrink-0">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${pct}%`, backgroundColor: statusColor }}
          />
        </div>
        {activeTimeline !== "baseline" && (
          <span className="hidden lg:inline font-mono text-[9px] tracking-wider text-accent-amber shrink-0">
            INTERVENTION
          </span>
        )}
        <span
          className="font-[family-name:var(--font-michroma)] text-[9px] tracking-widest shrink-0"
          style={{ color: statusColor }}
        >
          {snapshot.omegaStatus}
        </span>
      </div>
    );
  }

  // ── Idle: workspace size + active scenarios ──
  return (
    <div
      className="flex items-center gap-3 lg:gap-4 min-w-0 text-text-muted"
      data-tour="workspace-context"
    >
      <div className="flex items-baseline gap-1.5 shrink-0">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {nodeCount}
        </span>
        <span className="text-[8px] font-mono tracking-widest">NODES</span>
      </div>
      <span className="text-border-bright hidden sm:inline">·</span>
      <div className="hidden sm:flex items-baseline gap-1.5 shrink-0">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {edgeCount}
        </span>
        <span className="text-[8px] font-mono tracking-widest">EDGES</span>
      </div>
      {shockCount > 0 && (
        <>
          <span className="text-border-bright hidden sm:inline">·</span>
          <div className="flex items-center gap-1.5 shrink-0 rounded border border-accent-amber/40 px-1.5 py-0.5">
            <span className="font-mono text-xs font-bold tabular-nums text-accent-amber">
              {shockCount}
            </span>
            <span className="text-[8px] font-mono tracking-widest text-accent-amber">
              {shockCount === 1 ? "SHOCK" : "SHOCKS"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
