import { describe, it, expect } from "vitest";
import { bettiSample, bettiSeries, fitBettiTemplate } from "@/lib/estimators/ph-fit";

describe("bettiSample", () => {
  it("is bounded in [0, 1]", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const y = bettiSample(t, 0.6, 0.7, 2, 0.3);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("returns 0 at t = 0 for riseExp > 0", () => {
    expect(bettiSample(0, 0.6, 0.7, 2, 0.3)).toBe(0);
  });

  it("scales monotonically with clusterFrac on the rising side (t < center)", () => {
    const t = 0.3;
    const lo = bettiSample(t, 0.6, 0.7, 2, 0.0);
    const hi = bettiSample(t, 0.6, 0.7, 2, 0.8);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("bettiSeries", () => {
  it("returns the requested length", () => {
    expect(bettiSeries(60, 0.6, 0.7, 2, 0.3).length).toBe(60);
  });

  it("matches bettiSample at each index", () => {
    const n = 10;
    const s = bettiSeries(n, 0.5, 0.65, 1.8, 0.2);
    for (let i = 0; i < n; i++) {
      expect(s[i]).toBeCloseTo(bettiSample(i / (n - 1), 0.5, 0.65, 1.8, 0.2), 12);
    }
  });
});

describe("fitBettiTemplate — known-answer recovery", () => {
  it("recovers (riseExp, center, rate) within grid tolerance on a clean synthetic curve", () => {
    const truth = { riseExp: 0.45, center: 0.6, rate: 2.5 };
    const n = 60;
    const clusterFrac = 0.3;
    const observed = bettiSeries(n, truth.riseExp, truth.center, truth.rate, clusterFrac);

    const r = fitBettiTemplate(observed, { clusterFrac });
    expect(r.rSquared).toBeGreaterThan(0.99);
    expect(Math.abs(r.riseExp - truth.riseExp)).toBeLessThan(0.12);
    expect(Math.abs(r.center - truth.center)).toBeLessThan(0.08);
    expect(Math.abs(r.rate - truth.rate)).toBeLessThan(0.5);
  });

  it("beats or matches the hardcoded prior on arbitrary target curves", () => {
    const truth = { riseExp: 1.0, center: 0.85, rate: 3.5 };
    const clusterFrac = 0.5;
    const observed = bettiSeries(60, truth.riseExp, truth.center, truth.rate, clusterFrac);

    const priorSsRes = observed.reduce((s, v, i) => {
      const y = bettiSample(i / 59, 0.6, 0.7, 2, clusterFrac);
      return s + (v - y) ** 2;
    }, 0);

    const r = fitBettiTemplate(observed, { clusterFrac });
    expect(r.ssRes).toBeLessThanOrEqual(priorSsRes + 1e-12);
  });

  it("returns the prior (or seed) for n < 3 without fitting", () => {
    const r = fitBettiTemplate([0.2, 0.5], { clusterFrac: 0.3 });
    expect(r.evaluations).toBe(0);
    expect(r.riseExp).toBe(0.6);
    expect(r.center).toBe(0.7);
    expect(r.rate).toBe(2);
  });

  it("respects a user seed on degenerate input", () => {
    const seed = { riseExp: 0.4, center: 0.8, rate: 1.5 };
    const r = fitBettiTemplate([0.1, 0.2], { clusterFrac: 0.3, seed });
    expect(r.riseExp).toBe(seed.riseExp);
    expect(r.center).toBe(seed.center);
    expect(r.rate).toBe(seed.rate);
  });
});

describe("fitBettiTemplate — budget and bounds", () => {
  it("uses approximately coarse + refine evaluations at defaults", () => {
    const observed = bettiSeries(60, 0.5, 0.7, 2, 0.3);
    const r = fitBettiTemplate(observed, { clusterFrac: 0.3 });
    // 1 prior + 11³ coarse + 7³ refine ≈ 1 + 1331 + 343 = 1675
    expect(r.evaluations).toBeGreaterThan(1300);
    expect(r.evaluations).toBeLessThan(1800);
  });

  it("returned parameters stay within the default bounds", () => {
    const observed = bettiSeries(60, 0.5, 0.7, 2, 0.3);
    const r = fitBettiTemplate(observed, { clusterFrac: 0.3 });
    expect(r.riseExp).toBeGreaterThanOrEqual(0.2);
    expect(r.riseExp).toBeLessThanOrEqual(1.2);
    expect(r.center).toBeGreaterThanOrEqual(0.4);
    expect(r.center).toBeLessThanOrEqual(0.95);
    expect(r.rate).toBeGreaterThanOrEqual(0.5);
    expect(r.rate).toBeLessThanOrEqual(4.0);
  });

  it("modelSeries matches observed length", () => {
    const observed = bettiSeries(45, 0.5, 0.7, 2, 0.3);
    const r = fitBettiTemplate(observed, { clusterFrac: 0.3 });
    expect(r.modelSeries.length).toBe(45);
  });
});
