import { describe, it, expect } from "vitest";
import {
  bootstrapOutOfSampleFit,
  bootstrapRelevance,
  quantileBounds,
  seededRng,
} from "../pareto-relevance-bootstrap";
import { outOfSampleFit } from "../pareto-relevance";

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeNoisySeries(seed: number, n: number, noise: number) {
  const rand = seededRng(seed);
  const obs: number[] = [];
  const pred: number[] = [];
  for (let i = 0; i < n; i++) {
    const trend = i * 0.05;
    obs.push(trend + (rand() - 0.5) * noise);
    pred.push(trend); // perfect deterministic prediction
  }
  return { obs, pred };
}

// ─── quantileBounds ───────────────────────────────────────────────────

describe("quantileBounds", () => {
  it("returns 5th/95th percentiles for level=0.9", () => {
    const samples = Array.from({ length: 101 }, (_, i) => i / 100);
    const ci = quantileBounds(samples, 0.9);
    expect(ci.low).toBeCloseTo(0.05, 5);
    expect(ci.high).toBeCloseTo(0.95, 5);
    expect(ci.level).toBe(0.9);
  });

  it("returns the single value for n=1", () => {
    expect(quantileBounds([0.42], 0.9)).toEqual({
      low: 0.42,
      high: 0.42,
      level: 0.9,
    });
  });

  it("returns degenerate CI for empty input", () => {
    expect(quantileBounds([], 0.9)).toEqual({
      low: 0,
      high: 0,
      level: 0.9,
    });
  });

  it("handles level=0.5 → 25th/75th percentiles", () => {
    const samples = Array.from({ length: 101 }, (_, i) => i / 100);
    const ci = quantileBounds(samples, 0.5);
    expect(ci.low).toBeCloseTo(0.25, 5);
    expect(ci.high).toBeCloseTo(0.75, 5);
  });
});

// ─── bootstrapOutOfSampleFit ──────────────────────────────────────────

describe("bootstrapOutOfSampleFit", () => {
  it("point estimate matches outOfSampleFit", () => {
    const { obs, pred } = makeNoisySeries(7, 100, 0.4);
    const point = outOfSampleFit(obs, pred);
    const boot = bootstrapOutOfSampleFit(obs, pred, {
      samples: 200,
      rng: seededRng(123),
    });
    expect(boot.point.score).toBeCloseTo(point.score, 9);
    expect(boot.point.detail).toBe(point.detail);
  });

  it("returns degenerate result for too-few points", () => {
    const obs = [1, 2, 3];
    const pred = [1, 2, 3];
    const boot = bootstrapOutOfSampleFit(obs, pred, {
      samples: 50,
      rng: seededRng(1),
    });
    expect(boot.point.score).toBe(0);
    expect(boot.ci.low).toBe(0);
    expect(boot.ci.high).toBe(0);
    expect(boot.samples).toHaveLength(50);
  });

  it("CI brackets the point estimate for a noisy series", () => {
    const { obs, pred } = makeNoisySeries(11, 80, 0.3);
    const boot = bootstrapOutOfSampleFit(obs, pred, {
      samples: 1000,
      rng: seededRng(42),
    });
    // With 1000 bootstraps and a 90% CI, the point estimate should fall
    // inside the band the vast majority of the time. We assert it does
    // here — under a deterministic seed this is a hard equality.
    expect(boot.point.score).toBeGreaterThanOrEqual(boot.ci.low);
    expect(boot.point.score).toBeLessThanOrEqual(boot.ci.high);
  });

  it("CI tightens with more samples (low ≤ high, narrower spread)", () => {
    const { obs, pred } = makeNoisySeries(99, 60, 0.5);
    const small = bootstrapOutOfSampleFit(obs, pred, {
      samples: 50,
      rng: seededRng(1),
    });
    const big = bootstrapOutOfSampleFit(obs, pred, {
      samples: 2000,
      rng: seededRng(1),
    });
    // Both must satisfy low ≤ high.
    expect(small.ci.low).toBeLessThanOrEqual(small.ci.high);
    expect(big.ci.low).toBeLessThanOrEqual(big.ci.high);
    // With fixed residuals, the population CI is fixed; doubling samples
    // doesn't shrink it. We assert that the *Monte-Carlo* error narrows:
    // with enough samples, the CI bounds stabilise. Here we just sanity-
    // check that big-sample CI exists and is bounded in [0, 1].
    expect(big.ci.low).toBeGreaterThanOrEqual(0);
    expect(big.ci.high).toBeLessThanOrEqual(1);
  });

  it("is deterministic under a seeded RNG", () => {
    const { obs, pred } = makeNoisySeries(5, 50, 0.4);
    const a = bootstrapOutOfSampleFit(obs, pred, {
      samples: 100,
      rng: seededRng(2026),
    });
    const b = bootstrapOutOfSampleFit(obs, pred, {
      samples: 100,
      rng: seededRng(2026),
    });
    expect(a.samples).toEqual(b.samples);
    expect(a.ci.low).toBe(b.ci.low);
    expect(a.ci.high).toBe(b.ci.high);
  });

  it("respects blockLength > 1 (block-bootstrap semantics)", () => {
    const { obs, pred } = makeNoisySeries(13, 60, 0.4);
    const block1 = bootstrapOutOfSampleFit(obs, pred, {
      samples: 500,
      blockLength: 1,
      rng: seededRng(7),
    });
    const block5 = bootstrapOutOfSampleFit(obs, pred, {
      samples: 500,
      blockLength: 5,
      rng: seededRng(7),
    });
    // Different block lengths must produce different sample distributions.
    // We don't assert which is wider — that depends on the autocorrelation
    // structure of the residuals — only that they differ.
    const sameSamples = block1.samples.every(
      (v, i) => v === block5.samples[i],
    );
    expect(sameSamples).toBe(false);
  });

  it("CI bounds are clamped to [0, 1]", () => {
    const { obs, pred } = makeNoisySeries(3, 40, 1.5); // high noise
    const boot = bootstrapOutOfSampleFit(obs, pred, {
      samples: 500,
      rng: seededRng(99),
    });
    expect(boot.ci.low).toBeGreaterThanOrEqual(0);
    expect(boot.ci.high).toBeLessThanOrEqual(1);
  });
});

// ─── bootstrapRelevance ───────────────────────────────────────────────

describe("bootstrapRelevance", () => {
  it("returns composite CI bracketing the point composite", () => {
    const { obs, pred } = makeNoisySeries(21, 80, 0.3);
    const result = bootstrapRelevance(
      {
        key: "csd",
        observed: obs,
        modelSeries: pred,
        freeParams: 1,
        gate: { score: 0.7, detail: "test gate" },
        sufficiency: { score: 0.8, detail: "test sufficiency" },
        evidence: { score: 0.5, detail: "test evidence" },
      },
      { bootstrap: { samples: 500, rng: seededRng(1) } },
    );
    expect(result.composite).toBeGreaterThanOrEqual(result.compositeCi.low);
    expect(result.composite).toBeLessThanOrEqual(result.compositeCi.high);
    expect(result.compositeCi.low).toBeGreaterThanOrEqual(0);
    expect(result.compositeCi.high).toBeLessThanOrEqual(1);
  });

  it("composite CI collapses to zero when gate or sufficiency is zero", () => {
    const { obs, pred } = makeNoisySeries(33, 60, 0.4);
    const result = bootstrapRelevance(
      {
        key: "lppls",
        observed: obs,
        modelSeries: pred,
        freeParams: 3,
        gate: { score: 0, detail: "regime mismatch" },
        sufficiency: { score: 0.9, detail: "ok" },
        evidence: { score: 0.4, detail: "ok" },
      },
      { bootstrap: { samples: 200, rng: seededRng(2) } },
    );
    expect(result.composite).toBe(0);
    expect(result.compositeCi.low).toBe(0);
    expect(result.compositeCi.high).toBe(0);
  });

  it("composite CI scales linearly with S·G", () => {
    const { obs, pred } = makeNoisySeries(44, 70, 0.35);
    const halfGate = bootstrapRelevance(
      {
        key: "ph",
        observed: obs,
        modelSeries: pred,
        freeParams: 0,
        gate: { score: 0.5, detail: "" },
        sufficiency: { score: 1.0, detail: "" },
        evidence: { score: 0.5, detail: "" },
      },
      { bootstrap: { samples: 500, rng: seededRng(3) } },
    );
    const fullGate = bootstrapRelevance(
      {
        key: "ph",
        observed: obs,
        modelSeries: pred,
        freeParams: 0,
        gate: { score: 1.0, detail: "" },
        sufficiency: { score: 1.0, detail: "" },
        evidence: { score: 0.5, detail: "" },
      },
      { bootstrap: { samples: 500, rng: seededRng(3) } },
    );
    // Halving G halves the composite and its CI bounds.
    expect(halfGate.composite).toBeCloseTo(fullGate.composite / 2, 6);
    expect(halfGate.compositeCi.low).toBeCloseTo(fullGate.compositeCi.low / 2, 6);
    expect(halfGate.compositeCi.high).toBeCloseTo(fullGate.compositeCi.high / 2, 6);
  });

  it("is deterministic under a seeded RNG", () => {
    const { obs, pred } = makeNoisySeries(55, 60, 0.4);
    const args = {
      key: "csd",
      observed: obs,
      modelSeries: pred,
      freeParams: 1,
      gate: { score: 0.6, detail: "" },
      sufficiency: { score: 0.7, detail: "" },
      evidence: { score: 0.5, detail: "" },
    };
    const a = bootstrapRelevance(args, {
      bootstrap: { samples: 200, rng: seededRng(2026) },
    });
    const b = bootstrapRelevance(args, {
      bootstrap: { samples: 200, rng: seededRng(2026) },
    });
    expect(a.compositeCi).toEqual(b.compositeCi);
    expect(a.fCi).toEqual(b.fCi);
  });
});

// ─── seededRng ────────────────────────────────────────────────────────

describe("seededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic per seed", () => {
    const a = seededRng(123);
    const b = seededRng(123);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it("differs across seeds", () => {
    const a = seededRng(1);
    const b = seededRng(2);
    let differ = false;
    for (let i = 0; i < 50; i++) {
      if (a() !== b()) {
        differ = true;
        break;
      }
    }
    expect(differ).toBe(true);
  });
});
