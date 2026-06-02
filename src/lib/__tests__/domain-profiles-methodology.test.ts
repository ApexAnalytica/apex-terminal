import { describe, it, expect } from "vitest";

import {
  GEOPOLITICAL_PROFILE,
  T1D_PROFILE,
  AI_SAFETY_PROFILE,
} from "../domain-profiles";
import { DEFAULT_OMEGA_WEIGHTS } from "../types";

// The composite-methodology prose must stay derived from the single source of
// truth (DEFAULT_OMEGA_WEIGHTS — the weights the engine actually aggregates
// with in import/enrich.ts). These tests independently rebuild the expected
// weight strings from that constant and assert the prose contains them, so any
// future drift (e.g. someone re-hardcoding the numbers, or retuning the weights
// without updating copy) fails here.

const W = DEFAULT_OMEGA_WEIGHTS;
const f = (n: number) => n.toFixed(2);

const expectedInline =
  `I(${f(W.irreplaceability)}) + R(${f(W.restorationLatency)}) + ` +
  `J(${f(W.jurisdictionalHazard)}) + C(${f(W.cascadeLoad)}) + T(${f(W.tailDepth)})`;

const expectedSlash = [
  W.irreplaceability,
  W.restorationLatency,
  W.jurisdictionalHazard,
  W.cascadeLoad,
  W.tailDepth,
]
  .map(f)
  .join(" / ");

describe("ΩF composite-methodology prose ↔ DEFAULT_OMEGA_WEIGHTS", () => {
  it("the encoded weights still sum to 1.0", () => {
    const sum =
      W.irreplaceability +
      W.restorationLatency +
      W.jurisdictionalHazard +
      W.cascadeLoad +
      W.tailDepth;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("geopolitical methodology states the derived inline weights", () => {
    expect(GEOPOLITICAL_PROFILE.compositeMethodology).toContain(expectedInline);
  });

  it("T1D methodology states the derived slash weights", () => {
    expect(T1D_PROFILE.compositeMethodology).toContain(expectedSlash);
  });

  it("AI-Safety methodology states the derived (encoded) inline weights", () => {
    expect(AI_SAFETY_PROFILE.compositeMethodology).toContain(expectedInline);
  });

  it("no profile carries the old, drifted weight literals", () => {
    const all = [
      GEOPOLITICAL_PROFILE.compositeMethodology,
      T1D_PROFILE.compositeMethodology,
      AI_SAFETY_PROFILE.compositeMethodology,
    ].join("\n");
    // Stale geopolitical/T1D values (J/C were wrong: 0.20/0.20 vs 0.15/0.25).
    expect(all).not.toContain("J(0.20) + C(0.20)");
    expect(all).not.toContain("0.20 / 0.20 / 0.20");
    // The AI string used to assert an encoded skew the engine never applies.
    expect(all).not.toContain("C(0.30) and T(0.30)");
  });
});
