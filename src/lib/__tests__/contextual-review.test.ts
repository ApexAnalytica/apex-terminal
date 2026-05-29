import { describe, it, expect } from "vitest";
import {
  buildContextualReview,
  type ContextualReviewInputs,
} from "@/lib/contextual-review";
import type { CausalNode, CausalEdge } from "@/lib/types";
import type { TarskiValidationReport } from "@/lib/tarski-flags";

// ─── buildContextualReview tests ──────────────────────────────────────
//
// Pure synthesis function — drives the "REVIEW" block at the top of
// NodeInspector. These tests pin (a) the urgency ordering (red → amber
// → green), (b) the 3-recommendation cap, and (c) that each signal
// fires under its specified condition. Adding a new signal? Add a
// test here that exercises it in isolation.

function makeNode(overrides: Partial<CausalNode> = {}): CausalNode {
  return {
    id: "n1",
    label: "Test Node",
    shortLabel: "TN",
    category: "infrastructure",
    omegaFragility: {
      composite: 5,
      irreplaceability: 5,
      restorationLatency: 5,
      jurisdictionalHazard: 5,
      cascadeLoad: 5,
      tailDepth: 5,
    },
    globalConcentration: "test",
    replacementTime: "test",
    domain: "energy",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<CausalEdge> = {}): CausalEdge {
  return {
    id: "e1",
    source: "n1",
    target: "n2",
    weight: 0.5,
    lag: 1,
    type: "directed",
    confidence: 0.7,
    isInconsistent: false,
    physicalMechanism: "test",
    ...overrides,
  };
}

const EMPTY_INPUTS: ContextualReviewInputs = {
  node: makeNode(),
  graph: { edges: [] },
  tarskiReport: null,
  history: [],
  chiStarSet: new Set(),
};

describe("buildContextualReview — empty / healthy node", () => {
  it("returns no recommendations when no signals fire", () => {
    expect(buildContextualReview(EMPTY_INPUTS)).toEqual([]);
  });
});

describe("buildContextualReview — Tarski axiom hits on incident edges", () => {
  it("fires red when proof traces touch incident edges", () => {
    const node = makeNode();
    const edge = makeEdge({ id: "incident-edge", source: "n1", target: "n2" });
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["incident-edge"]),
      restrictedNodeIds: new Set(),
      proofTraces: [
        {
          edgeId: "incident-edge",
          violatedAxioms: ["A-04"],
          verdict: "FLAGGED",
          solverUsed: "Z3",
          checkTimeMs: 5,
        },
      ],
      totalViolations: 1,
    };
    const out = buildContextualReview({
      ...EMPTY_INPUTS,
      node,
      graph: { edges: [edge] },
      tarskiReport: report,
    });
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("red");
    expect(out[0].title).toContain("A-04");
  });

  it("ignores proof traces on non-incident edges", () => {
    const node = makeNode();
    const edge = makeEdge({ id: "other-edge", source: "other", target: "elsewhere" });
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["other-edge"]),
      restrictedNodeIds: new Set(),
      proofTraces: [
        {
          edgeId: "other-edge",
          violatedAxioms: ["A-04"],
          verdict: "FLAGGED",
          solverUsed: "Z3",
          checkTimeMs: 5,
        },
      ],
      totalViolations: 1,
    };
    const out = buildContextualReview({
      ...EMPTY_INPUTS,
      node,
      graph: { edges: [edge] },
      tarskiReport: report,
    });
    expect(out).toEqual([]);
  });
});

describe("buildContextualReview — cascade saturation", () => {
  it("fires red at cascade load ≥ 9", () => {
    const node = makeNode({
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 9.2,
        tailDepth: 5,
      },
    });
    const out = buildContextualReview({ ...EMPTY_INPUTS, node });
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("red");
    expect(out[0].title).toContain("CASCADE");
  });

  it("fires amber at cascade load 7 ≤ C < 9", () => {
    const node = makeNode({
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 7.5,
        tailDepth: 5,
      },
    });
    const out = buildContextualReview({ ...EMPTY_INPUTS, node });
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("amber");
  });

  it("does not fire below 7", () => {
    const node = makeNode({
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 6.9,
        tailDepth: 5,
      },
    });
    expect(buildContextualReview({ ...EMPTY_INPUTS, node })).toEqual([]);
  });
});

describe("buildContextualReview — ΩF velocity", () => {
  it("fires amber when ΩF climbs by ≥ 1.5 over the window", () => {
    const node = makeNode();
    const history = [
      { omegaComposite: 4.0, timestamp: 0 },
      { omegaComposite: 5.0, timestamp: 1 },
      { omegaComposite: 6.0, timestamp: 2 },
    ];
    const out = buildContextualReview({
      ...EMPTY_INPUTS,
      node,
      history: history as ContextualReviewInputs["history"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("amber");
    expect(out[0].detail).toContain("climbed");
    expect(out[0].detail).toContain("+2.0");
  });

  it("fires green when ΩF falls by ≥ 1.5 (improvement)", () => {
    const node = makeNode();
    const history = [
      { omegaComposite: 7.0, timestamp: 0 },
      { omegaComposite: 5.0, timestamp: 1 },
    ];
    const out = buildContextualReview({
      ...EMPTY_INPUTS,
      node,
      history: history as ContextualReviewInputs["history"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("green");
    expect(out[0].detail).toContain("fell");
  });

  it("does not fire when |Δ| < 1.5", () => {
    const node = makeNode();
    const history = [
      { omegaComposite: 5.0, timestamp: 0 },
      { omegaComposite: 5.5, timestamp: 1 },
    ];
    expect(
      buildContextualReview({
        ...EMPTY_INPUTS,
        node,
        history: history as ContextualReviewInputs["history"],
      }),
    ).toEqual([]);
  });
});

describe("buildContextualReview — unpromoted auto-bridges", () => {
  it("fires amber when incident edges include unpromoted bridges", () => {
    const node = makeNode();
    const bridge = makeEdge({
      id: "auto-bridge-x",
      source: "n1",
      target: "n2",
      physicalMechanism: "label overlap",
    });
    const out = buildContextualReview({
      ...EMPTY_INPUTS,
      node,
      graph: { edges: [bridge] },
    });
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("amber");
    expect(out[0].title).toBe("Promote bridges");
  });

  it("ignores promoted bridges", () => {
    const node = makeNode();
    const bridge = makeEdge({
      id: "auto-bridge-x",
      source: "n1",
      target: "n2",
      physicalMechanism: "promoted bridge: label overlap",
    });
    expect(
      buildContextualReview({
        ...EMPTY_INPUTS,
        node,
        graph: { edges: [bridge] },
      }),
    ).toEqual([]);
  });
});

describe("buildContextualReview — urgency ordering + cap", () => {
  it("orders red → amber → green", () => {
    const node = makeNode({
      isConfounded: true, // amber
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 9.5, // red
        tailDepth: 5,
      },
    });
    const incidentEdge = makeEdge({ id: "e1", source: "n1", target: "n2" });
    const chiStarSet = new Set(["e1", "e2"]);
    const edges = [
      incidentEdge,
      makeEdge({ id: "e2", source: "n1", target: "n3" }),
    ];
    // green will fire: 2 incident edges in χ★
    const out = buildContextualReview({
      ...EMPTY_INPUTS,
      node,
      graph: { edges },
      chiStarSet,
    });
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0].tone).toBe("red");
    // Last among amber/green is green if both present
    const tones = out.map((r) => r.tone);
    const redIdx = tones.indexOf("red");
    const greenIdx = tones.indexOf("green");
    expect(redIdx).toBeLessThan(greenIdx);
  });

  it("caps at 3 recommendations", () => {
    const node = makeNode({
      isConfounded: true,
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 9.5,
        tailDepth: 5,
      },
    });
    const bridge = makeEdge({
      id: "auto-bridge-x",
      source: "n1",
      target: "n2",
    });
    const e2 = makeEdge({ id: "e2", source: "n1", target: "n3" });
    const e3 = makeEdge({ id: "e3", source: "n1", target: "n4" });
    const history = [
      { omegaComposite: 3, timestamp: 0 },
      { omegaComposite: 7, timestamp: 1 },
    ];
    const out = buildContextualReview({
      node,
      graph: { edges: [bridge, e2, e3] },
      tarskiReport: null,
      history: history as ContextualReviewInputs["history"],
      chiStarSet: new Set(["e2", "e3"]),
    });
    expect(out.length).toBe(3);
  });
});
