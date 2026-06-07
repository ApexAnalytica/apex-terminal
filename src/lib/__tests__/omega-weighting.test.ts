import { describe, it, expect } from "vitest";
import { weightedComposite, recomputeComposite } from "@/lib/omega-weighting";
import {
  GEOPOLITICAL_PROFILE,
  T1D_PROFILE,
  AI_SAFETY_PROFILE,
  formatWeights,
} from "@/lib/domain-profiles";
import { DEFAULT_OMEGA_WEIGHTS } from "@/lib/types";
import type {
  CausalGraph,
  CausalNode,
  OmegaFragilityProfile,
  OmegaPillarWeights,
} from "@/lib/types";

// The pre-refactor inline formula from enrich.ts, kept verbatim here so the
// extracted helper is pinned to the exact behaviour it replaced.
function legacyComposite(p: OmegaFragilityProfile, w: OmegaPillarWeights): number {
  return (
    Math.round(
      (w.irreplaceability * p.irreplaceability +
        w.restorationLatency * p.restorationLatency +
        w.jurisdictionalHazard * p.jurisdictionalHazard +
        w.cascadeLoad * p.cascadeLoad +
        w.tailDepth * p.tailDepth) *
        10,
    ) / 10
  );
}

function omega(
  composite: number,
  i: number,
  r: number,
  j: number,
  c: number,
  t: number,
): OmegaFragilityProfile {
  return {
    composite,
    irreplaceability: i,
    restorationLatency: r,
    jurisdictionalHazard: j,
    cascadeLoad: c,
    tailDepth: t,
  };
}

function node(id: string, o: OmegaFragilityProfile): CausalNode {
  // Only omegaFragility matters to the weighting transform; cast keeps the
  // fixture small (the transform spreads the rest of the node untouched).
  return { id, omegaFragility: o } as unknown as CausalNode;
}

function graph(nodes: CausalNode[]): CausalGraph {
  return { nodes, edges: [], metadata: {} } as unknown as CausalGraph;
}

describe("weightedComposite", () => {
  it("matches the legacy inline enrich.ts formula across varied pillar sets", () => {
    const samples: OmegaFragilityProfile[] = [
      omega(0, 7.0, 7.5, 7.5, 10, 5.0),
      omega(0, 8.5, 6.0, 5.5, 8.5, 7.0),
      omega(0, 1, 1, 1, 1, 1),
      omega(0, 10, 10, 10, 10, 10),
      omega(0, 3.3, 9.1, 4.7, 6.2, 2.8),
    ];
    const weightSets = [
      DEFAULT_OMEGA_WEIGHTS,
      AI_SAFETY_PROFILE.weights,
      { irreplaceability: 0.2, restorationLatency: 0.2, jurisdictionalHazard: 0.2, cascadeLoad: 0.2, tailDepth: 0.2 },
    ];
    for (const p of samples) {
      for (const w of weightSets) {
        expect(weightedComposite(p, w)).toBe(legacyComposite(p, w));
      }
    }
  });

  it("reproduces the hand-authored East-West Pipeline composite (7.6) under default weights", () => {
    // graph-data.ts: omega(7.6, 7.0, 7.5, 7.5, 10, 5.0) — evidence the authored
    // literals were tuned against DEFAULT_OMEGA_WEIGHTS (J 0.15 / C 0.25).
    expect(weightedComposite(omega(0, 7.0, 7.5, 7.5, 10, 5.0), DEFAULT_OMEGA_WEIGHTS)).toBe(7.6);
  });
});

describe("profile weight integrity", () => {
  it("every profile's weights sum to 1.0", () => {
    for (const profile of [GEOPOLITICAL_PROFILE, T1D_PROFILE, AI_SAFETY_PROFILE]) {
      const w = profile.weights;
      const sum =
        w.irreplaceability +
        w.restorationLatency +
        w.jurisdictionalHazard +
        w.cascadeLoad +
        w.tailDepth;
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it("geopolitical and T1D keep the platform default; AI-Safety skews to C+T", () => {
    expect(GEOPOLITICAL_PROFILE.weights).toEqual(DEFAULT_OMEGA_WEIGHTS);
    expect(T1D_PROFILE.weights).toEqual(DEFAULT_OMEGA_WEIGHTS);
    expect(GEOPOLITICAL_PROFILE.compositeMode).toBe("authored");
    expect(T1D_PROFILE.compositeMode).toBe("authored");
    expect(AI_SAFETY_PROFILE.compositeMode).toBe("recomputed");
    expect(AI_SAFETY_PROFILE.weights.cascadeLoad).toBe(0.3);
    expect(AI_SAFETY_PROFILE.weights.tailDepth).toBe(0.3);
    // cascade + tail dominate
    expect(AI_SAFETY_PROFILE.weights.cascadeLoad + AI_SAFETY_PROFILE.weights.tailDepth).toBeCloseTo(0.6, 10);
  });

  it("AI-Safety honors the dissertation-sourced rank-order C ≈ T > R > I ≈ J", () => {
    // Per Ghauri (2025): cascade-bridge attention predicts endogenous failure
    // far more strongly than generic connectivity (ρ(FR,BES) ≈ 0.76 vs
    // ρ(FR,HES) ≈ 0.25, Ch 8 Table 8.1), and CVaR under distributional
    // ambiguity is the governing tail metric (Ch 3). That evidence sources the
    // ORDER, not the magnitudes — so this guard asserts the ranking (C, T are
    // the two largest; R exceeds I and J), which is the part the dissertation
    // actually justifies.
    const w = AI_SAFETY_PROFILE.weights;
    expect(Math.min(w.cascadeLoad, w.tailDepth)).toBeGreaterThan(w.restorationLatency);
    expect(w.restorationLatency).toBeGreaterThanOrEqual(w.irreplaceability);
    expect(w.restorationLatency).toBeGreaterThanOrEqual(w.jurisdictionalHazard);
    expect(w.cascadeLoad + w.tailDepth).toBeGreaterThan(0.5);
  });
});

describe("recomputeComposite", () => {
  const pipeline = omega(7.6, 7.0, 7.5, 7.5, 10, 5.0);

  it("is a no-op for authored profiles (geopolitical) — composite untouched, no baseline stamped", () => {
    const g = graph([node("n1", { ...pipeline })]);
    const out = recomputeComposite(g, GEOPOLITICAL_PROFILE);
    expect(out.nodes[0].omegaFragility.composite).toBe(7.6);
    expect(out.nodes[0].omegaFragility.baselineComposite).toBeUndefined();
  });

  it("reweights under a recomputed profile (AI-Safety) and preserves the authored baseline", () => {
    const g = graph([node("n1", { ...pipeline })]);
    const out = recomputeComposite(g, AI_SAFETY_PROFILE);
    const o = out.nodes[0].omegaFragility;
    expect(o.composite).toBe(weightedComposite(pipeline, AI_SAFETY_PROFILE.weights));
    expect(o.baselineComposite).toBe(7.6);
    // pipeline is already high-cascade, so the C+T skew nudges it down slightly
    expect(o.composite).toBeLessThan(7.6);
  });

  it("moves a high-tail / low-cascade node UP under the AI-Safety skew", () => {
    // authored-ish node with modest cascade but severe tail
    const tailHeavy = omega(5.0, 4, 4, 4, 3, 10);
    const g = graph([node("n1", { ...tailHeavy })]);
    const out = recomputeComposite(g, AI_SAFETY_PROFILE);
    expect(out.nodes[0].omegaFragility.composite).toBeGreaterThan(
      weightedComposite(tailHeavy, DEFAULT_OMEGA_WEIGHTS),
    );
  });

  it("is idempotent — re-applying keeps the FIRST-seen authored baseline", () => {
    const g = graph([node("n1", { ...pipeline })]);
    const once = recomputeComposite(g, AI_SAFETY_PROFILE);
    const twice = recomputeComposite(once, AI_SAFETY_PROFILE);
    expect(twice.nodes[0].omegaFragility.composite).toBe(once.nodes[0].omegaFragility.composite);
    expect(twice.nodes[0].omegaFragility.baselineComposite).toBe(7.6);
  });

  it("does not mutate the input graph", () => {
    const original = omega(7.6, 7.0, 7.5, 7.5, 10, 5.0);
    const g = graph([node("n1", original)]);
    recomputeComposite(g, AI_SAFETY_PROFILE);
    expect(g.nodes[0].omegaFragility.composite).toBe(7.6);
    expect(g.nodes[0].omegaFragility.baselineComposite).toBeUndefined();
  });
});

describe("formatWeights (methodology prose derivation)", () => {
  it("renders the canonical default tuple", () => {
    expect(formatWeights(DEFAULT_OMEGA_WEIGHTS)).toBe(
      "I(0.25) + R(0.20) + J(0.15) + C(0.25) + T(0.15)",
    );
  });

  it("renders the AI-Safety skew", () => {
    expect(formatWeights(AI_SAFETY_PROFILE.weights)).toBe(
      "I(0.10) + R(0.20) + J(0.10) + C(0.30) + T(0.30)",
    );
  });

  it("the methodology prose contains the formatted weights (no drift)", () => {
    expect(GEOPOLITICAL_PROFILE.compositeMethodology).toContain(
      formatWeights(GEOPOLITICAL_PROFILE.weights),
    );
    expect(T1D_PROFILE.compositeMethodology).toContain(formatWeights(T1D_PROFILE.weights));
    expect(AI_SAFETY_PROFILE.compositeMethodology).toContain(
      formatWeights(AI_SAFETY_PROFILE.weights),
    );
  });
});
