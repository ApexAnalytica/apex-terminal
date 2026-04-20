import { describe, it, expect } from "vitest";
import {
  betti1FromDiagram,
  medianPairwiseDistance,
  pairwiseDistancesUpper,
  takensEmbedding,
} from "@/lib/estimators/persistent-homology";
import ref from "./fixtures/takens_reference.json";

// Reference from research/estimators/persistent_homology.py — sinusoid
// and noise signals with dim=3, delay=5 embedding; inputs rounded to
// 8 dp upstream so TS/Python operate on identical floats.

describe("takensEmbedding parity", () => {
  for (const label of ["sin", "noise"] as const) {
    describe(`signal: ${label}`, () => {
      const r = ref[label];
      const emb = takensEmbedding(r.signal, ref.dim, ref.delay);

      it("produces matching shape", () => {
        expect(emb.length).toBe(r.embedding_shape[0]);
        expect(emb[0].length).toBe(r.embedding_shape[1]);
      });

      it("matches the first 5 rows exactly", () => {
        for (let i = 0; i < 5; i++) {
          for (let k = 0; k < ref.dim; k++) {
            expect(emb[i][k]).toBeCloseTo(r.embedding_first_5[i][k], 12);
          }
        }
      });

      it("matches the last 5 rows exactly", () => {
        const m = emb.length;
        for (let i = 0; i < 5; i++) {
          for (let k = 0; k < ref.dim; k++) {
            expect(emb[m - 5 + i][k]).toBeCloseTo(
              r.embedding_last_5[i][k],
              12,
            );
          }
        }
      });

      it("median pairwise distance matches numpy", () => {
        expect(medianPairwiseDistance(emb)).toBeCloseTo(
          r.median_pairwise_distance,
          10,
        );
      });
    });
  }
});

describe("pairwiseDistancesUpper", () => {
  it("returns n*(n-1)/2 distances", () => {
    const pts = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const d = pairwiseDistancesUpper(pts);
    expect(d).toHaveLength(6);
    expect(d[0]).toBeCloseTo(1, 12);
    expect(d[5]).toBeCloseTo(1, 12);
    expect(d[2]).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe("betti1FromDiagram", () => {
  it("counts H1 intervals alive at given epsilon", () => {
    const h1 = [
      { birth: 0.1, death: 0.5 },
      { birth: 0.2, death: Infinity },
      { birth: 0.4, death: 0.6 },
    ];
    expect(betti1FromDiagram(h1, 0.3).beta1).toBe(2);
    expect(betti1FromDiagram(h1, 0.55).beta1).toBe(2);
    expect(betti1FromDiagram(h1, 0.7).beta1).toBe(1);
    expect(betti1FromDiagram(h1, 0.05).beta1).toBe(0);
  });

  it("returns max persistence of finite bars only", () => {
    const h1 = [
      { birth: 0, death: 0.3 },
      { birth: 0.1, death: Infinity },
      { birth: 0.2, death: 0.9 },
    ];
    expect(betti1FromDiagram(h1, 0).maxPersistence).toBeCloseTo(0.7, 12);
  });
});
