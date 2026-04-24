import { describe, it, expect } from "vitest";
import {
  fitLppls,
  lpplsSample,
  lpplsSeries,
} from "@/lib/estimators/lppls-fit";

describe("lpplsSample", () => {
  it("clamps the output into [0, 1]", () => {
    for (let t = 0; t < 1; t += 0.1) {
      const y = lpplsSample(t, 1.1, 7, 0.5, 0.3);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("is finite at t approaching tc (guarded by dt floor)", () => {
    const y = lpplsSample(0.99, 1.0, 7, 0.5, 0);
    expect(Number.isFinite(y)).toBe(true);
  });
});

describe("lpplsSeries", () => {
  it("returns the requested length", () => {
    const s = lpplsSeries(25, 1.2, 7, 0.4, 0);
    expect(s.length).toBe(25);
  });

  it("matches lpplsSample at each index", () => {
    const n = 10;
    const s = lpplsSeries(n, 1.2, 7, 0.4, 0.5);
    for (let i = 0; i < n; i++) {
      expect(s[i]).toBeCloseTo(lpplsSample(i / (n - 1), 1.2, 7, 0.4, 0.5), 12);
    }
  });
});

describe("fitLppls — known-answer recovery", () => {
  it("recovers (tc, ω, m) within grid tolerance on a clean synthetic series", () => {
    const truth = { tc: 1.15, omega: 7.5, m: 0.45 };
    const n = 30;
    const observed = lpplsSeries(n, truth.tc, truth.omega, truth.m, 0);

    const r = fitLppls(observed, { phase: 0 });
    expect(r.ssRes).toBeLessThan(1e-3); // grid can't hit exactly but should land in the well
    expect(r.rSquared).toBeGreaterThan(0.99);
    expect(Math.abs(r.tc - truth.tc)).toBeLessThan(0.05);
    expect(Math.abs(r.omega - truth.omega)).toBeLessThan(0.6);
    expect(Math.abs(r.m - truth.m)).toBeLessThan(0.1);
  });

  it("still converges on a series with small additive noise", () => {
    const truth = { tc: 1.08, omega: 6.5, m: 0.35 };
    const n = 30;
    const clean = lpplsSeries(n, truth.tc, truth.omega, truth.m, 0);
    // Deterministic pseudo-noise so the test is reproducible.
    const observed = clean.map((v, i) => v + 0.005 * Math.sin(i * 1.7));
    const r = fitLppls(observed, { phase: 0 });
    expect(r.rSquared).toBeGreaterThan(0.95);
    expect(Math.abs(r.tc - truth.tc)).toBeLessThan(0.1);
  });

  it("beats or matches a user-supplied seed", () => {
    const truth = { tc: 1.2, omega: 9.0, m: 0.6 };
    const observed = lpplsSeries(25, truth.tc, truth.omega, truth.m, 0);
    // A seed that's close but not exact.
    const seed = { tc: 1.25, omega: 8.5, m: 0.55 };
    const seedSsRes = observed.reduce((s, v, i) => {
      const y = lpplsSample(i / 24, seed.tc, seed.omega, seed.m, 0);
      return s + (v - y) ** 2;
    }, 0);

    const r = fitLppls(observed, { phase: 0, seed });
    expect(r.ssRes).toBeLessThanOrEqual(seedSsRes + 1e-12);
  });

  it("returns the seed when observed has fewer than 2 points (degenerate)", () => {
    const seed = { tc: 1.1, omega: 7, m: 0.3 };
    const r = fitLppls([0.5], { phase: 0, seed });
    expect(r.tc).toBe(seed.tc);
    expect(r.omega).toBe(seed.omega);
    expect(r.m).toBe(seed.m);
    expect(r.evaluations).toBe(0);
  });
});

describe("fitLppls — budget and bounds", () => {
  it("uses ~coarse + refine evaluations (default grid)", () => {
    const observed = lpplsSeries(20, 1.2, 7, 0.4, 0);
    const r = fitLppls(observed, { phase: 0 });
    // Coarse = 20·20·16 = 6400; refine = 7·7·7 = 343 (+1 seed miss → none here).
    expect(r.evaluations).toBeGreaterThan(6400);
    expect(r.evaluations).toBeLessThan(7000);
  });

  it("returned parameters are within the configured grid bounds", () => {
    const observed = lpplsSeries(20, 1.2, 7, 0.4, 0);
    const r = fitLppls(observed, {
      phase: 0,
      tcGrid: { min: 1.05, max: 1.4, steps: 10 },
      omegaGrid: { min: 5, max: 10, steps: 10 },
      mGrid: { min: 0.2, max: 0.7, steps: 10 },
    });
    expect(r.tc).toBeGreaterThanOrEqual(1.05);
    expect(r.tc).toBeLessThanOrEqual(1.4);
    expect(r.omega).toBeGreaterThanOrEqual(5);
    expect(r.omega).toBeLessThanOrEqual(10);
    expect(r.m).toBeGreaterThanOrEqual(0.2);
    expect(r.m).toBeLessThanOrEqual(0.7);
  });

  it("modelSeries length matches observed length", () => {
    const observed = lpplsSeries(17, 1.2, 7, 0.4, 0);
    const r = fitLppls(observed, { phase: 0 });
    expect(r.modelSeries.length).toBe(17);
  });
});
