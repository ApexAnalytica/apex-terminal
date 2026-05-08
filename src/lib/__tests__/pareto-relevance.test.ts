import { describe, it, expect } from "vitest";
import {
  outOfSampleFit,
  akaikeEvidenceWeights,
  bocpdRegimeGate,
  csdRegimeGate,
  lpplsRegimeGate,
  phRegimeGate,
  trajectorySufficiency,
  topologySufficiency,
  computeRelevanceBatch,
  PARETO_RELEVANCE_CONSTANTS,
} from "@/lib/pareto-relevance";

const { FIT_WEIGHT, EMA_ALPHA } = PARETO_RELEVANCE_CONSTANTS;

describe("outOfSampleFit", () => {
  it("scores 1 for a perfect predictor", () => {
    const obs = Array.from({ length: 30 }, (_, i) => Math.sin(i / 3));
    const { score } = outOfSampleFit(obs, obs);
    expect(score).toBeCloseTo(1, 6);
  });

  it("returns 0 with an insufficient-detail message when n is too small", () => {
    const r = outOfSampleFit([0.1, 0.2, 0.3], [0.1, 0.2, 0.3]);
    expect(r.score).toBe(0);
    expect(r.detail).toMatch(/insufficient|need/i);
  });

  it("decreases monotonically as prediction error grows", () => {
    const obs = Array.from({ length: 30 }, (_, i) => i / 30);
    const close = obs.map((v) => v + 0.01);
    const far = obs.map((v) => v + 0.5);
    const a = outOfSampleFit(obs, close).score;
    const b = outOfSampleFit(obs, far).score;
    expect(a).toBeGreaterThan(b);
  });

  it("clamps the score into [0, 1]", () => {
    const obs = Array.from({ length: 20 }, (_, i) => i);
    const wild = obs.map((v) => v + 1000 * (Math.random() - 0.5));
    const { score } = outOfSampleFit(obs, wild);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("akaikeEvidenceWeights", () => {
  const obs = Array.from({ length: 25 }, (_, i) => Math.sin(i / 4));

  it("gives the lower-AIC model a higher score", () => {
    const good = obs.map((v) => v + 0.01);
    const bad = obs.map((v) => v + 0.5);
    const out = akaikeEvidenceWeights([
      { key: "good", observed: obs, modelSeries: good, freeParams: 2 },
      { key: "bad", observed: obs, modelSeries: bad, freeParams: 2 },
    ]);
    expect(out.get("good")!.score).toBeGreaterThan(out.get("bad")!.score);
  });

  it("normalises so the average score across K models is 1", () => {
    const a = obs.map((v) => v + 0.05);
    const b = obs.map((v) => v + 0.05);
    const c = obs.map((v) => v + 0.05);
    const out = akaikeEvidenceWeights([
      { key: "a", observed: obs, modelSeries: a, freeParams: 2 },
      { key: "b", observed: obs, modelSeries: b, freeParams: 2 },
      { key: "c", observed: obs, modelSeries: c, freeParams: 2 },
    ]);
    const sum = out.get("a")!.score + out.get("b")!.score + out.get("c")!.score;
    expect(sum).toBeCloseTo(3, 1); // each gets ~1.0 since K * (1/K) = 1
  });

  it("excludes models with insufficient data", () => {
    const out = akaikeEvidenceWeights([
      { key: "ok", observed: obs, modelSeries: obs, freeParams: 1 },
      { key: "thin", observed: [0.1, 0.2], modelSeries: [0.1, 0.2], freeParams: 1 },
    ]);
    expect(out.get("thin")!.score).toBe(0);
    expect(out.get("ok")!.score).toBeGreaterThan(0);
  });

  it("penalises higher free-param counts when fits are equal (AIC penalty)", () => {
    const fit = obs.map((v) => v + 0.01);
    const out = akaikeEvidenceWeights([
      { key: "lean", observed: obs, modelSeries: fit, freeParams: 1 },
      { key: "heavy", observed: obs, modelSeries: fit, freeParams: 5 },
    ]);
    expect(out.get("lean")!.score).toBeGreaterThan(out.get("heavy")!.score);
  });
});

describe("csdRegimeGate", () => {
  it("scores higher for a series with rising variance and autocorr", () => {
    // Trajectory whose variance and autocorrelation grow over time.
    // Seeded RNG so the test is deterministic — was previously using
    // unseeded Math.random() and intermittently failed when the random
    // draw produced rising < flat at the assertion threshold.
    const rng = (() => {
      // Mulberry32 inline so the test stays in this single file.
      let a = 20260506 >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const rising: number[] = [];
    for (let i = 0; i < 30; i++) {
      const noise = (rng() - 0.5) * (i / 30);
      const trend = i / 30;
      rising.push(trend + noise);
    }
    const flat = Array.from({ length: 30 }, () => 0.5);
    const a = csdRegimeGate({ observed: rising, lambdaMax: 1.0 }).score;
    const b = csdRegimeGate({ observed: flat, lambdaMax: 1.0 }).score;
    expect(a).toBeGreaterThan(b);
  });

  it("uses a spectral-only fallback when the series is too short", () => {
    const r = csdRegimeGate({ observed: [0.1, 0.2], lambdaMax: 1.0 });
    expect(r.score).toBeGreaterThan(0);
    expect(r.detail).toMatch(/spectral-only/);
  });

  it("returns a value in [0, 1]", () => {
    const obs = Array.from({ length: 20 }, (_, i) => i / 20);
    const r = csdRegimeGate({ observed: obs, lambdaMax: 5.0 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("lpplsRegimeGate", () => {
  it("scores higher for an oscillating accelerating series", () => {
    // Super-exponential with oscillation.
    const obs: number[] = [];
    const model: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const trend = Math.pow(t, 2);
      obs.push(trend + 0.05 * Math.sin(8 * t));
      model.push(trend);
    }
    const flatObs = Array.from({ length: 20 }, () => 0.5);
    const flatModel = Array.from({ length: 20 }, () => 0.5);
    const a = lpplsRegimeGate({ observed: obs, modelSeries: model }).score;
    const b = lpplsRegimeGate({ observed: flatObs, modelSeries: flatModel }).score;
    expect(a).toBeGreaterThan(b);
  });

  it("returns 0 for series shorter than 6 points", () => {
    const r = lpplsRegimeGate({ observed: [1, 2, 3], modelSeries: [1, 2, 3] });
    expect(r.score).toBe(0);
  });
});

describe("bocpdRegimeGate", () => {
  it("returns 0 for series shorter than 6 points", () => {
    const r = bocpdRegimeGate({ newRunProb: [0.1, 0.2, 0.3] });
    expect(r.score).toBe(0);
    expect(r.detail).toMatch(/n=3/);
  });

  it("scores high for a posterior with a recent peak above threshold", () => {
    // Quiet then spikes recently — peak window catches the rise.
    const newRunProb = [
      0.02, 0.02, 0.03, 0.02, 0.02, 0.02, 0.02, 0.02,
      0.7, 0.85, 0.9, 0.6,
    ];
    const r = bocpdRegimeGate({ newRunProb });
    expect(r.score).toBeGreaterThan(0.4);
  });

  it("scores low for a flat-line posterior", () => {
    const flat = Array.from({ length: 20 }, () => 0.02);
    const r = bocpdRegimeGate({ newRunProb: flat });
    expect(r.score).toBeLessThan(0.1);
  });

  it("scores higher with structure than without (ordering invariant)", () => {
    const flat = Array.from({ length: 30 }, () => 0.02);
    const structured = [
      0.02, 0.02, 0.05, 0.4, 0.7, 0.5, 0.2, 0.05,
      0.02, 0.02, 0.02, 0.05, 0.5, 0.85, 0.6, 0.2,
      0.05, 0.02, 0.02, 0.02, 0.05, 0.4, 0.7, 0.55,
      0.2, 0.05, 0.02, 0.5, 0.8, 0.6,
    ];
    expect(
      bocpdRegimeGate({ newRunProb: structured }).score,
    ).toBeGreaterThan(bocpdRegimeGate({ newRunProb: flat }).score);
  });
});

describe("phRegimeGate", () => {
  it("scores higher when β₁ is non-trivial and components > 1", () => {
    const a = phRegimeGate({
      betti1Curve: [0, 0.1, 0.3, 0.4, 0.2, 0],
      componentCountAtMid: 4,
      nodeCount: 30,
    }).score;
    const b = phRegimeGate({
      betti1Curve: [0, 0, 0, 0, 0, 0],
      componentCountAtMid: 1,
      nodeCount: 30,
    }).score;
    expect(a).toBeGreaterThan(b);
  });

  it("scores 0 with no nodes", () => {
    const r = phRegimeGate({ betti1Curve: [0.5], componentCountAtMid: 2, nodeCount: 0 });
    expect(r.score).toBe(0);
  });
});

describe("sufficiency helpers", () => {
  it("trajectorySufficiency saturates at the configured thresholds", () => {
    const r = trajectorySufficiency(100, 200);
    expect(r.score).toBe(1);
  });

  it("trajectorySufficiency penalises the weaker axis (geometric mean)", () => {
    // n=30 saturates n-axis; edges=5 keeps edge axis low → score = √(1·0.1)
    const r = trajectorySufficiency(30, 5);
    expect(r.score).toBeCloseTo(Math.sqrt(1 * (5 / 50)), 6);
  });

  it("topologySufficiency saturates at MIN_NODE_COUNT_PH", () => {
    expect(topologySufficiency(50).score).toBe(1);
    expect(topologySufficiency(0).score).toBe(0);
  });
});

describe("computeRelevanceBatch", () => {
  const obs = Array.from({ length: 30 }, (_, i) => i / 30);
  const goodModel = obs.map((v) => v + 0.005);
  const badModel = obs.map((v) => v + 0.4);

  it("composes raw = S · G · (0.6·F + 0.4·E)", () => {
    const out = computeRelevanceBatch([
      {
        key: "good",
        observed: obs,
        modelSeries: goodModel,
        freeParams: 2,
        gate: { score: 1, detail: "" },
        sufficiency: { score: 1, detail: "" },
      },
    ]);
    const r = out.get("good")!;
    const expected = r.S.score * r.G.score * (FIT_WEIGHT * r.F.score + (1 - FIT_WEIGHT) * r.E.score);
    expect(r.rawComposite).toBeCloseTo(expected, 6);
    expect(r.composite).toBeCloseTo(r.rawComposite, 6); // no previous → no smoothing
  });

  it("zeroes the composite when the gate is closed (multiplicative)", () => {
    const out = computeRelevanceBatch([
      {
        key: "x",
        observed: obs,
        modelSeries: goodModel,
        freeParams: 2,
        gate: { score: 0, detail: "closed" },
        sufficiency: { score: 1, detail: "" },
      },
    ]);
    expect(out.get("x")!.composite).toBe(0);
  });

  it("zeroes the composite when sufficiency is zero (multiplicative)", () => {
    const out = computeRelevanceBatch([
      {
        key: "x",
        observed: obs,
        modelSeries: goodModel,
        freeParams: 2,
        gate: { score: 1, detail: "" },
        sufficiency: { score: 0, detail: "no data" },
      },
    ]);
    expect(out.get("x")!.composite).toBe(0);
  });

  it("ranks the better-fitting model higher than the worse one", () => {
    const out = computeRelevanceBatch([
      {
        key: "good",
        observed: obs,
        modelSeries: goodModel,
        freeParams: 2,
        gate: { score: 1, detail: "" },
        sufficiency: { score: 1, detail: "" },
      },
      {
        key: "bad",
        observed: obs,
        modelSeries: badModel,
        freeParams: 2,
        gate: { score: 1, detail: "" },
        sufficiency: { score: 1, detail: "" },
      },
    ]);
    expect(out.get("good")!.composite).toBeGreaterThan(out.get("bad")!.composite);
  });

  it("applies EMA smoothing when previous values are supplied", () => {
    const out = computeRelevanceBatch(
      [
        {
          key: "x",
          observed: obs,
          modelSeries: goodModel,
          freeParams: 2,
          gate: { score: 1, detail: "" },
          sufficiency: { score: 1, detail: "" },
        },
      ],
      { previous: { x: 0 } },
    );
    const r = out.get("x")!;
    const expected = (1 - EMA_ALPHA) * 0 + EMA_ALPHA * r.rawComposite;
    expect(r.composite).toBeCloseTo(expected, 6);
    expect(r.composite).toBeLessThan(r.rawComposite); // smoothing pulls toward 0
  });

  it("keeps every output in [0, 1]", () => {
    const out = computeRelevanceBatch([
      {
        key: "good",
        observed: obs,
        modelSeries: goodModel,
        freeParams: 2,
        gate: { score: 0.7, detail: "" },
        sufficiency: { score: 0.9, detail: "" },
      },
    ]);
    const r = out.get("good")!;
    for (const v of [r.F.score, r.E.score, r.G.score, r.S.score, r.composite, r.rawComposite]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
