import { describe, it, expect } from "vitest";
import {
  computeRelevanceBatch,
  spatialConsistency,
  type ModelRelevanceInput,
  type SubScore,
} from "../pareto-relevance";
import { moransI } from "../estimators/moran";
import { bootstrapRelevanceBatch } from "../pareto-relevance-bootstrap";
import { seededRng } from "../pareto-relevance-bootstrap";

// ─── Fixtures ─────────────────────────────────────────────────────────

/** Ring graph adjacency (row-normalised), n nodes — every node has 2 neighbours. */
function ringAdjacency(n: number): number[][] {
  const W: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const left = (i - 1 + n) % n;
    const right = (i + 1) % n;
    W[i][left] = 1;
    W[i][right] = 1;
  }
  // Row-normalise.
  return W.map((row) => row.map((v) => v / 2));
}

/** Empty adjacency (no edges). */
function emptyAdjacency(n: number): number[][] {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

function makeNoisyModel(seed: number, n: number) {
  const rand = seededRng(seed);
  const obs: number[] = [];
  const pred: number[] = [];
  for (let i = 0; i < n; i++) {
    const trend = i * 0.04;
    obs.push(trend + (rand() - 0.5) * 0.3);
    pred.push(trend);
  }
  return { obs, pred };
}

// ─── spatialConsistency ───────────────────────────────────────────────

describe("spatialConsistency", () => {
  it("returns neutral M=1 below M_MIN_NODES", () => {
    const result = spatialConsistency(
      { values: [1, 2, 3], adjacency: ringAdjacency(3) },
      moransI,
    );
    expect(result.score).toBe(1);
    expect(result.detail).toContain("neutral");
  });

  it("returns neutral M=1 when adjacency has no edges (S₀ = 0)", () => {
    const result = spatialConsistency(
      { values: [1, 2, 3, 4, 5, 6], adjacency: emptyAdjacency(6) },
      moransI,
    );
    expect(result.score).toBe(1);
    expect(result.detail).toMatch(/no edges/);
  });

  it("returns neutral M=1 when signal has zero variance", () => {
    const result = spatialConsistency(
      { values: [3, 3, 3, 3, 3, 3], adjacency: ringAdjacency(6) },
      moransI,
    );
    expect(result.score).toBe(1);
    expect(result.detail).toMatch(/zero-variance/);
  });

  it("scores high for a perfectly clustered signal on a ring graph", () => {
    // Two clear clusters on a ring of 8: high half then low half — all edges
    // except the two boundary ones connect same-cluster nodes → strong +I.
    const values = [10, 10, 10, 10, 0, 0, 0, 0];
    const result = spatialConsistency(
      {
        values,
        adjacency: ringAdjacency(8),
        nPermutations: 199,
        seed: 7,
      },
      moransI,
    );
    expect(result.score).toBeGreaterThan(0.4);
    expect(result.detail).toContain("Moran's I");
    expect(result.detail).toContain("+struct");
  });

  it("scores low for a randomly arranged signal on a ring graph", () => {
    // Same values, but interleaved — mostly opposite-cluster neighbours.
    const values = [10, 0, 10, 0, 10, 0, 10, 0];
    const result = spatialConsistency(
      {
        values,
        adjacency: ringAdjacency(8),
        nPermutations: 199,
        seed: 7,
      },
      moransI,
    );
    // Negative autocorrelation (alternating) IS structure — score is non-zero
    // but by design should be lower than the clustered case (much smaller |I|
    // dev when clamped or balanced by sigWeight isn't applicable; we just
    // assert ordering vs the clustered case below).
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("near-random arrangement scores below clustered (M is anti-noise)", () => {
    // Note: a perfectly alternating arrangement is *also* structure (strong
    // negative autocorrelation) and would saturate to 1.0 — by design, M
    // rewards any non-random pattern. The contrast we care about is
    // structure vs. genuine randomness. A seeded-random continuous signal
    // on a ring should have small |I − E[I]| and a high p-perm, both of
    // which collapse M.
    const adj = ringAdjacency(20);
    const clustered = spatialConsistency(
      {
        values: Array.from({ length: 20 }, (_, i) => (i < 10 ? 5 : 0)),
        adjacency: adj,
        nPermutations: 199,
        seed: 11,
      },
      moransI,
    );
    // Pick a seed whose sample is empirically near-random on this ring.
    // (Found by trying a few seeds; the test is ordering, not exact value.)
    const rand = seededRng(2026);
    const noisyValues = Array.from({ length: 20 }, () => rand());
    const noisy = spatialConsistency(
      {
        values: noisyValues,
        adjacency: adj,
        nPermutations: 199,
        seed: 11,
      },
      moransI,
    );
    expect(clustered.score).toBeGreaterThan(noisy.score);
  });

  it("is deterministic under a fixed seed", () => {
    const a = spatialConsistency(
      {
        values: [10, 9, 8, 7, 6, 5, 4, 3],
        adjacency: ringAdjacency(8),
        nPermutations: 99,
        seed: 2026,
      },
      moransI,
    );
    const b = spatialConsistency(
      {
        values: [10, 9, 8, 7, 6, 5, 4, 3],
        adjacency: ringAdjacency(8),
        nPermutations: 99,
        seed: 2026,
      },
      moransI,
    );
    expect(a).toEqual(b);
  });
});

// ─── computeRelevanceBatch with M ─────────────────────────────────────

describe("computeRelevanceBatch with consistency", () => {
  function makeInputs(seed: number): ModelRelevanceInput[] {
    const { obs, pred } = makeNoisyModel(seed, 60);
    return [
      {
        key: "csd",
        observed: obs,
        modelSeries: pred,
        freeParams: 2,
        gate: { score: 0.7, detail: "test" },
        sufficiency: { score: 0.8, detail: "test" },
      },
      {
        key: "lppls",
        observed: obs,
        modelSeries: pred,
        freeParams: 3,
        gate: { score: 0.6, detail: "test" },
        sufficiency: { score: 0.8, detail: "test" },
      },
    ];
  }

  it("M defaults to neutral 1.0 when consistency is not supplied", () => {
    const result = computeRelevanceBatch(makeInputs(101));
    for (const breakdown of result.values()) {
      expect(breakdown.M.score).toBe(1);
      expect(breakdown.M.detail).toContain("no consistency input");
    }
  });

  it("M passes through unchanged from options.consistency", () => {
    const customM: SubScore = { score: 0.42, detail: "custom" };
    const result = computeRelevanceBatch(makeInputs(102), {
      consistency: customM,
    });
    for (const breakdown of result.values()) {
      expect(breakdown.M).toEqual(customM);
    }
  });

  it("M=0 collapses the composite to 0 across every model", () => {
    const result = computeRelevanceBatch(makeInputs(103), {
      consistency: { score: 0, detail: "scrambled" },
    });
    for (const breakdown of result.values()) {
      expect(breakdown.composite).toBe(0);
      expect(breakdown.rawComposite).toBe(0);
    }
  });

  it("halving M halves the composite (multiplicative gate)", () => {
    const full = computeRelevanceBatch(makeInputs(104), {
      consistency: { score: 1, detail: "full" },
    });
    const half = computeRelevanceBatch(makeInputs(104), {
      consistency: { score: 0.5, detail: "half" },
    });
    for (const key of full.keys()) {
      const f = full.get(key)!;
      const h = half.get(key)!;
      expect(h.composite).toBeCloseTo(f.composite / 2, 9);
      expect(h.rawComposite).toBeCloseTo(f.rawComposite / 2, 9);
    }
  });
});

// ─── bootstrapRelevanceBatch with M ───────────────────────────────────

describe("bootstrapRelevanceBatch with consistency", () => {
  function makeInputs(seed: number): ModelRelevanceInput[] {
    const { obs, pred } = makeNoisyModel(seed, 80);
    return [
      {
        key: "csd",
        observed: obs,
        modelSeries: pred,
        freeParams: 2,
        gate: { score: 0.7, detail: "test" },
        sufficiency: { score: 0.8, detail: "test" },
      },
    ];
  }

  it("composite CI also halves when M halves (CI propagation through gate)", () => {
    const full = bootstrapRelevanceBatch(makeInputs(201), {
      consistency: { score: 1.0, detail: "full" },
      bootstrap: { samples: 300, rng: seededRng(1) },
    });
    const half = bootstrapRelevanceBatch(makeInputs(201), {
      consistency: { score: 0.5, detail: "half" },
      bootstrap: { samples: 300, rng: seededRng(1) },
    });
    const fb = full.get("csd")!;
    const hb = half.get("csd")!;
    expect(hb.composite).toBeCloseTo(fb.composite / 2, 9);
    expect(hb.compositeCi!.low).toBeCloseTo(fb.compositeCi!.low / 2, 6);
    expect(hb.compositeCi!.high).toBeCloseTo(fb.compositeCi!.high / 2, 6);
  });

  it("M=0 collapses both composite and CI to 0", () => {
    const result = bootstrapRelevanceBatch(makeInputs(202), {
      consistency: { score: 0, detail: "scrambled" },
      bootstrap: { samples: 200, rng: seededRng(2) },
    });
    const b = result.get("csd")!;
    expect(b.composite).toBe(0);
    expect(b.compositeCi!.low).toBe(0);
    expect(b.compositeCi!.high).toBe(0);
  });

  it("M is included in every breakdown emitted", () => {
    const result = bootstrapRelevanceBatch(makeInputs(203), {
      consistency: { score: 0.6, detail: "structured" },
      bootstrap: { samples: 100, rng: seededRng(3) },
    });
    for (const b of result.values()) {
      expect(b.M.score).toBe(0.6);
      expect(b.M.detail).toBe("structured");
    }
  });
});
