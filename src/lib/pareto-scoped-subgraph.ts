/**
 * Scoped-subgraph helpers for F·E·G·S·M relevance.
 *
 * The Pareto relevance composite is per-selection (per the 2026-05-03
 * "it can change based off of what the user selects using the Lasso
 * tool" directive). F and E honor the lasso via `scopedOmegaSeries`;
 * G, S, and M historically used the full graph and made the composite
 * only partially reactive. These helpers — extracted from inline
 * `useMemo` so the math is testable — restrict the topology inputs to
 * the user's selection (or top-N fallback when no selection is active).
 *
 * Symmetric with the broader pattern:
 *  - `scopedNodeIds` is the source of truth for "what's in scope"
 *  - `inducedEdgeCount` answers G/S's "how many edges?" question
 *  - `buildScopedAdjacency` answers M's "what's the neighbour
 *    structure?" question
 *
 * Both helpers honor `isSevered` so the post-cut analysis reflects the
 * topology the analyst is actually working with, not the pristine graph.
 */

import type { CausalEdge } from "@/lib/types";

/**
 * Count edges that live entirely inside the scoped node set.
 *
 * Both endpoints must be in `scopedNodeIds`; severed edges are skipped
 * so a cut-applied analysis sees the post-cut edge count, not the
 * pristine baseline. This is what S (`trajectorySufficiency`) consumes.
 *
 * Edge cases:
 *  - Empty scope → 0 (sufficiency saturates downward gracefully)
 *  - All edges severed → 0
 *  - Self-loop in scope → counted once (matches pre-extraction behaviour)
 */
export function inducedEdgeCount(
  edges: ReadonlyArray<CausalEdge>,
  scopedNodeIds: ReadonlyArray<string>,
): number {
  if (scopedNodeIds.length === 0) return 0;
  const set = new Set(scopedNodeIds);
  let count = 0;
  for (const e of edges) {
    if (e.isSevered) continue;
    if (set.has(e.source) && set.has(e.target)) count++;
  }
  return count;
}

/**
 * Build a row-normalised binary adjacency matrix over the scoped node
 * set, in `scopedNodeIds` order. Used as the spatial-consistency input
 * for M (`spatialConsistency` + Moran's I).
 *
 * The matrix is symmetric (each edge sets both `W[i][j]` and `W[j][i]`)
 * before row-normalisation, matching the standalone Moran card's
 * conventions exactly so M and the Moran card always agree.
 *
 * Severed edges are skipped. Rows with no neighbours stay zero — Moran's
 * I handles the degenerate S₀ = 0 case by returning a neutral result,
 * so we don't need to special-case it here.
 *
 * Returned shape: `number[][]` of size `scopedNodeIds.length` square.
 */
export function buildScopedAdjacency(
  edges: ReadonlyArray<CausalEdge>,
  scopedNodeIds: ReadonlyArray<string>,
): number[][] {
  const n = scopedNodeIds.length;
  const W: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  if (n === 0) return W;

  // Precompute id → row-index once so the per-edge inner loop is O(1)
  // instead of O(n) (matters for the 348-edge geopolitical graph).
  const idx = new Map<string, number>();
  for (let i = 0; i < n; i++) idx.set(scopedNodeIds[i], i);

  for (const e of edges) {
    if (e.isSevered) continue;
    const si = idx.get(e.source);
    const ti = idx.get(e.target);
    if (si === undefined || ti === undefined) continue;
    W[si][ti] = 1;
    W[ti][si] = 1;
  }

  // Row-normalise so each row sums to 1 (or stays 0 for isolated nodes).
  // This is the canonical Moran-input form; `spatialConsistency` does
  // not re-normalise, so the helper must.
  for (let i = 0; i < n; i++) {
    const rowSum = W[i].reduce((a, b) => a + b, 0);
    if (rowSum > 0) {
      for (let j = 0; j < n; j++) W[i][j] /= rowSum;
    }
  }
  return W;
}
