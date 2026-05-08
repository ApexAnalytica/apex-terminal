// Ω-Bridge Density — system-level diagnostic metric.
//
// Defined in the dissertation integration plan as:
//
//   Ω-Bridge Density = |χ★(G)| / |E(G)|
//
// (Ghauri 2025 framework integration, 2026-05-07 handoff). The fraction
// of the graph's edges that participate in the load-bearing skeleton.
//
// Interpretation:
//   - 0       → no bridge structure at all (graph is highly redundant;
//               every edge has many shortest-path alternates and no
//               edge is a strict bridge).
//   - 1       → every edge is in χ★ (graph is a tree or near-tree;
//               removing any single edge disconnects something or
//               severely cuts shortest-path flow).
//   - typical → 0.05 ≲ density ≲ 0.30 for "well-connected with some
//               critical chokepoints" — common in real causal graphs.
//
// Defined for all domains (not just AI Safety): it's a property of the
// graph topology, independent of the domain profile. Surfaces in the
// system-metrics dashboard as a single scalar diagnostic.
//
// Computed by delegation to `chiStar` from `./chi-star.ts` — same topK
// convention (default 10% of edges).
//
// O(V · E) dominated by the underlying Brandes step in chiStar.

import type { CausalGraph } from "@/lib/types";
import { chiStar } from "./chi-star";
import type { ChiStarOptions, ChiStarResult } from "./chi-star";

export interface OmegaBridgeDensityOptions extends ChiStarOptions {}

export interface OmegaBridgeDensityResult {
  /** Density = |χ★| / |E|. Scalar in [0, 1]. */
  density: number;
  /** Size of the χ★ set (numerator). */
  chiStarSize: number;
  /** Total edge count in the graph (denominator). */
  edgeCount: number;
  /** Strict-bridges-only fraction = |bridges| / |E|. */
  bridgeFraction: number;
  /**
   * The full χ★ result (bridges, BES map, χ★ list, BES ranking).
   * Returned alongside so callers don't need a second computation if
   * they want to render the breakdown.
   */
  chiStar: ChiStarResult;
}

/**
 * Compute the Ω-Bridge Density of a causal graph.
 *
 * Returns 0 (with `chiStarSize: 0`, `edgeCount: 0`) when the graph has
 * no edges — explicitly defined rather than NaN so the metric is
 * always renderable. Empty-graph density is a meaningful "no bridge
 * structure to measure" reading.
 */
export function omegaBridgeDensity(
  graph: CausalGraph,
  options: OmegaBridgeDensityOptions = {},
): OmegaBridgeDensityResult {
  const result = chiStar(graph, options);
  const edgeCount = graph.edges.length;
  const chiStarSize = result.chiStar.length;
  const bridgeCount = result.bridges.length;

  return {
    density: edgeCount === 0 ? 0 : chiStarSize / edgeCount,
    chiStarSize,
    edgeCount,
    bridgeFraction: edgeCount === 0 ? 0 : bridgeCount / edgeCount,
    chiStar: result,
  };
}
