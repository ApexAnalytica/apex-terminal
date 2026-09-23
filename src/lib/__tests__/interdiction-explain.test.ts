import { describe, expect, it } from "vitest";

import {
  damageDeltaNarrative,
  explainIntervention,
  mechanismNarrative,
  rankNarrative,
  stepContextForIntervention,
} from "@/lib/interdiction-explain";
import type {
  InterdictionCandidate,
  InterdictionResult,
} from "@/lib/interdiction-engine";
import type { CausalEdge, CausalGraph, CausalNode } from "@/lib/types";

// ─── Fixtures ─────────────────────────────────────────────────────

function node(id: string, extra: Partial<CausalNode> = {}): CausalNode {
  return {
    id,
    label: `Node ${id}`,
    shortLabel: id.toUpperCase(),
    category: "manufacturing",
    omegaFragility: {
      composite: 5,
      irreplaceability: 5,
      restorationLatency: 5,
      jurisdictionalHazard: 5,
      cascadeLoad: 5,
      tailDepth: 5,
    },
    globalConcentration: "",
    replacementTime: "",
    domain: "Test",
    discoverySource: "merged",
    isConfounded: false,
    isRestricted: false,
    ...extra,
  };
}

function edge(
  source: string,
  target: string,
  extra: Partial<CausalEdge> = {},
): CausalEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    weight: 0.5,
    lag: 0,
    type: "directed",
    confidence: 0.5,
    isInconsistent: false,
    physicalMechanism: `${source} drives ${target}`,
    ...extra,
  };
}

function graph(nodes: CausalNode[], edges: CausalEdge[]): CausalGraph {
  return {
    nodes,
    edges,
    metadata: {
      density: 0.1,
      constraintType: "test",
      verificationStatus: "UNVERIFIED",
      totalNodes: nodes.length,
      totalEdges: edges.length,
      inconsistentEdges: 0,
      restrictedNodes: 0,
    },
  };
}

function ivEdge(
  edgeId: string,
  damage: number,
  marginalReduction: number,
): InterdictionCandidate {
  return {
    target: { type: "edge", id: edgeId, label: edgeId },
    damage,
    marginalReduction,
  };
}

function ivNode(
  nodeId: string,
  damage: number,
  marginalReduction: number,
): InterdictionCandidate {
  return {
    target: { type: "node", id: nodeId, label: nodeId.toUpperCase() },
    damage,
    marginalReduction,
  };
}

function result(
  baseline: number,
  ivs: InterdictionCandidate[],
): InterdictionResult {
  return {
    interventions: ivs,
    baselineDamage: baseline,
    bestDamage: ivs.length > 0 ? ivs[ivs.length - 1].damage : baseline,
    reductionPct: 0,
  };
}

// ─── stepContextForIntervention ───────────────────────────────────

describe("stepContextForIntervention", () => {
  it("uses baselineDamage as damageBefore for the first step", () => {
    const r = result(80, [ivEdge("a__b", 60, 20)]);
    const ctx = stepContextForIntervention(r, 0);
    expect(ctx).not.toBeNull();
    expect(ctx!.damageBefore).toBe(80);
    expect(ctx!.damageAfter).toBe(60);
    expect(ctx!.marginalReduction).toBe(20);
    expect(ctx!.step).toBe(1);
    expect(ctx!.totalSteps).toBe(1);
  });

  it("uses prior step's damage as damageBefore for subsequent steps", () => {
    const r = result(80, [
      ivEdge("a__b", 60, 20),
      ivEdge("c__d", 45, 15),
      ivEdge("e__f", 40, 5),
    ]);
    const ctx2 = stepContextForIntervention(r, 1);
    expect(ctx2!.damageBefore).toBe(60); // prior step's damage
    expect(ctx2!.damageAfter).toBe(45);
    expect(ctx2!.marginalReduction).toBe(15);
    expect(ctx2!.step).toBe(2);
    expect(ctx2!.totalSteps).toBe(3);

    const ctx3 = stepContextForIntervention(r, 2);
    expect(ctx3!.damageBefore).toBe(45);
    expect(ctx3!.damageAfter).toBe(40);
  });

  it("computes stepReductionPct as a fraction of damageBefore, not baseline", () => {
    // Step 2: damageBefore=60, marginal=15 → 25% of remaining damage,
    // NOT 18.75% (which would be 15/80, the wrong denominator).
    const r = result(80, [ivEdge("a__b", 60, 20), ivEdge("c__d", 45, 15)]);
    const ctx2 = stepContextForIntervention(r, 1);
    expect(ctx2!.stepReductionPct).toBeCloseTo(25, 1);
  });

  it("returns null for out-of-range index", () => {
    const r = result(80, [ivEdge("a__b", 60, 20)]);
    expect(stepContextForIntervention(r, 1)).toBeNull();
    expect(stepContextForIntervention(r, -1)).toBeNull();
  });

  it("returns 0 stepReductionPct when damageBefore is 0", () => {
    // Defensive — solver shouldn't emit this, but guarantees no div-by-zero
    // surfaces in the UI.
    const r = result(0, [ivEdge("a__b", 0, 0)]);
    const ctx = stepContextForIntervention(r, 0);
    expect(ctx!.stepReductionPct).toBe(0);
  });
});

// ─── rankNarrative ────────────────────────────────────────────────

describe("rankNarrative", () => {
  it("step 1 reads as 'highest-impact'", () => {
    const r = result(80, [ivEdge("a__b", 60, 20), ivEdge("c__d", 45, 15)]);
    const ctx = stepContextForIntervention(r, 0)!;
    expect(rankNarrative(ctx).toLowerCase()).toContain("highest-impact");
  });

  it("last step in a multi-step result explains the conditional ranking", () => {
    const r = result(80, [
      ivEdge("a__b", 60, 20),
      ivEdge("c__d", 45, 15),
      ivEdge("e__f", 40, 5),
    ]);
    const ctx = stepContextForIntervention(r, 2)!;
    // Should reference the prior cuts driving damage down.
    expect(rankNarrative(ctx).toLowerCase()).toMatch(/prior.*cuts|drove.*down|already/);
  });

  it("single-step result reads as highest-impact (not 'best remaining')", () => {
    // Step 1 of 1 — the "last step" branch must NOT fire and produce
    // the "prior cuts already drove damage down" phrasing, because
    // there were no prior cuts.
    const r = result(80, [ivEdge("a__b", 60, 20)]);
    const ctx = stepContextForIntervention(r, 0)!;
    expect(rankNarrative(ctx).toLowerCase()).toContain("highest-impact");
    expect(rankNarrative(ctx).toLowerCase()).not.toMatch(/prior.*cuts/);
  });

  it("middle steps describe the conditional pick without claiming 'last'", () => {
    const r = result(80, [
      ivEdge("a__b", 60, 20),
      ivEdge("c__d", 45, 15),
      ivEdge("e__f", 40, 5),
    ]);
    const ctx = stepContextForIntervention(r, 1)!;
    const text = rankNarrative(ctx).toLowerCase();
    expect(text).toContain("step 2 of 3");
    expect(text).toContain("conditional");
  });
});

// ─── damageDeltaNarrative ─────────────────────────────────────────

describe("damageDeltaNarrative", () => {
  it("includes the before, after, and saving amounts", () => {
    const r = result(80, [ivEdge("a__b", 60, 20)]);
    const ctx = stepContextForIntervention(r, 0)!;
    const text = damageDeltaNarrative(ctx);
    expect(text).toContain("80.0");
    expect(text).toContain("60.0");
    expect(text).toContain("20.0");
  });

  it("includes the % reduction line when damageBefore > 0", () => {
    const r = result(80, [ivEdge("a__b", 60, 20)]);
    const ctx = stepContextForIntervention(r, 0)!;
    expect(damageDeltaNarrative(ctx)).toMatch(/25%/);
  });

  it("omits the % reduction when damageBefore is 0", () => {
    const r = result(0, [ivEdge("a__b", 0, 0)]);
    const ctx = stepContextForIntervention(r, 0)!;
    // No '%' substring at all when the denominator is 0.
    expect(damageDeltaNarrative(ctx)).not.toContain("%");
  });
});

// ─── mechanismNarrative ───────────────────────────────────────────

describe("mechanismNarrative", () => {
  it("edge cut surfaces source/target labels, weight, and mechanism prose", () => {
    const g = graph(
      [node("a"), node("b")],
      [edge("a", "b", { weight: 0.84, physicalMechanism: "powers downstream load" })],
    );
    const iv = ivEdge("a__b", 60, 20);
    const lines = mechanismNarrative(iv, g);
    expect(lines[0]).toContain("0.84");
    expect(lines[0]).toContain("A");
    expect(lines[0]).toContain("B");
    expect(lines[1]).toContain("powers downstream load");
  });

  it("edge cut without physicalMechanism omits the mechanism line", () => {
    const g = graph(
      [node("a"), node("b")],
      [edge("a", "b", { physicalMechanism: "" })],
    );
    const lines = mechanismNarrative(ivEdge("a__b", 60, 20), g);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("0.50");
  });

  it("node ablation counts outgoing + incoming non-severed edges", () => {
    const g = graph(
      [node("hub"), node("a"), node("b"), node("c")],
      [
        edge("hub", "a"),
        edge("hub", "b"),
        edge("c", "hub"),
      ],
    );
    const lines = mechanismNarrative(ivNode("hub", 60, 20), g);
    expect(lines[0]).toContain("Node hub");
    expect(lines[1]).toMatch(/2 outgoing/);
    expect(lines[1]).toMatch(/1 incoming/);
  });

  it("severed edges are not counted in the outgoing/incoming totals", () => {
    const g = graph(
      [node("hub"), node("a"), node("b")],
      [
        edge("hub", "a"),
        edge("hub", "b", { isSevered: true }),
        edge("a", "hub", { isSevered: true }),
      ],
    );
    const lines = mechanismNarrative(ivNode("hub", 60, 20), g);
    expect(lines[1]).toMatch(/1 outgoing/);
    expect(lines[1]).toMatch(/0 incoming/);
  });

  it("falls back gracefully when the target id isn't in the graph", () => {
    // Solver wrote a candidate referencing a node/edge that's since been
    // removed from the graph (edge case but defensive). UI should still
    // render something useful instead of crashing.
    const g = graph([node("a")], []);
    expect(mechanismNarrative(ivEdge("ghost__edge", 60, 20), g).length).toBeGreaterThan(0);
    expect(mechanismNarrative(ivNode("ghost_node", 60, 20), g).length).toBeGreaterThan(0);
  });
});

// ─── explainIntervention (bundle) ─────────────────────────────────

describe("explainIntervention", () => {
  it("returns rank + damageDelta + mechanism for a valid index", () => {
    const g = graph(
      [node("a"), node("b")],
      [edge("a", "b", { physicalMechanism: "powers grid" })],
    );
    const r = result(80, [ivEdge("a__b", 60, 20)]);
    const explanation = explainIntervention(r, 0, g);
    expect(explanation).not.toBeNull();
    expect(explanation!.rank).toBeTruthy();
    expect(explanation!.damageDelta).toContain("80");
    expect(explanation!.mechanism[1]).toContain("powers grid");
  });

  it("returns null for out-of-range index", () => {
    const g = graph([node("a")], []);
    const r = result(80, []);
    expect(explainIntervention(r, 0, g)).toBeNull();
  });
});
