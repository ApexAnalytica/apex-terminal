import { describe, it, expect } from "vitest";
import {
  computeRelevanceCompare,
  DIM_CODES,
  type DimCode,
} from "../pareto-relevance-compare";
import type { RelevanceBreakdown, SubScore } from "../pareto-relevance";

// ─── Fixtures ─────────────────────────────────────────────────────────

function sub(score: number, detail = "test"): SubScore {
  return { score, detail };
}

function breakdown(scores: Record<DimCode, number>): RelevanceBreakdown {
  // Composite uses the existing formula: S · G · M · (0.6·F + 0.4·E).
  const raw =
    scores.S *
    scores.G *
    scores.M *
    (0.6 * scores.F + 0.4 * scores.E);
  return {
    F: sub(scores.F),
    E: sub(scores.E),
    G: sub(scores.G),
    S: sub(scores.S),
    M: sub(scores.M),
    rawComposite: raw,
    composite: raw,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("computeRelevanceCompare", () => {
  it("returns an empty map for an empty input", () => {
    const out = computeRelevanceCompare(new Map());
    expect(out.size).toBe(0);
  });

  it("ranks single-entry cohort as #1 of 1 with no winning/lagging dim", () => {
    const map = new Map<string, RelevanceBreakdown>([
      ["a", breakdown({ F: 0.5, E: 0.5, G: 0.5, S: 0.5, M: 0.5 })],
    ]);
    const out = computeRelevanceCompare(map);
    const a = out.get("a")!;
    expect(a.rank).toBe(1);
    expect(a.total).toBe(1);
    expect(a.winningDim).toBeUndefined();
    expect(a.laggingDim).toBeUndefined();
    // Deltas should be zero (no siblings).
    for (const d of DIM_CODES) expect(a.delta[d]).toBe(0);
  });

  it("ranks composites descending and identifies winning/lagging dims", () => {
    // Three estimators. A is the F-leader, C is the F-laggard.
    const map = new Map<string, RelevanceBreakdown>([
      ["A", breakdown({ F: 0.9, E: 0.5, G: 0.8, S: 0.8, M: 0.8 })],
      ["B", breakdown({ F: 0.5, E: 0.5, G: 0.8, S: 0.8, M: 0.8 })],
      ["C", breakdown({ F: 0.1, E: 0.5, G: 0.8, S: 0.8, M: 0.8 })],
    ]);
    const out = computeRelevanceCompare(map);

    expect(out.get("A")!.rank).toBe(1);
    expect(out.get("B")!.rank).toBe(2);
    expect(out.get("C")!.rank).toBe(3);

    // A wins on F: 0.9 vs sibling mean of (0.5+0.1)/2 = 0.3, delta +0.6.
    expect(out.get("A")!.winningDim).toBe("F");
    expect(out.get("A")!.delta.F).toBeCloseTo(0.6, 5);

    // C lags on F: 0.1 vs sibling mean (0.9+0.5)/2 = 0.7, delta -0.6.
    expect(out.get("C")!.laggingDim).toBe("F");
    expect(out.get("C")!.delta.F).toBeCloseTo(-0.6, 5);
  });

  it("zeroes out M deltas when M is shared across the cohort", () => {
    // M is a system-wide property — every estimator gets the same value
    // from computeRelevanceBatch. Compare-helper must reflect that the M
    // dimension can never be the deciding one.
    const M = 0.7;
    const map = new Map<string, RelevanceBreakdown>([
      ["A", breakdown({ F: 0.9, E: 0.5, G: 0.6, S: 0.7, M })],
      ["B", breakdown({ F: 0.5, E: 0.5, G: 0.6, S: 0.7, M })],
      ["C", breakdown({ F: 0.1, E: 0.5, G: 0.6, S: 0.7, M })],
    ]);
    const out = computeRelevanceCompare(map);

    for (const id of ["A", "B", "C"] as const) {
      // Float-precision noise from sum-minus-self can leave a 1e-16 residual;
      // anything below 1e-10 is numerically zero for our purposes.
      expect(out.get(id)!.delta.M).toBeCloseTo(0, 10);
    }
    // A still wins on F, not M.
    expect(out.get("A")!.winningDim).toBe("F");
  });

  it("suppresses dim labels when every delta is zero (degenerate identical cohort)", () => {
    const same = { F: 0.5, E: 0.5, G: 0.5, S: 0.5, M: 0.5 };
    const map = new Map<string, RelevanceBreakdown>([
      ["A", breakdown(same)],
      ["B", breakdown(same)],
    ]);
    const out = computeRelevanceCompare(map);
    expect(out.get("A")!.winningDim).toBeUndefined();
    expect(out.get("A")!.laggingDim).toBeUndefined();
  });

  it("breaks dim-tie deterministically by DIM_CODES order", () => {
    // A and B identical except both F and E lead by the same delta on A.
    // Tie-break should pick F (first in DIM_CODES).
    const map = new Map<string, RelevanceBreakdown>([
      ["A", breakdown({ F: 0.8, E: 0.8, G: 0.5, S: 0.5, M: 0.5 })],
      ["B", breakdown({ F: 0.2, E: 0.2, G: 0.5, S: 0.5, M: 0.5 })],
    ]);
    const out = computeRelevanceCompare(map);
    expect(out.get("A")!.winningDim).toBe("F");
  });

  it("sibling averages exclude self (so a leader doesn't drag its own average down)", () => {
    const map = new Map<string, RelevanceBreakdown>([
      ["A", breakdown({ F: 1.0, E: 0.5, G: 0.5, S: 0.5, M: 0.5 })],
      ["B", breakdown({ F: 0.0, E: 0.5, G: 0.5, S: 0.5, M: 0.5 })],
      ["C", breakdown({ F: 0.0, E: 0.5, G: 0.5, S: 0.5, M: 0.5 })],
    ]);
    const out = computeRelevanceCompare(map);
    // A's siblingAvg for F should be (0+0)/2 = 0, NOT (1+0+0)/3 = 0.333.
    expect(out.get("A")!.siblingAvg.F).toBe(0);
    expect(out.get("A")!.delta.F).toBe(1.0);
  });
});
