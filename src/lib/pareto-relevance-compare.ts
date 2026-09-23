// Cross-estimator comparison helper for the relevance composite.
//
// Each CriticalityCard renders its own F·E·G·S·M breakdown via
// `RelevanceBreakdown` (see pareto-relevance.ts). That answers "what does
// this estimator's score decompose into" — but not "why is THIS estimator
// ranked the way it is among its siblings."
//
// This module takes the batch `Map<estimatorId, RelevanceBreakdown>` already
// computed in ParetoPanel and produces, per estimator:
//
//   - rank / total — composite-sorted position in the cohort
//   - sibling averages per dimension — the mean over the OTHER estimators
//     (excludes self so the comparison isn't biased)
//   - deltas per dimension — this estimator minus the sibling average
//   - winning / lagging dimension — the dim where this estimator is most
//     above / below the sibling average
//
// The card UI then surfaces "rank #1 of 4 · winning F (+0.43)" or
// "lagging G (−0.31)" as the inline reason-for-rank badge.
//
// M (Moran's I) is a system-wide property in `computeRelevanceBatch` — every
// estimator in the cohort shares the same value, so its delta is always 0
// and it can never be the deciding dimension. No special-case needed: the
// argmax/argmin naturally skip it once any other dim has a non-zero delta.

import type { RelevanceBreakdown } from "./pareto-relevance";

export type DimCode = "F" | "E" | "G" | "S" | "M";

export const DIM_CODES: readonly DimCode[] = ["F", "E", "G", "S", "M"] as const;

export interface RelevanceCompareEntry {
  /** 1-indexed rank by composite (1 = highest). Ties broken by insertion order. */
  rank: number;
  /** Total estimators in the cohort. */
  total: number;
  /** Mean score per dimension across the OTHER estimators (excludes self). */
  siblingAvg: Record<DimCode, number>;
  /** This estimator's score minus siblingAvg per dimension. */
  delta: Record<DimCode, number>;
  /**
   * Dimension where this estimator is most above the sibling average.
   * Undefined when total === 1 (no siblings to compare against) or when
   * every delta is zero.
   */
  winningDim?: DimCode;
  /**
   * Dimension where this estimator is most below the sibling average.
   * Undefined when total === 1 or every delta is zero.
   */
  laggingDim?: DimCode;
}

/**
 * Build per-estimator cross-comparison entries from a relevance batch.
 *
 * Ranking uses `composite` (the post-EMA smoothed value) so a card's rank
 * matches the value it displays in its headline. Sibling averages and deltas
 * use the per-dimension `score` fields (not EMA-smoothed — there's no
 * smoothing applied to sub-scores).
 */
export function computeRelevanceCompare(
  relevanceMap: Map<string, RelevanceBreakdown>,
): Map<string, RelevanceCompareEntry> {
  const out = new Map<string, RelevanceCompareEntry>();
  const total = relevanceMap.size;
  if (total === 0) return out;

  // Sort by composite desc, then stable on insertion order.
  const ranked = [...relevanceMap.entries()].sort(
    (a, b) => b[1].composite - a[1].composite,
  );
  const rankById = new Map<string, number>();
  ranked.forEach(([id], i) => rankById.set(id, i + 1));

  // Per-dim totals across the whole cohort. Sibling-avg per estimator is then
  // (totalSum − selfScore) / (total − 1), avoiding an O(n²) pass.
  const cohortSum: Record<DimCode, number> = { F: 0, E: 0, G: 0, S: 0, M: 0 };
  for (const [, b] of relevanceMap) {
    cohortSum.F += b.F.score;
    cohortSum.E += b.E.score;
    cohortSum.G += b.G.score;
    cohortSum.S += b.S.score;
    cohortSum.M += b.M.score;
  }

  for (const [id, b] of relevanceMap) {
    const siblingCount = total - 1;
    const siblingAvg: Record<DimCode, number> =
      siblingCount > 0
        ? {
            F: (cohortSum.F - b.F.score) / siblingCount,
            E: (cohortSum.E - b.E.score) / siblingCount,
            G: (cohortSum.G - b.G.score) / siblingCount,
            S: (cohortSum.S - b.S.score) / siblingCount,
            M: (cohortSum.M - b.M.score) / siblingCount,
          }
        : { F: 0, E: 0, G: 0, S: 0, M: 0 };

    // When there are no siblings, the comparison is undefined — emit zero
    // deltas (rather than self − 0) so the UI doesn't render a nonsensical
    // "+0.50" badge on a solo card.
    const delta: Record<DimCode, number> =
      siblingCount > 0
        ? {
            F: b.F.score - siblingAvg.F,
            E: b.E.score - siblingAvg.E,
            G: b.G.score - siblingAvg.G,
            S: b.S.score - siblingAvg.S,
            M: b.M.score - siblingAvg.M,
          }
        : { F: 0, E: 0, G: 0, S: 0, M: 0 };

    let winningDim: DimCode | undefined;
    let laggingDim: DimCode | undefined;
    if (siblingCount > 0) {
      // Tie-break by DIM_CODES order so the result is deterministic.
      let bestDelta = -Infinity;
      let worstDelta = Infinity;
      for (const dim of DIM_CODES) {
        if (delta[dim] > bestDelta) {
          bestDelta = delta[dim];
          winningDim = dim;
        }
        if (delta[dim] < worstDelta) {
          worstDelta = delta[dim];
          laggingDim = dim;
        }
      }
      // If every delta is exactly 0 (e.g. all cards have identical scores —
      // unlikely but possible in synthetic data), the dim labels carry no
      // information. Suppress them so the UI hides the badge subtitle.
      if (bestDelta === 0 && worstDelta === 0) {
        winningDim = undefined;
        laggingDim = undefined;
      }
    }

    out.set(id, {
      rank: rankById.get(id) ?? total,
      total,
      siblingAvg,
      delta,
      winningDim,
      laggingDim,
    });
  }

  return out;
}
