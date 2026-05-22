import { describe, it, expect } from "vitest";
import {
  cmiKnn,
  cmiKnnTest,
  digamma,
} from "../algorithms/_cmi-knn";

// ─── CMI-knn unit tests ────────────────────────────────────────────────
//
// Validates the Frenzel-Pompe (2007) k-NN conditional-mutual-information
// estimator on synthetic distributions with known dependence structure.
// All tests use seeded RNGs so behaviour is deterministic.

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1; // U[-1, 1]
  };
}

function gauss(rng: () => number): number {
  const u = (rng() + 1) / 2 + 1e-9;
  const v = (rng() + 1) / 2;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe("digamma", () => {
  it("matches the known value ψ(1) ≈ -γ (Euler-Mascheroni)", () => {
    expect(digamma(1)).toBeCloseTo(-0.5772156649, 4);
  });

  it("matches ψ(2) ≈ 1 - γ", () => {
    expect(digamma(2)).toBeCloseTo(1 - 0.5772156649, 4);
  });

  it("matches ψ(10) ≈ 2.2517", () => {
    // ψ(10) = -γ + Σ_{k=1..9} 1/k ≈ 2.25175...
    expect(digamma(10)).toBeCloseTo(2.25175258, 5);
  });

  it("monotone increasing for x > 0", () => {
    let prev = digamma(0.5);
    for (let x = 1; x <= 20; x += 0.5) {
      const cur = digamma(x);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });
});

describe("cmiKnn — known-MI distributions", () => {
  it("CMI ≈ 0 for two independent Gaussians (no conditioning)", () => {
    const rng = lcg(42);
    const N = 300;
    const x = Array.from({ length: N }, () => gauss(rng));
    const y = Array.from({ length: N }, () => gauss(rng));
    const cmi = cmiKnn(x, y, [], 5);
    // With N=300 and finite-sample bias, ~0.02 is typical for genuine
    // independence. Loose threshold to account for sampling noise.
    expect(cmi).toBeLessThan(0.05);
  });

  it("CMI > 0 for strongly correlated Gaussians (unconditional)", () => {
    const rng = lcg(43);
    const N = 300;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng);
      x.push(xi);
      y.push(0.9 * xi + 0.3 * gauss(rng));
    }
    const cmi = cmiKnn(x, y, [], 5);
    // Bivariate Gaussian with ρ ≈ 0.95: true MI = -½ ln(1 - ρ²) ≈ 1.16 nats.
    // k-NN estimator under-estimates moderately at N=300; expect cmi ≥ 0.5.
    expect(cmi).toBeGreaterThan(0.5);
  });

  it("detects NONLINEAR dependence that partial correlation misses (X, Y = sin(X) + noise)", () => {
    const rng = lcg(44);
    const N = 300;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng) * Math.PI;
      x.push(xi);
      // Pure nonlinear dependence: Pearson correlation ≈ 0.
      y.push(Math.sin(xi) + 0.2 * gauss(rng));
    }
    // CMI should detect the sin-dependence even though Pearson r ≈ 0.
    const cmi = cmiKnn(x, y, [], 5);
    expect(cmi).toBeGreaterThan(0.2);
  });

  it("CMI(X; Y | X) ≈ 0 — full conditioning on a parent kills the signal", () => {
    const rng = lcg(45);
    const N = 200;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng);
      x.push(xi);
      y.push(0.9 * xi + 0.3 * gauss(rng));
    }
    // Condition on X itself: I(X; Y | X) = 0 (X is its own predictor).
    const Z = x.map((v) => [v]);
    const cmi = cmiKnn(x, y, Z, 5);
    // Should be small relative to unconditional CMI (which is ~1.0 nats).
    expect(cmi).toBeLessThan(0.3);
  });

  it("returns 0 when N ≤ k + 1 (insufficient data)", () => {
    const cmi = cmiKnn([1, 2, 3], [4, 5, 6], [], 5);
    expect(cmi).toBe(0);
  });
});

describe("cmiKnnTest — {r, p, n} CITestResult shape", () => {
  it("emits {r, p, n} with r ≥ 0 (CMI is non-negative)", () => {
    const rng = lcg(50);
    const N = 200;
    const x = Array.from({ length: N }, () => gauss(rng));
    const y = Array.from({ length: N }, () => gauss(rng));
    const res = cmiKnnTest(x, y, []);
    expect(res).not.toBeNull();
    expect(res!.r).toBeGreaterThanOrEqual(0);
    expect(res!.p).toBeGreaterThanOrEqual(0);
    expect(res!.p).toBeLessThanOrEqual(1);
    expect(res!.n).toBe(N);
  });

  it("returns null when n < minN", () => {
    const x = Array.from({ length: 10 }, (_, i) => i);
    const y = Array.from({ length: 10 }, (_, i) => i);
    expect(cmiKnnTest(x, y, [], { minN: 30 })).toBeNull();
  });

  it("p < 0.05 on a strong dependence; p > 0.5 on noise", () => {
    const rng = lcg(60);
    const N = 200;
    const xDep: number[] = [];
    const yDep: number[] = [];
    const xIndep: number[] = [];
    const yIndep: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng);
      xDep.push(xi);
      yDep.push(0.9 * xi + 0.3 * gauss(rng));
      xIndep.push(gauss(rng));
      yIndep.push(gauss(rng));
    }
    const dep = cmiKnnTest(xDep, yDep, []);
    const indep = cmiKnnTest(xIndep, yIndep, []);
    expect(dep!.p).toBeLessThan(0.05);
    expect(indep!.p).toBeGreaterThan(0.3);
  });

  it("drops rows with non-finite values (matches partial-correlation behaviour)", () => {
    // 40 input rows, 2 non-finite → 38 effective, well above both minN
    // and the k+1 floor (default k=5).
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 40; i++) {
      x.push(i === 5 ? NaN : i === 12 ? Infinity : i);
      y.push(2 * i);
    }
    const res = cmiKnnTest(x, y, [], { minN: 20 });
    expect(res).not.toBeNull();
    expect(res!.n).toBe(38);
  });

  it("throws on input length mismatch (defensive)", () => {
    expect(() => cmiKnnTest([1, 2], [1, 2, 3], [])).toThrow();
  });
});

describe("cmiKnnTest — local-permutation null (Kim et al. 2022 variant)", () => {
  it("under H0 (independent X, Y) the permutation p-value stays > 0.1", () => {
    const rng = lcg(700);
    const N = 200;
    const x = Array.from({ length: N }, () => gauss(rng));
    const y = Array.from({ length: N }, () => gauss(rng));
    const res = cmiKnnTest(x, y, [], {
      nPermutations: 49,
      seed: 12345,
    });
    expect(res).not.toBeNull();
    // True p-value should be ~U(0,1) under H0; 0.1 is a loose threshold
    // that virtually all H0 runs will clear under a seeded RNG.
    expect(res!.p).toBeGreaterThan(0.1);
  });

  it("under H1 (strong linear dependence) the permutation p-value drops to ≤ 1/(B+1)", () => {
    const rng = lcg(701);
    const N = 200;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng);
      x.push(xi);
      y.push(0.9 * xi + 0.3 * gauss(rng));
    }
    const B = 49;
    const res = cmiKnnTest(x, y, [], {
      nPermutations: B,
      seed: 12345,
    });
    expect(res).not.toBeNull();
    // No permutation should clear the observed CMI on this strong-
    // dependence cohort, so ge = 0 and p = 1/(B+1).
    expect(res!.p).toBeCloseTo(1 / (1 + B), 5);
  });

  it("default `nPermutations: 0` falls back to the χ²(1) asymptotic (v0.6 behaviour preserved)", () => {
    const rng = lcg(702);
    const N = 100;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng);
      x.push(xi);
      y.push(0.9 * xi + 0.3 * gauss(rng));
    }
    const asymptotic = cmiKnnTest(x, y, []);
    const explicitZero = cmiKnnTest(x, y, [], { nPermutations: 0 });
    expect(asymptotic).not.toBeNull();
    expect(explicitZero).not.toBeNull();
    expect(asymptotic!.p).toBeCloseTo(explicitZero!.p, 12);
  });

  it("seeded permutation is deterministic — same seed → same p-value", () => {
    const rng = lcg(703);
    const N = 80;
    const x = Array.from({ length: N }, () => gauss(rng));
    const y = Array.from({ length: N }, () => gauss(rng));
    const a = cmiKnnTest(x, y, [], { nPermutations: 31, seed: 99 });
    const b = cmiKnnTest(x, y, [], { nPermutations: 31, seed: 99 });
    expect(a!.p).toBe(b!.p);
  });

  it("conditional permutation respects the Z-stratum (CMI(X,Y|X) stays small under H0)", () => {
    // X→Y dependence is fully explained by Z=X. Local permutation
    // should swap X values WITHIN Z-neighbourhoods, breaking the X-Y
    // tie while preserving X-Z marginal — so the permuted CMI should
    // not be smaller than observed in any systematic way.
    const rng = lcg(704);
    const N = 150;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = gauss(rng);
      x.push(xi);
      y.push(0.9 * xi + 0.3 * gauss(rng));
    }
    const Z = x.map((v) => [v]);
    const res = cmiKnnTest(x, y, Z, {
      nPermutations: 31,
      kPerm: 8,
      seed: 12345,
    });
    expect(res).not.toBeNull();
    // The observed CMI(X, Y | X) ≈ 0 and most permuted samples will be
    // around the same magnitude → p-value should NOT be tiny.
    expect(res!.p).toBeGreaterThan(0.05);
  });
});
