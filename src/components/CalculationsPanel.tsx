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
// Renders nothing when no calculations apply, so we don't paint
// dead chrome on empty graphs.

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

export default function CalculationsPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedDomains = useApexStore((s) => s.selectedDomains);

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
        return { calc, result };
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
        {rows.map(({ calc, result }) => (
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
              <span className="text-text-muted/70 truncate">
                — {result.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
