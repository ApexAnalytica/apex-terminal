"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import {
  availableCalculations,
  type CalculationContext,
} from "@/lib/calculations/registry";

// ─── CalculationsPanel ────────────────────────────────────────────────
//
// Right-rail block that runs every calculation in
// CALCULATION_REGISTRY whose `appliesWhen` predicate passes for the
// current context (graph + selected node + active domains). Each row
// renders the calculation's label, scalar value, and supporting
// detail. Tone-coloured dot mirrors AT A GLANCE / REVIEW so the
// three blocks read as a single context-signal column.
//
// "→ DIAL" affordance — calcs that implement `toSnapshot` (node-
// scoped) or `toGraphSnapshot` (graph-wide) get a push button that
// records the current value:
//   - Node-scoped: appends to the selected node's liveData[] via
//     pushCalculationSnapshot — picks up the existing time-series
//     card / TimeDial rendering.
//   - Graph-wide: appends to graphCalcHistory[calc.id] via
//     pushGraphCalcSnapshot — a tiny inline sparkline renders next
//     to the value to show the trajectory.
//
// Renders nothing when no calculations apply, so empty graphs don't
// paint dead chrome.

function toneColor(tone: "amber" | "red" | "green" | undefined): string {
  if (tone === "red") return "#ff1744";
  if (tone === "green") return "#00e676";
  if (tone === "amber") return "#ffab00";
  return "#7c8a99"; // neutral muted
}

function formatScalar(value: number, precision = 2, unit?: string): string {
  const fixed =
    precision === 0
      ? Math.round(value).toLocaleString()
      : value.toFixed(precision);
  return unit ? `${fixed} ${unit}` : fixed;
}

interface InlineSparklineProps {
  history: { value: number }[];
  color: string;
  width?: number;
  height?: number;
}

function InlineSparkline({
  history,
  color,
  width = 48,
  height = 12,
}: InlineSparklineProps) {
  if (history.length < 2) return null;
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (history.length - 1);
  const toY = (v: number) => height - 1 - ((v - min) / range) * (height - 2);
  const points = history
    .map((h, i) => `${(i * stepX).toFixed(1)},${toY(h.value).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      className="flex-shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CalculationsPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const pushCalculationSnapshot = useApexStore(
    (s) => s.pushCalculationSnapshot,
  );
  const pushGraphCalcSnapshot = useApexStore((s) => s.pushGraphCalcSnapshot);
  const graphCalcHistory = useApexStore((s) => s.graphCalcHistory);

  const ctx: CalculationContext = useMemo(
    () => ({
      graph: { nodes: graphData.nodes, edges: graphData.edges },
      selectedNode,
      selectedDomains,
    }),
    [graphData, selectedNode, selectedDomains],
  );

  const rows = useMemo(() => {
    return availableCalculations(ctx)
      .map((calc) => {
        const result = calc.compute(ctx);
        if (!result) return null;
        const nodeSnapshot = calc.toSnapshot?.(result, ctx) ?? null;
        const graphSnapshot = calc.toGraphSnapshot?.(result, ctx) ?? null;
        return { calc, result, nodeSnapshot, graphSnapshot };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [ctx]);

  if (rows.length === 0) return null;

  return (
    <div className="px-2 py-2 mt-1 rounded border border-border bg-surface-elevated/50">
      <div className="flex items-baseline justify-between mb-0.5">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-secondary">
          CALCULATIONS
        </div>
        <div className="text-[7px] font-mono text-text-muted/60">
          {selectedNode ? "node-scoped" : "graph-wide"}
        </div>
      </div>
      <div className="space-y-1 mt-1">
        {rows.map(({ calc, result, nodeSnapshot, graphSnapshot }) => {
          const history = graphCalcHistory[calc.id] ?? [];
          const pushDisabled = !nodeSnapshot && !graphSnapshot;
          const onPush = nodeSnapshot
            ? () =>
                pushCalculationSnapshot(
                  nodeSnapshot.nodeId,
                  nodeSnapshot.point,
                )
            : graphSnapshot
              ? () => pushGraphCalcSnapshot(calc.id, graphSnapshot.value)
              : undefined;
          return (
            <div
              key={calc.id}
              className="text-[9px] font-mono leading-tight flex items-baseline gap-1.5"
              title={calc.description}
            >
              <span
                style={{ color: toneColor(result.tone) }}
                className="text-[8px] leading-none flex-shrink-0"
              >
                ●
              </span>
              <span className="text-text-muted">{calc.name}</span>
              <span className="text-foreground tabular-nums">
                {result.value.kind === "scalar"
                  ? formatScalar(
                      result.value.value,
                      result.value.precision,
                      result.value.unit,
                    )
                  : result.value.value}
              </span>
              {result.detail && (
                <span className="text-text-muted/70 truncate flex-1 min-w-0">
                  — {result.detail}
                </span>
              )}
              {graphSnapshot && history.length >= 2 && (
                <InlineSparkline
                  history={history}
                  color={toneColor(result.tone)}
                />
              )}
              {!pushDisabled && (
                <button
                  onClick={onPush}
                  className="ml-auto flex-shrink-0 text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-0.5 rounded border border-accent-cyan/30 text-accent-cyan/80 hover:text-accent-cyan hover:border-accent-cyan/60 transition-colors"
                  title={
                    nodeSnapshot
                      ? `Push current ${calc.name} value to the selected node's TimeDial history. Each press appends a snapshot.`
                      : `Push current ${calc.name} value to graph-wide history. Each press appends a snapshot; sparkline renders inline once ≥2 entries exist.`
                  }
                >
                  → DIAL
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
