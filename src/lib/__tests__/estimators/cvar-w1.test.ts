import { describe, it, expect } from "vitest";
import { cvarW1, tailDepthScore } from "@/lib/estimators/cvar-w1";

// Tests cover:
//   1. Closed-form analytic cases (uniform sample, single-tail spike).
//   2. The Mohajerin Esfahani & Kuhn (2018) W₁ adjustment identity:
//        robust = empirical + L · ε / (1 − α).
//   3. Edge handling (αn integer vs non-integer, k clamps, lipschitz).
//   4. Argument validation (empty, NaN, out-of-range α / radius).

describe("cvarW1 — empirical CVaR closed form", () => {
  it("uniform 1..10, α=0.9 → tail mean of {10}", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // αn = 9, k = ⌈9⌉ = 9, x_(9) = 9, tailSum = x_(10) = 10.
    // CVaR = ((9 − 9) · 9 + 10) / ((1 − 0.9) · 10) = 10 / 1 = 10.
    const r = cvarW1(samples, { alpha: 0.9 });
    expect(r.empirical).toBeCloseTo(10, 12);
    expect(r.varEmpirical).toBe(9);
    expect(r.n).toBe(10);
  });

  it("uniform 1..10, α=0.8 → mean of strict upper tail {9, 10}", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // αn = 8, k = 8. (k − αn) = 0. tailSum = 9 + 10 = 19. CVaR = 19/2 = 9.5.
    const r = cvarW1(samples, { alpha: 0.8 });
    expect(r.empirical).toBeCloseTo(9.5, 12);
    expect(r.varEmpirical).toBe(8);
  });

  it("non-integer αn interpolates the boundary order statistic", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // α = 0.85, αn = 8.5, k = 9, x_(9) = 9. tailSum = 10.
    // CVaR = ((9 − 8.5) · 9 + 10) / ((1 − 0.85) · 10) = (4.5 + 10) / 1.5
    //      = 14.5 / 1.5 ≈ 9.6667.
    const r = cvarW1(samples, { alpha: 0.85 });
    expect(r.empirical).toBeCloseTo(14.5 / 1.5, 12);
    expect(r.varEmpirical).toBe(9);
  });

  it("CVaR ≥ VaR always", () => {
    // Random-ish but deterministic sample.
    const samples = [3.2, -1.1, 5.7, 0.4, 9.8, 2.0, 4.6, -0.3, 7.1, 6.5];
    for (const a of [0.5, 0.75, 0.9, 0.95]) {
      const r = cvarW1(samples, { alpha: a });
      expect(r.empirical).toBeGreaterThanOrEqual(r.varEmpirical - 1e-12);
    }
  });

  it("CVaR is monotone non-decreasing in α", () => {
    const samples = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let prev = -Infinity;
    for (const a of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
      const r = cvarW1(samples, { alpha: a });
      expect(r.empirical).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r.empirical;
    }
  });

  it("does not mutate the input array", () => {
    const samples = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const copy = samples.slice();
    cvarW1(samples, { alpha: 0.9 });
    expect(samples).toEqual(copy);
  });
});

describe("cvarW1 — W₁ ambiguity adjustment (Mohajerin Esfahani & Kuhn 2018)", () => {
  const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("radius = 0 → robust equals empirical", () => {
    const r = cvarW1(samples, { alpha: 0.9, radius: 0 });
    expect(r.robust).toBe(r.empirical);
  });

  it("robust = empirical + ε / (1 − α) when L = 1", () => {
    const a = 0.9;
    const eps = 0.5;
    const r = cvarW1(samples, { alpha: a, radius: eps });
    expect(r.robust - r.empirical).toBeCloseTo(eps / (1 - a), 12);
  });

  it("robust scales linearly with the Lipschitz constant", () => {
    const a = 0.95;
    const eps = 0.25;
    const r1 = cvarW1(samples, { alpha: a, radius: eps, lipschitz: 1 });
    const r3 = cvarW1(samples, { alpha: a, radius: eps, lipschitz: 3 });
    expect(r3.robust - r1.robust).toBeCloseTo(
      (2 * eps) / (1 - a),
      12,
    );
  });

  it("ambiguity term blows up as α → 1", () => {
    const eps = 0.1;
    const a09 = cvarW1(samples, { alpha: 0.9, radius: eps });
    const a099 = cvarW1(samples, { alpha: 0.99, radius: eps });
    const term09 = a09.robust - a09.empirical;
    const term099 = a099.robust - a099.empirical;
    expect(term099).toBeGreaterThan(term09);
    expect(term099 / term09).toBeCloseTo((1 - 0.9) / (1 - 0.99), 8);
  });
});

describe("cvarW1 — argument validation", () => {
  it("rejects empty samples", () => {
    expect(() => cvarW1([], { alpha: 0.9 })).toThrow(/empty/);
  });

  it("rejects α outside (0, 1)", () => {
    expect(() => cvarW1([1, 2, 3], { alpha: 0 })).toThrow(/alpha/);
    expect(() => cvarW1([1, 2, 3], { alpha: 1 })).toThrow(/alpha/);
    expect(() => cvarW1([1, 2, 3], { alpha: -0.1 })).toThrow(/alpha/);
    expect(() => cvarW1([1, 2, 3], { alpha: 1.5 })).toThrow(/alpha/);
  });

  it("rejects negative radius", () => {
    expect(() =>
      cvarW1([1, 2, 3], { alpha: 0.9, radius: -0.01 }),
    ).toThrow(/radius/);
  });

  it("rejects non-positive Lipschitz constant", () => {
    expect(() =>
      cvarW1([1, 2, 3], { alpha: 0.9, lipschitz: 0 }),
    ).toThrow(/lipschitz/);
    expect(() =>
      cvarW1([1, 2, 3], { alpha: 0.9, lipschitz: -1 }),
    ).toThrow(/lipschitz/);
  });

  it("rejects NaN samples", () => {
    expect(() =>
      cvarW1([1, 2, NaN, 4], { alpha: 0.9 }),
    ).toThrow(/NaN/);
  });
});

describe("tailDepthScore", () => {
  it("clamps below floor to 0", () => {
    expect(tailDepthScore(-5, 0, 10)).toBe(0);
    expect(tailDepthScore(0, 0, 10)).toBe(0);
  });

  it("clamps above ceiling to 10", () => {
    expect(tailDepthScore(15, 0, 10)).toBe(10);
    expect(tailDepthScore(10, 0, 10)).toBe(10);
  });

  it("interpolates linearly inside the interval", () => {
    expect(tailDepthScore(5, 0, 10)).toBeCloseTo(5, 12);
    expect(tailDepthScore(2.5, 0, 10)).toBeCloseTo(2.5, 12);
    expect(tailDepthScore(7.5, 0, 10)).toBeCloseTo(7.5, 12);
  });

  it("works on shifted scales", () => {
    expect(tailDepthScore(0, -10, 10)).toBeCloseTo(5, 12);
    expect(tailDepthScore(-5, -10, 10)).toBeCloseTo(2.5, 12);
  });

  it("rejects degenerate ranges", () => {
    expect(() => tailDepthScore(5, 10, 0)).toThrow(/ceiling/);
    expect(() => tailDepthScore(5, 5, 5)).toThrow(/ceiling/);
  });
});
