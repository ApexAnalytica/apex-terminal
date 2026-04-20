import { describe, it, expect } from "vitest";
import { transferEntropy } from "@/lib/estimators/transfer-entropy";
import ref from "./fixtures/te_reference.json";

// Fixture is the output of research/estimators/transfer_entropy.py on
// two seeded AR processes (n=400, nBins=4, k=l=1). Inputs are rounded
// to 6 dp BEFORE the Python reference run, so TS and Python operate on
// the same float values. Expected TE values must match to <1e-10 since
// the computation is deterministic.

describe("transferEntropy parity with Python reference", () => {
  for (const c of ref.cases) {
    describe(`case: ${c.label}`, () => {
      const r = transferEntropy(c.x, c.y, {
        nBins: ref.n_bins,
        historyK: ref.history_k,
        historyL: ref.history_l,
      });

      it("TE(X→Y) matches Python", () => {
        expect(r.teXy).toBeCloseTo(c.te_xy, 10);
      });

      it("TE(Y→X) matches Python", () => {
        expect(r.teYx).toBeCloseTo(c.te_yx, 10);
      });
    });
  }
});

describe("transferEntropy qualitative asymmetry", () => {
  const unidir = ref.cases.find((c) => c.label === "xy_unidirectional")!;
  const indep = ref.cases.find((c) => c.label === "independent")!;

  it("unidirectional coupling shows strong asymmetry", () => {
    const r = transferEntropy(unidir.x, unidir.y, { nBins: ref.n_bins });
    expect(r.teXy).toBeGreaterThan(0.05);
    expect(r.teYx).toBeLessThan(r.teXy * 0.2);
  });

  it("independent series yield near-zero TE", () => {
    const r = transferEntropy(indep.x, indep.y, { nBins: ref.n_bins });
    expect(r.teXy).toBeLessThan(0.05);
    expect(r.teYx).toBeLessThan(0.05);
  });

  it("rejects mismatched lengths", () => {
    expect(() => transferEntropy([1, 2, 3], [1, 2])).toThrow();
  });
});
