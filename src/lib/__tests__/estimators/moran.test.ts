import { describe, it, expect } from "vitest";
import {
  bivariateMoransI,
  knnWeights,
  moransI,
} from "@/lib/estimators/moran";
import ref from "./fixtures/moran_reference.json";

// Reference output of research/estimators/spatial_coupling.py on a 10×10
// grid with k=4 rook-contiguity weights. The fixture pins both the
// coords AND the weight matrix W so the Moran-I test is independent of
// k-NN tie-break differences between sklearn and this TS port.

const W = ref.W as number[][];

describe("moransI parity with Python reference", () => {
  it("matches on smooth bump (strong positive clustering)", () => {
    const r = moransI(ref.fields.bump, W, { nPermutations: 0 });
    expect(r.I).toBeCloseTo(ref.univariate.bump.I, 10);
    expect(r.expected).toBeCloseTo(ref.univariate.bump.expected, 12);
  });

  it("matches on checkerboard (negative)", () => {
    const r = moransI(ref.fields.checker, W, { nPermutations: 0 });
    expect(r.I).toBeCloseTo(ref.univariate.checker.I, 10);
  });

  it("matches on random field (≈ 0)", () => {
    const r = moransI(ref.fields.random, W, { nPermutations: 0 });
    expect(r.I).toBeCloseTo(ref.univariate.random.I, 10);
  });
});

describe("bivariateMoransI parity", () => {
  it("matches on coupled fields", () => {
    const I = bivariateMoransI(
      ref.fields.x_coupled,
      ref.fields.y_coupled,
      W,
    );
    expect(I).toBeCloseTo(ref.bivariate.coupled, 10);
  });

  it("matches on independent fields", () => {
    const I = bivariateMoransI(
      ref.fields.x_indep,
      ref.fields.y_indep,
      W,
    );
    expect(I).toBeCloseTo(ref.bivariate.independent, 10);
  });
});

describe("knnWeights construction", () => {
  const W2 = knnWeights(ref.coords as number[][], ref.k);

  it("is symmetric and has total weight = n on a regular grid", () => {
    // After symmetrization each cell's weight equals its twin's, and
    // the total weight is n (since row-standardized row-sums = 1 and
    // (W + W^T)/2 preserves total mass).
    let total = 0;
    for (let i = 0; i < W2.length; i++) {
      for (let j = 0; j < W2.length; j++) {
        expect(W2[i][j]).toBeCloseTo(W2[j][i], 12);
        total += W2[i][j];
      }
    }
    expect(total).toBeCloseTo(ref.n, 6);
  });

  it("yields qualitatively correct Moran's I with TS-built weights", () => {
    // Even with edge-cell k-NN tie-breaks that differ from sklearn,
    // the overall Moran's I should preserve sign and rough magnitude
    // on the three canonical regimes.
    const bump = moransI(ref.fields.bump, W2, { nPermutations: 0 });
    const checker = moransI(ref.fields.checker, W2, { nPermutations: 0 });
    const rand = moransI(ref.fields.random, W2, { nPermutations: 0 });
    expect(bump.I).toBeGreaterThan(0.7);
    expect(checker.I).toBeLessThan(-0.5);
    expect(Math.abs(rand.I)).toBeLessThan(0.15);
  });
});

describe("moransI permutation p-value sanity", () => {
  it("bump is extremely unlikely under permutation null", () => {
    const r = moransI(ref.fields.bump, W, { nPermutations: 99, seed: 42 });
    // Strong clustering — no permutation should be as extreme.
    expect(r.pPerm).toBeLessThanOrEqual(0.02);
  });

  it("random field lands near uniform under permutation null", () => {
    const r = moransI(ref.fields.random, W, { nPermutations: 199, seed: 42 });
    // Don't pin exact p — just make sure it's not absurdly tiny.
    expect(r.pPerm).toBeGreaterThan(0.1);
  });
});
