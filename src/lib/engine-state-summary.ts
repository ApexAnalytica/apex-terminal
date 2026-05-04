/**
 * Engine-state summary — pure function that aggregates the live state of
 * every Manifold engine into one structured object. Designed for:
 *
 *   - Copilot routing (#14): when the user asks "what's the state of the
 *     graph right now," the copilot reads from this rather than groping
 *     at half a dozen separate stores.
 *   - Future status panels / `/api/engine/status` style monitoring
 *     surfaces.
 *   - Debugging — single call gives a readable snapshot of what every
 *     engine sub-system is doing.
 *
 * No side effects, no imports of UI components, no rendering — pure data.
 */
import type { CausalGraph, CausalNode } from "@/lib/types";
import { getLiveSignal } from "@/lib/types";
import type { TarskiValidationReport } from "@/lib/tarski-data";
import { feedModeFromSource, type FeedMode } from "@/lib/feeds/display";

export interface FeedSummaryEntry {
  /** Distinct kind across all liveData[] entries on the graph. */
  kind: string;
  /** Mode resolved from the most recent matching liveData's source string. */
  mode: FeedMode;
  /** Number of nodes carrying a live signal of this kind. */
  nodeCount: number;
  /** Most-recent observedAt across nodes carrying this kind. */
  latestObservedAt: string | null;
}

export interface TarskiStateSummary {
  /** Whether validation is currently active (truthFilter === "verified"). */
  active: boolean;
  /** Total number of inconsistent edges flagged. */
  inconsistentEdgeCount: number;
  /** Total number of nodes flagged restricted. */
  restrictedNodeCount: number;
  /** Total proof traces. */
  proofTraceCount: number;
  /** Per-axiom violation counts. Sorted descending. */
  violationsByAxiom: Array<{ axiomId: string; count: number }>;
}

export interface PillarOverlaySummary {
  /** Nodes whose jurisdictionalHazard was elevated by a live overlay. */
  nodesWithJDelta: number;
  /** Nodes whose cascadeLoad was elevated by a live overlay. */
  nodesWithCDelta: number;
  /** Sum of all positive J deltas (in ΩF units). */
  totalJDelta: number;
  /** Sum of all positive C deltas (in ΩF units). */
  totalCDelta: number;
}

export interface EngineStateSummary {
  /** Current graph metadata. */
  graph: {
    nodeCount: number;
    edgeCount: number;
    density: number;
  };
  /** One entry per distinct liveData kind currently on the graph. */
  feeds: FeedSummaryEntry[];
  /** Tarski validator state. */
  tarski: TarskiStateSummary;
  /** ΩF pillar overlay aggregate (Tarski → J + Spirtes-metrics → C). */
  pillars: PillarOverlaySummary;
  /** ISO-8601 — when this summary was computed. */
  computedAt: string;
}

/**
 * Build a feed summary by walking nodes' liveData[] arrays. Distinct kinds
 * are listed once with the count of nodes carrying that kind and the
 * most-recent observation timestamp.
 */
export function summarizeFeeds(
  nodes: ReadonlyArray<CausalNode>,
): FeedSummaryEntry[] {
  // kind → { nodeCount, latestObservedAt, latestSource }
  const byKind = new Map<
    string,
    { nodeCount: number; latestObservedAt: string; latestSource: string }
  >();
  for (const n of nodes) {
    if (!n.liveData) continue;
    for (const p of n.liveData) {
      const existing = byKind.get(p.kind);
      if (!existing) {
        byKind.set(p.kind, {
          nodeCount: 1,
          latestObservedAt: p.observedAt,
          latestSource: p.source,
        });
      } else {
        existing.nodeCount += 1;
        if (p.observedAt > existing.latestObservedAt) {
          existing.latestObservedAt = p.observedAt;
          existing.latestSource = p.source;
        }
      }
    }
  }
  const entries: FeedSummaryEntry[] = [];
  for (const [kind, info] of byKind.entries()) {
    entries.push({
      kind,
      mode: feedModeFromSource(info.latestSource, info.latestObservedAt),
      nodeCount: info.nodeCount,
      latestObservedAt: info.latestObservedAt,
    });
  }
  // Stable ordering: alphabetical by kind so sequential summaries are
  // comparable.
  entries.sort((a, b) => a.kind.localeCompare(b.kind));
  return entries;
}

/**
 * Build a Tarski state summary from a validation report. When the report
 * is null, returns the inactive shape (active: false, all counts 0).
 */
export function summarizeTarski(
  report: TarskiValidationReport | null,
): TarskiStateSummary {
  if (!report) {
    return {
      active: false,
      inconsistentEdgeCount: 0,
      restrictedNodeCount: 0,
      proofTraceCount: 0,
      violationsByAxiom: [],
    };
  }
  // Tally per-axiom violations from proofTraces (each trace can list >1 axiom).
  const counts = new Map<string, number>();
  for (const t of report.proofTraces) {
    for (const axiomId of t.violatedAxioms) {
      counts.set(axiomId, (counts.get(axiomId) ?? 0) + 1);
    }
  }
  const violationsByAxiom = Array.from(counts.entries())
    .map(([axiomId, count]) => ({ axiomId, count }))
    .sort((a, b) => b.count - a.count || a.axiomId.localeCompare(b.axiomId));
  return {
    active: true,
    inconsistentEdgeCount: report.inconsistentEdgeIds.size,
    restrictedNodeCount: report.restrictedNodeIds.size,
    proofTraceCount: report.proofTraces.length,
    violationsByAxiom,
  };
}

/**
 * Aggregate the per-node `liveAdjustments` overlays into a graph-level
 * pillar summary.
 */
export function summarizePillarOverlays(
  nodes: ReadonlyArray<CausalNode>,
): PillarOverlaySummary {
  let nodesWithJDelta = 0;
  let nodesWithCDelta = 0;
  let totalJDelta = 0;
  let totalCDelta = 0;
  for (const n of nodes) {
    const adj = n.liveAdjustments;
    if (!adj) continue;
    if (adj.jurisdictionalHazardDelta && adj.jurisdictionalHazardDelta > 0) {
      nodesWithJDelta += 1;
      totalJDelta += adj.jurisdictionalHazardDelta;
    }
    if (adj.cascadeLoadDelta && adj.cascadeLoadDelta > 0) {
      nodesWithCDelta += 1;
      totalCDelta += adj.cascadeLoadDelta;
    }
  }
  return {
    nodesWithJDelta,
    nodesWithCDelta,
    totalJDelta: round2(totalJDelta),
    totalCDelta: round2(totalCDelta),
  };
}

/**
 * Top-level engine summary — composes feeds + tarski + pillars + graph.
 * Pure function; consumers (copilot, /api/engine/status, debug panels)
 * call this with the current store state.
 */
export function summarizeEngineState(
  graph: CausalGraph,
  tarskiReport: TarskiValidationReport | null,
): EngineStateSummary {
  return {
    graph: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      density: round3(graph.metadata.density),
    },
    feeds: summarizeFeeds(graph.nodes),
    tarski: summarizeTarski(tarskiReport),
    pillars: summarizePillarOverlays(graph.nodes),
    computedAt: new Date().toISOString(),
  };
}

/** Render an EngineStateSummary as a copilot-friendly plain-text block.
 *  Intended for inclusion in copilot prompts when the user asks about
 *  graph state. */
export function renderEngineStateText(s: EngineStateSummary): string {
  const lines: string[] = [];
  lines.push(`Graph: ${s.graph.nodeCount} nodes, ${s.graph.edgeCount} edges, density ${s.graph.density}`);
  if (s.feeds.length === 0) {
    lines.push("Live feeds: none attached.");
  } else {
    lines.push(
      `Live feeds: ${s.feeds.length} kind${s.feeds.length === 1 ? "" : "s"} attached`,
    );
    for (const f of s.feeds) {
      lines.push(`  · ${f.kind} (${f.mode}): ${f.nodeCount} node${f.nodeCount === 1 ? "" : "s"}`);
    }
  }
  if (s.tarski.active) {
    lines.push(
      `Tarski: VERIFIED · ${s.tarski.proofTraceCount} proof traces · ${s.tarski.inconsistentEdgeCount} inconsistent edges · ${s.tarski.restrictedNodeCount} restricted nodes`,
    );
    for (const v of s.tarski.violationsByAxiom.slice(0, 5)) {
      lines.push(`  · ${v.axiomId}: ${v.count} violation${v.count === 1 ? "" : "s"}`);
    }
  } else {
    lines.push("Tarski: RAW (no validation pass active).");
  }
  if (s.pillars.nodesWithJDelta + s.pillars.nodesWithCDelta > 0) {
    lines.push(
      `Pillar overlays: ${s.pillars.nodesWithJDelta} nodes J-elevated (+${s.pillars.totalJDelta} ΩF), ${s.pillars.nodesWithCDelta} nodes C-elevated (+${s.pillars.totalCDelta} ΩF)`,
    );
  }
  return lines.join("\n");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
