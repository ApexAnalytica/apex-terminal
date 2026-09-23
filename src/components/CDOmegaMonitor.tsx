"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { OmegaState, DoomsdayState, AlertLevel, CausalGraph } from "@/lib/types";
import { getStatusColor } from "@/lib/omega-engine";
import { computeSystemFragility } from "@/lib/omega-system";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { useApexStore } from "@/stores/useApexStore";
import type { TemporalDataset } from "@/lib/temporal-data";

interface CDOmegaMonitorProps {
  state: OmegaState;
  doomsday: DoomsdayState;
  alertLevel: AlertLevel;
}

/** Compute max ΩF composite across all nodes (0-10 scale) */
function computeMaxOmega(graph: CausalGraph): number {
  if (graph.nodes.length === 0) return 0;
  return Math.max(...graph.nodes.map((n) => n.omegaFragility?.composite ?? 0));
}

/**
 * BFS-based average shortest path length across the directed graph.
 * Only counts reachable pairs. Returns 0 for empty/disconnected graphs.
 */
function computeAvgPathLength(graph: CausalGraph): number {
  const { nodes, edges } = graph;
  if (nodes.length <= 1) return 0;

  // Build adjacency list (directed)
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
  }

  let totalDist = 0;
  let pairCount = 0;

  for (const src of nodes) {
    // BFS from src
    const dist = new Map<string, number>();
    dist.set(src.id, 0);
    const queue = [src.id];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      const dv = dist.get(v)!;
      for (const w of adj.get(v) ?? []) {
        if (!dist.has(w)) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
      }
    }
    // Sum distances to all reachable nodes (excluding self)
    for (const [, d] of dist) {
      if (d > 0) {
        totalDist += d;
        pairCount++;
      }
    }
  }

  return pairCount > 0 ? totalDist / pairCount : 0;
}

/** Derive status label from average omega fragility */
function deriveStatusLabel(avgOmega: number): { status: string; color: string } {
  if (avgOmega >= 7) return { status: "CRITICAL", color: "var(--accent-red)" };
  if (avgOmega >= 5) return { status: "ELEVATED", color: "var(--accent-amber)" };
  return { status: "NOMINAL", color: "var(--accent-green)" };
}

/** Derive alert color from average omega */
function deriveAlertColor(avgOmega: number): { level: string; color: string } {
  if (avgOmega >= 7) return { level: "RED", color: "#ff1744" };
  if (avgOmega >= 5) return { level: "AMBER", color: "#ffab00" };
  return { level: "GREEN", color: "#00e676" };
}

/** Format temporal range as human-readable duration */
function formatTemporalRange(
  temporalData: TemporalDataset | null,
  timelineRange: { start: number; end: number }
): string {
  const start = temporalData ? temporalData.rangeStart.getTime() : timelineRange.start;
  const end = temporalData ? temporalData.rangeEnd.getTime() : timelineRange.end;
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (days >= 365) return `T-${Math.round(days / 365)}y`;
  return `T-${days}d`;
}

export default function CDOmegaMonitor({
  state,
  doomsday,
  alertLevel,
}: CDOmegaMonitorProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const filteredGraph = useFilteredGraph();
  const temporalData = useApexStore((s) => s.temporalData);
  const timelineRange = useApexStore((s) => s.timelineRange);

  const hasNodes = filteredGraph.nodes.length > 0;

  // System-level ΩF (ΩSF/ΩSX/contagion/buffer). The status badge, buffer bar
  // and regime now derive from the throughput-weighted ΩSF rather than an
  // unweighted mean of composites — the principled system metric.
  const sys = useMemo(() => computeSystemFragility(filteredGraph), [filteredGraph]);
  const avgOmega = sys.omegaSF;
  const maxOmega = useMemo(() => computeMaxOmega(filteredGraph), [filteredGraph]);
  // computeAvgPathLength does BFS from every node (APSP) — O(N·(N+E)),
  // ~121K ops on the default ~350-node graph. It used to run
  // synchronously on every filteredGraph reference flip, which on
  // LAUNCH WORKSPACE landed in the same tick as the canvas mount and
  // on feed ticks would block any concurrent input. The displayed
  // value is just a number rounded to 1-2 decimals, so a one-frame
  // stale read is fine. `useDeferredValue` reuses the same pattern
  // already in StructuralMetrics for omega-bridge-density.
  const deferredGraph = useDeferredValue(filteredGraph);
  const avgPathLen = useMemo(() => computeAvgPathLength(deferredGraph), [deferredGraph]);
  const omegaPct = useMemo(() => (hasNodes ? (avgOmega / 10) * 100 : 100), [avgOmega, hasNodes]);
  const derivedStatus = useMemo(() => (hasNodes ? deriveStatusLabel(avgOmega) : { status: "NOMINAL", color: "var(--accent-green)" }), [avgOmega, hasNodes]);
  const derivedAlert = useMemo(() => (hasNodes ? deriveAlertColor(avgOmega) : { level: "GREEN", color: "#00e676" }), [avgOmega, hasNodes]);
  const temporalLabel = useMemo(() => formatTemporalRange(temporalData, timelineRange), [temporalData, timelineRange]);
  const regimeLabel = useMemo(() => {
    if (!hasNodes) return "STABLE";
    if (avgOmega >= 8) return "CRASH";
    if (avgOmega >= 6) return "PHASE TRANSITION";
    if (avgOmega >= 4) return "MELT UP";
    if (avgOmega >= 2) return "STAGNATION";
    return "STABLE";
  }, [avgOmega, hasNodes]);

  // Use graph-derived omega for the buffer bar when nodes are loaded,
  // otherwise fall back to the shock-based state
  const bufferValue = hasNodes ? Math.max(0, Math.min(100, 100 - omegaPct)) : state.buffer;
  const displayColor = hasNodes ? derivedStatus.color : getStatusColor(state.status);

  const segments = 40;
  const filledSegments = Math.round((bufferValue / 100) * segments);

  const nodeCount = filteredGraph.nodes.length;
  const edgeCount = filteredGraph.edges.length;

  // Secondary metrics for overflow menu on small screens
  const secondaryMetrics = [
    { label: "ΩSF", value: hasNodes ? sys.omegaSF.toFixed(1) : "—" },
    { label: "ΩSX", value: hasNodes ? sys.omegaSX.toFixed(1) : "—" },
    { label: "CONTAGION", value: hasNodes ? String(sys.contagionRadius) : "—" },
    { label: "BUFFER", value: hasNodes ? `${sys.bufferHorizon}e` : "—" },
    { label: "AVG PATH", value: avgPathLen.toFixed(2) },
    { label: "MAX ΩF", value: maxOmega.toFixed(1) },
    { label: "DENSITY", value: (filteredGraph.metadata.density * 100).toFixed(1) + "%" },
    { label: "RANGE", value: temporalLabel },
    { label: "REGIME", value: regimeLabel },
    { label: "NODES", value: String(nodeCount) },
    { label: "EDGES", value: String(edgeCount) },
  ];

  return (
    <div className="flex items-center gap-3 lg:gap-6 relative min-w-0" data-tour="cd-omega">
      {/* Causal Distance — average path length */}
      <div className="flex flex-col items-end shrink-0">
        <span
          className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] uppercase hidden xl:block"
          style={{ color: "var(--text-muted)" }}
        >
          Causal Distance
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-[family-name:var(--font-michroma)] text-lg font-bold tracking-wider"
            style={{ color: displayColor }}
          >
            CD&Omega;
          </span>
          <span
            className="font-mono text-sm font-bold tabular-nums hidden md:inline"
            style={{ color: displayColor }}
          >
            {hasNodes ? avgPathLen.toFixed(1) : "—"}
          </span>
        </div>
      </div>

      {/* Buffer Bar — hidden below md */}
      <div className="hidden md:flex flex-col gap-1 shrink-0">
        <div className="flex gap-[2px]">
          {Array.from({ length: segments }).map((_, i) => {
            const filled = i < filledSegments;
            const segColor =
              i < segments * 0.15
                ? "var(--accent-red)"
                : i < segments * 0.35
                  ? "var(--accent-amber)"
                  : "var(--accent-green)";
            const isCritical =
              filled && derivedStatus.status === "CRITICAL";
            return (
              <div
                key={i}
                className="h-4 w-[6px] rounded-[1px] hidden sm:block"
                style={{
                  backgroundColor: filled ? segColor : "var(--border)",
                  opacity: filled ? 1 : 0.3,
                  animation: isCritical
                    ? "omega-segment-critical 0.5s ease-in-out infinite"
                    : undefined,
                }}
              />
            );
          })}
        </div>
        {/* Buffer bar caption row. The third cell used to repeat the
            derived status (ELEVATED / CRITICAL / SAFE) which the Status
            Badge to the right already shows in larger type — duplicate
            text in tight header space, called out by the user as filler.
            Dropped; the Ω marker + percentage are the non-redundant
            pieces and stay. */}
        <div className="flex justify-between">
          <span className="text-[9px] font-mono" style={{ color: "var(--accent-red)" }}>
            &Omega;
          </span>
          <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
            {hasNodes ? `${omegaPct.toFixed(1)}%` : `${state.buffer.toFixed(1)}%`}
          </span>
        </div>
      </div>

      {/* Status Badge — always visible. CSS keyframe replaces a
          framer-motion animate prop; `--alert-color` lets the keyframe
          flash between displayColor and transparent without the JS
          animation runtime. */}
      <div
        className="flex items-center gap-2 rounded border px-2 lg:px-3 py-1.5 shrink-0"
        style={{
          borderColor: displayColor,
          backgroundColor: `color-mix(in srgb, ${displayColor} 8%, transparent)`,
          ["--alert-color" as string]: displayColor,
          animation:
            derivedStatus.status === "CRITICAL"
              ? "omega-badge-critical 1s ease-in-out infinite"
              : undefined,
        }}
      >
        <div
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: displayColor }}
        />
        <span
          className="font-[family-name:var(--font-michroma)] text-[10px] tracking-widest"
          style={{ color: displayColor }}
        >
          {derivedStatus.status}
        </span>
      </div>

      {/* Shock Count — hidden below sm */}
      <div className="hidden sm:flex flex-col items-center shrink-0">
        <span
          className="font-mono text-xl font-bold tabular-nums"
          style={{ color: state.shocks.length > 0 ? "var(--accent-red)" : displayColor }}
        >
          {state.shocks.length}
        </span>
        <span className="text-[9px] text-text-muted tracking-wider">
          SHOCKS
        </span>
      </div>

      {/* Node / Edge Counts — hidden below lg */}
      <div className="hidden lg:flex items-center gap-3 shrink-0">
        <div className="flex flex-col items-center">
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
            {nodeCount}
          </span>
          <span className="text-[8px] text-text-muted tracking-wider">NODES</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
            {edgeCount}
          </span>
          <span className="text-[8px] text-text-muted tracking-wider">EDGES</span>
        </div>
      </div>

      {/* System-level ΩF — ΩSF (throughput-weighted) + ΩSX (exposure-weighted).
          The principled aggregations of node ΩF; hidden below lg. */}
      <div className="hidden lg:flex items-center gap-3 shrink-0" title="ΩSF: throughput-weighted system fragility · ΩSX: exposure-weighted (concentration) system fragility">
        <div className="flex flex-col items-center">
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: displayColor }}>
            {hasNodes ? sys.omegaSF.toFixed(1) : "—"}
          </span>
          <span className="text-[8px] text-text-muted tracking-wider">ΩSF</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
            {hasNodes ? sys.omegaSX.toFixed(1) : "—"}
          </span>
          <span className="text-[8px] text-text-muted tracking-wider">ΩSX</span>
        </div>
      </div>

      {/* Alert Level + Doomsday — hidden below xl */}
      <div className="hidden xl:flex flex-col items-center gap-0.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: derivedAlert.color,
              boxShadow: derivedAlert.level === "RED" ? "0 0 6px #ff1744" : "none",
            }}
          />
          <span
            className="text-[9px] font-mono font-bold tracking-wider"
            style={{ color: derivedAlert.color }}
          >
            {derivedAlert.level}
          </span>
        </div>
        <span
          className="text-[9px] font-mono tabular-nums"
          style={{ color: doomsday.timeToFailureDays < 30 ? "#ff1744" : "var(--text-muted)" }}
        >
          {temporalLabel}
        </span>
        <span className="text-[7px] font-mono text-text-muted">
          {regimeLabel}
        </span>
      </div>

      {/* Overflow menu for collapsed metrics on small screens */}
      <div className="lg:hidden relative shrink-0">
        <button
          onClick={() => setOverflowOpen(!overflowOpen)}
          className="flex items-center justify-center w-7 h-7 rounded border border-border text-[11px] font-mono text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors"
          title="More metrics"
        >
          &hellip;
        </button>
        {overflowOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOverflowOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 bg-surface-elevated border border-border rounded shadow-lg p-3 min-w-[160px]">
              {/* Alert level */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: derivedAlert.color,
                    boxShadow: derivedAlert.level === "RED" ? "0 0 6px #ff1744" : "none",
                  }}
                />
                <span
                  className="text-[9px] font-mono font-bold tracking-wider"
                  style={{ color: derivedAlert.color }}
                >
                  {derivedAlert.level}
                </span>
              </div>
              {secondaryMetrics.map((m) => (
                <div key={m.label} className="flex justify-between items-center py-1">
                  <span className="text-[8px] font-mono text-text-muted tracking-wider">
                    {m.label}
                  </span>
                  <span className="text-[9px] font-mono text-foreground tabular-nums">
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
