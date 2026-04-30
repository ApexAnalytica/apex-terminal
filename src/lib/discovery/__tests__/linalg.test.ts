import { describe, it, expect } from "vitest";
import { linsolve, olsFit, olsResiduals } from "../algorithms/_linalg";

describe("linsolve (Gauss elimination with partial pivoting)", () => {
  it("solves a simple 2x2 system", () => {
    const x = linsolve([
      [2, 1],
      [1, 3],
    ], [5, 10]);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(1, 9);
    expect(x![1]).toBeCloseTo(3, 9);
  });

  it("solves a 3x3 system with a row that needs pivoting", () => {
    // Row-swap needed because A[0][0] = 0.
    const A = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ];
    const b = [2, 2, 2];
    const x = linsolve(A, b);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(1, 9);
    expect(x![1]).toBeCloseTo(1, 9);
    expect(x![2]).toBeCloseTo(1, 9);
  });

  it("returns null for a singular matrix", () => {
    const x = linsolve([
      [1, 2],
      [2, 4],
    ], [3, 6]);
    expect(x).toBeNull();
  });
});

describe("olsFit / olsResiduals", () => {
  it("recovers a known linear coefficient (no intercept needed)", () => {
    // y = 3x with no noise. Z is N×1 with column = x.
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => 3 * v);
    const Z = x.map((v) => [v]);
    const beta = olsFit(Z, y);
    expect(beta).not.toBeNull();
    expect(beta![0]).toBeCloseTo(3, 9);
  });

  it("residuals are zero on a perfect fit", () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => 2 + 3 * v);
    const Z = x.map((v) => [1, v]); // intercept + slope
    const e = olsResiduals(Z, y);
    expect(e).not.toBeNull();
    for (const r of e!) expect(Math.abs(r)).toBeLessThan(1e-9);
  });

  it("residuals on a misspecified model are non-trivial", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 1, 1, 10, 10];
    const Z = x.map((v) => [1, v]);
    const e = olsResiduals(Z, y);
    expect(e).not.toBeNull();
    const sumSq = e!.reduce((s, r) => s + r * r, 0);
    expect(sumSq).toBeGreaterThan(1);
  });
});
