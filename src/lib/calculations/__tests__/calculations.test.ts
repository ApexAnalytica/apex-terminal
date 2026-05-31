import { describe, it, expect } from "vitest";
import {
  CALCULATION_REGISTRY,
  availableCalculations,
} from "@/lib/calculations/registry";
import { hhiCalculation } from "@/lib/calculations/hhi";
import { giniCalculation } from "@/lib/calculations/gini";
import { outdegreeHhiCalculation } from "@/lib/calculations/outdegree-hhi";
import { crossDomainEdgesCalculation } from "@/lib/calculations/cross-domain-edges";
import { edgeDensityCalculation } from "@/lib/calculations/edge-density";
import { cycleCountCalculation } from "@/lib/calculations/cycle-count";
import { bridgeRatioCalculation } from "@/lib/calculations/bridge-ratio";
import { meanOmegaCalculation } from "@/lib/calculations/mean-omega";
import { meanJurisdictionalHazardCalculation } from "@/lib/calculations/mean-jurisdictional-hazard";
import type { CalculationContext } from "@/lib/calculations/types";
import { makeNode, makeEdge } from "../../__tests__/fixtures/graph-fixtures";

// ─── Calculations registry + per-calc tests ──────────────────────────
//
// Each registered calculation is a pure function — tests pin its
// applicability gating and the math. Adding a new entry to
// CALCULATION_REGISTRY? Add a describe block here.

function ctx(overrides: Partial<CalculationContext> = {}): CalculationContext {
  return {
    graph: { nodes: [], edges: [] },
    selectedNode: null,
    selectedDomains: [],
    ...overrides,
  };
}

describe("CALCULATION_REGISTRY", () => {
  it("has stable, unique ids", () => {
    const ids = CALCULATION_REGISTRY.map((c) => c.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("availableCalculations filters by predicate", () => {
    const empty = availableCalculations(ctx());
    // hhi requires selectedNode + ≥2 inbound; cross-domain requires
    // edges; mean-omega requires nodes. None should apply.
    expect(empty).toEqual([]);
  });
});

describe("hhiCalculation", () => {
  it("does not apply without a selected node", () => {
    expect(hhiCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("does not apply with only 1 inbound edge", () => {
    const target = makeNode({ id: "t" });
    const src = makeNode({ id: "s" });
    expect(
      hhiCalculation.appliesWhen(
        ctx({
          graph: {
            nodes: [target, src],
            edges: [makeEdge({ id: "e1", source: "s", target: "t" })],
          },
          selectedNode: "t",
        }),
      ),
    ).toBe(false);
  });

  it("flags a perfectly concentrated supplier (HHI = 10,000) as red", () => {
    // 1 inbound, weight 1 → share 1 → HHI 1*1 = 1 → 10_000. But the
    // appliesWhen gate requires ≥2 inbound edges, so use two: one
    // dominant + one tiny.
    const t = makeNode({ id: "t" });
    const s1 = makeNode({ id: "s1" });
    const s2 = makeNode({ id: "s2" });
    const c = ctx({
      graph: {
        nodes: [t, s1, s2],
        edges: [
          makeEdge({ id: "e1", source: "s1", target: "t", weight: 0.99 }),
          makeEdge({ id: "e2", source: "s2", target: "t", weight: 0.01 }),
        ],
      },
      selectedNode: "t",
    });
    const r = hhiCalculation.compute(c)!;
    expect(r.value.kind).toBe("scalar");
    if (r.value.kind === "scalar") {
      expect(r.value.value).toBeGreaterThan(9000);
    }
    expect(r.tone).toBe("red");
  });

  it("flags an evenly split mix (HHI ≈ 10000/n) as green when concentrations are low", () => {
    // 5 equal suppliers → HHI = 5 × (0.2)² × 10000 = 2000. That's
    // moderate (amber). Use 10 suppliers for a competitive case
    // (HHI = 1000).
    const t = makeNode({ id: "t" });
    const nodes = [t];
    const edges = [];
    for (let i = 0; i < 10; i++) {
      nodes.push(makeNode({ id: `s${i}` }));
      edges.push(
        makeEdge({ id: `e${i}`, source: `s${i}`, target: "t", weight: 0.1 }),
      );
    }
    const r = hhiCalculation.compute(
      ctx({
        graph: { nodes, edges },
        selectedNode: "t",
      }),
    )!;
    if (r.value.kind === "scalar") {
      expect(r.value.value).toBeCloseTo(1000, 0);
    }
    expect(r.tone).toBe("green");
  });

  it("ignores severed edges", () => {
    const t = makeNode({ id: "t" });
    const s1 = makeNode({ id: "s1" });
    const s2 = makeNode({ id: "s2" });
    // Severed edge would otherwise dominate; HHI should ignore it.
    expect(
      hhiCalculation.appliesWhen(
        ctx({
          graph: {
            nodes: [t, s1, s2],
            edges: [
              makeEdge({
                id: "e1",
                source: "s1",
                target: "t",
                weight: 0.99,
                isSevered: true,
              }),
              makeEdge({ id: "e2", source: "s2", target: "t", weight: 0.01 }),
            ],
          },
          selectedNode: "t",
        }),
      ),
    ).toBe(false); // only 1 live inbound after filtering severed
  });

  it("toSnapshot maps a scalar result to a calc:supply-hhi LiveDataPoint", () => {
    const t = makeNode({ id: "t" });
    const s1 = makeNode({ id: "s1" });
    const s2 = makeNode({ id: "s2" });
    const c = ctx({
      graph: {
        nodes: [t, s1, s2],
        edges: [
          makeEdge({ id: "e1", source: "s1", target: "t", weight: 0.6 }),
          makeEdge({ id: "e2", source: "s2", target: "t", weight: 0.4 }),
        ],
      },
      selectedNode: "t",
    });
    const result = hhiCalculation.compute(c)!;
    const snap = hhiCalculation.toSnapshot!(result, c)!;
    expect(snap.nodeId).toBe("t");
    expect(snap.point.kind).toBe("calc:supply-hhi");
    expect(snap.point.providerId).toBe("calc:supply-hhi");
    expect(snap.point.capacity).toBe(10_000);
    expect(snap.point.unit).toBe("HHI");
    if (result.value.kind === "scalar") {
      expect(snap.point.value).toBe(result.value.value);
    }
    expect(snap.point.source).toContain("Supply HHI");
  });

  it("toSnapshot returns null without a selected node", () => {
    const noSel = ctx({ selectedNode: null });
    expect(
      hhiCalculation.toSnapshot!(
        {
          value: { kind: "scalar", value: 1000 },
        },
        noSel,
      ),
    ).toBeNull();
  });
});

describe("crossDomainEdgesCalculation", () => {
  it("does not apply on an empty graph", () => {
    expect(crossDomainEdgesCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("counts edges that cross domain boundaries", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const b = makeNode({ id: "b", domain: "finance" });
    const c = makeNode({ id: "c", domain: "energy" });
    const result = crossDomainEdgesCalculation.compute(
      ctx({
        graph: {
          nodes: [a, b, c],
          edges: [
            makeEdge({ id: "e1", source: "a", target: "b" }), // cross
            makeEdge({ id: "e2", source: "a", target: "c" }), // same
            makeEdge({ id: "e3", source: "b", target: "c" }), // cross
          ],
        },
      }),
    )!;
    if (result.value.kind === "scalar") {
      expect(result.value.value).toBe(2);
    }
    expect(result.detail).toContain("3 active edges");
  });

  it("ignores severed edges", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const b = makeNode({ id: "b", domain: "finance" });
    const result = crossDomainEdgesCalculation.compute(
      ctx({
        graph: {
          nodes: [a, b],
          edges: [
            makeEdge({
              id: "e1",
              source: "a",
              target: "b",
              isSevered: true,
            }),
          ],
        },
      }),
    );
    expect(result).toBeNull(); // severed → totalLive = 0 → null
  });
});

describe("meanOmegaCalculation", () => {
  it("returns mean ΩF composite across nodes", () => {
    const nodes = [
      makeNode({
        id: "a",
        omegaFragility: {
          composite: 4,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 0,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
      makeNode({
        id: "b",
        omegaFragility: {
          composite: 6,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 0,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
    ];
    const result = meanOmegaCalculation.compute(
      ctx({ graph: { nodes, edges: [] } }),
    )!;
    if (result.value.kind === "scalar") {
      expect(result.value.value).toBe(5);
    }
    expect(result.tone).toBe("green"); // < 7
  });

  it("flags amber at mean ≥ 7", () => {
    const nodes = [
      makeNode({
        id: "a",
        omegaFragility: {
          composite: 7.5,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 0,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
    ];
    const r = meanOmegaCalculation.compute(
      ctx({ graph: { nodes, edges: [] } }),
    )!;
    expect(r.tone).toBe("amber");
  });

  it("flags red at mean ≥ 9", () => {
    const nodes = [
      makeNode({
        id: "a",
        omegaFragility: {
          composite: 9.2,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 0,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
    ];
    const r = meanOmegaCalculation.compute(
      ctx({ graph: { nodes, edges: [] } }),
    )!;
    expect(r.tone).toBe("red");
  });

  it("toGraphSnapshot returns the scalar value", () => {
    const nodes = [
      makeNode({
        id: "a",
        omegaFragility: {
          composite: 6.4,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 0,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
    ];
    const c = ctx({ graph: { nodes, edges: [] } });
    const r = meanOmegaCalculation.compute(c)!;
    const snap = meanOmegaCalculation.toGraphSnapshot!(r, c)!;
    expect(snap.value).toBeCloseTo(6.4, 4);
  });
});

describe("crossDomainEdgesCalculation — toGraphSnapshot", () => {
  it("returns the scalar count", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const b = makeNode({ id: "b", domain: "finance" });
    const c = ctx({
      graph: {
        nodes: [a, b],
        edges: [makeEdge({ id: "e1", source: "a", target: "b" })],
      },
    });
    const r = crossDomainEdgesCalculation.compute(c)!;
    const snap = crossDomainEdgesCalculation.toGraphSnapshot!(r, c)!;
    expect(snap.value).toBe(1);
  });
});

describe("bridgeRatioCalculation", () => {
  it("does not apply on an empty graph", () => {
    expect(bridgeRatioCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("returns 100% for a line graph (every edge is a strict bridge)", () => {
    // A → B → C → D — every edge disconnects the graph if removed.
    const nodes = [
      makeNode({ id: "a" }),
      makeNode({ id: "b" }),
      makeNode({ id: "c" }),
      makeNode({ id: "d" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b" }),
      makeEdge({ id: "e2", source: "b", target: "c" }),
      makeEdge({ id: "e3", source: "c", target: "d" }),
    ];
    const r = bridgeRatioCalculation.compute(ctx({ graph: { nodes, edges } }))!;
    if (r.value.kind === "scalar") {
      expect(r.value.value).toBe(100);
    }
    expect(r.tone).toBe("red");
  });

  it("toGraphSnapshot returns the scalar percentage", () => {
    const nodes = [
      makeNode({ id: "a" }),
      makeNode({ id: "b" }),
      makeNode({ id: "c" }),
    ];
    const edges = [
      makeEdge({ id: "e1", source: "a", target: "b" }),
      makeEdge({ id: "e2", source: "b", target: "c" }),
    ];
    const c = ctx({ graph: { nodes, edges } });
    const r = bridgeRatioCalculation.compute(c)!;
    const snap = bridgeRatioCalculation.toGraphSnapshot!(r, c)!;
    if (r.value.kind === "scalar") {
      expect(snap.value).toBe(r.value.value);
    }
  });
});

describe("meanJurisdictionalHazardCalculation", () => {
  it("does not apply on an empty graph", () => {
    expect(meanJurisdictionalHazardCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("returns the mean J pillar (independent of composite)", () => {
    // Composite is 5 on both nodes, but J pillar is 8 and 4 — mean = 6.
    const nodes = [
      makeNode({
        id: "a",
        omegaFragility: {
          composite: 5,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 8,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
      makeNode({
        id: "b",
        omegaFragility: {
          composite: 5,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 4,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
    ];
    const r = meanJurisdictionalHazardCalculation.compute(
      ctx({ graph: { nodes, edges: [] } }),
    )!;
    if (r.value.kind === "scalar") {
      expect(r.value.value).toBe(6);
    }
    expect(r.tone).toBe("green"); // 6 < 7
  });

  it("flags red at mean J ≥ 9", () => {
    const nodes = [
      makeNode({
        id: "a",
        omegaFragility: {
          composite: 5,
          irreplaceability: 0,
          restorationLatency: 0,
          jurisdictionalHazard: 9.4,
          cascadeLoad: 0,
          tailDepth: 0,
        },
      }),
    ];
    const r = meanJurisdictionalHazardCalculation.compute(
      ctx({ graph: { nodes, edges: [] } }),
    )!;
    expect(r.tone).toBe("red");
  });
});

describe("outdegreeHhiCalculation", () => {
  it("does not apply without a selected node", () => {
    expect(outdegreeHhiCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("does not apply with only 1 outbound edge", () => {
    const src = makeNode({ id: "s" });
    const tgt = makeNode({ id: "t" });
    expect(
      outdegreeHhiCalculation.appliesWhen(
        ctx({
          graph: {
            nodes: [src, tgt],
            edges: [makeEdge({ id: "e1", source: "s", target: "t" })],
          },
          selectedNode: "s",
        }),
      ),
    ).toBe(false);
  });

  it("flags red when one buyer dominates", () => {
    const src = makeNode({ id: "s" });
    const b1 = makeNode({ id: "b1" });
    const b2 = makeNode({ id: "b2" });
    const r = outdegreeHhiCalculation.compute(
      ctx({
        graph: {
          nodes: [src, b1, b2],
          edges: [
            makeEdge({ id: "e1", source: "s", target: "b1", weight: 0.99 }),
            makeEdge({ id: "e2", source: "s", target: "b2", weight: 0.01 }),
          ],
        },
        selectedNode: "s",
      }),
    )!;
    if (r.value.kind === "scalar") {
      expect(r.value.value).toBeGreaterThan(9000);
    }
    expect(r.tone).toBe("red");
  });

  it("ignores severed outbound edges", () => {
    const src = makeNode({ id: "s" });
    const b1 = makeNode({ id: "b1" });
    const b2 = makeNode({ id: "b2" });
    expect(
      outdegreeHhiCalculation.appliesWhen(
        ctx({
          graph: {
            nodes: [src, b1, b2],
            edges: [
              makeEdge({
                id: "e1",
                source: "s",
                target: "b1",
                isSevered: true,
              }),
              makeEdge({ id: "e2", source: "s", target: "b2" }),
            ],
          },
          selectedNode: "s",
        }),
      ),
    ).toBe(false); // only 1 live outbound after filtering severed
  });

  it("toSnapshot maps to calc:buyer-hhi LiveDataPoint", () => {
    const src = makeNode({ id: "s" });
    const b1 = makeNode({ id: "b1" });
    const b2 = makeNode({ id: "b2" });
    const c = ctx({
      graph: {
        nodes: [src, b1, b2],
        edges: [
          makeEdge({ id: "e1", source: "s", target: "b1", weight: 0.6 }),
          makeEdge({ id: "e2", source: "s", target: "b2", weight: 0.4 }),
        ],
      },
      selectedNode: "s",
    });
    const result = outdegreeHhiCalculation.compute(c)!;
    const snap = outdegreeHhiCalculation.toSnapshot!(result, c)!;
    expect(snap.nodeId).toBe("s");
    expect(snap.point.kind).toBe("calc:buyer-hhi");
    expect(snap.point.providerId).toBe("calc:buyer-hhi");
    expect(snap.point.capacity).toBe(10_000);
    expect(snap.point.unit).toBe("HHI");
    expect(snap.point.source).toContain("Buyer HHI");
  });
});

describe("giniCalculation", () => {
  it("does not apply without a selected node", () => {
    expect(giniCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("requires ≥2 inbound edges", () => {
    const t = makeNode({ id: "t" });
    const s = makeNode({ id: "s" });
    expect(
      giniCalculation.appliesWhen(
        ctx({
          graph: {
            nodes: [t, s],
            edges: [makeEdge({ id: "e1", source: "s", target: "t" })],
          },
          selectedNode: "t",
        }),
      ),
    ).toBe(false);
  });

  it("returns ~0 for perfectly equal shares (green)", () => {
    const t = makeNode({ id: "t" });
    const s1 = makeNode({ id: "s1" });
    const s2 = makeNode({ id: "s2" });
    const s3 = makeNode({ id: "s3" });
    const c = ctx({
      graph: {
        nodes: [t, s1, s2, s3],
        edges: [
          makeEdge({ id: "e1", source: "s1", target: "t", weight: 0.5 }),
          makeEdge({ id: "e2", source: "s2", target: "t", weight: 0.5 }),
          makeEdge({ id: "e3", source: "s3", target: "t", weight: 0.5 }),
        ],
      },
      selectedNode: "t",
    });
    const result = giniCalculation.compute(c)!;
    expect(result.value.kind).toBe("scalar");
    if (result.value.kind === "scalar") {
      expect(result.value.value).toBeLessThan(0.05);
    }
    expect(result.tone).toBe("green");
  });

  it("returns high Gini (red) for one dominant + many tiny", () => {
    const t = makeNode({ id: "t" });
    const dominant = makeNode({ id: "dom" });
    const tinies = [0, 1, 2, 3].map((i) => makeNode({ id: `t${i}` }));
    const edges = [
      makeEdge({ id: "ed", source: "dom", target: "t", weight: 0.95 }),
      ...tinies.map((s, i) =>
        makeEdge({ id: `et${i}`, source: s.id, target: "t", weight: 0.05 }),
      ),
    ];
    const c = ctx({
      graph: { nodes: [t, dominant, ...tinies], edges },
      selectedNode: "t",
    });
    const result = giniCalculation.compute(c)!;
    if (result.value.kind === "scalar") {
      expect(result.value.value).toBeGreaterThan(0.6);
    }
    expect(result.tone).toBe("red");
  });

  it("emits a calc:supply-gini snapshot", () => {
    const t = makeNode({ id: "t" });
    const s1 = makeNode({ id: "s1" });
    const s2 = makeNode({ id: "s2" });
    const c = ctx({
      graph: {
        nodes: [t, s1, s2],
        edges: [
          makeEdge({ id: "e1", source: "s1", target: "t", weight: 0.8 }),
          makeEdge({ id: "e2", source: "s2", target: "t", weight: 0.2 }),
        ],
      },
      selectedNode: "t",
    });
    const result = giniCalculation.compute(c)!;
    const snap = giniCalculation.toSnapshot!(result, c)!;
    expect(snap.nodeId).toBe("t");
    expect(snap.point.kind).toBe("calc:supply-gini");
    expect(snap.point.unit).toBe("Gini");
  });
});

describe("edgeDensityCalculation", () => {
  it("does not apply on an empty graph", () => {
    expect(edgeDensityCalculation.appliesWhen(ctx())).toBe(false);
  });

  it("flags dense graphs (density > 0.2) as red", () => {
    // 3 nodes, 6 possible directed edges, 2 active → density 0.33
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c2 = makeNode({ id: "c" });
    const c = ctx({
      graph: {
        nodes: [a, b, c2],
        edges: [
          makeEdge({ id: "e1", source: "a", target: "b" }),
          makeEdge({ id: "e2", source: "b", target: "c" }),
        ],
      },
    });
    const result = edgeDensityCalculation.compute(c)!;
    if (result.value.kind === "scalar") {
      expect(result.value.value).toBeCloseTo(2 / 6, 3);
    }
    expect(result.tone).toBe("red");
  });

  it("ignores severed edges when counting", () => {
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c = ctx({
      graph: {
        nodes: [a, b],
        edges: [
          makeEdge({ id: "e1", source: "a", target: "b", isSevered: true }),
        ],
      },
    });
    // appliesWhen passes (edges.length > 0) but the severed edge is
    // skipped so density = 0/2 = 0.
    const result = edgeDensityCalculation.compute(c)!;
    if (result.value.kind === "scalar") {
      expect(result.value.value).toBe(0);
    }
    expect(result.tone).toBe("green");
  });
});

describe("cycleCountCalculation", () => {
  it("returns 0 for an acyclic graph (green)", () => {
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c2 = makeNode({ id: "c" });
    const c = ctx({
      graph: {
        nodes: [a, b, c2],
        edges: [
          makeEdge({ id: "e1", source: "a", target: "b" }),
          makeEdge({ id: "e2", source: "b", target: "c" }),
        ],
      },
    });
    const result = cycleCountCalculation.compute(c)!;
    if (result.value.kind === "scalar") expect(result.value.value).toBe(0);
    expect(result.tone).toBe("green");
  });

  it("detects a 3-node cycle (red)", () => {
    // a → b → c → a
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c2 = makeNode({ id: "c" });
    const c = ctx({
      graph: {
        nodes: [a, b, c2],
        edges: [
          makeEdge({ id: "e1", source: "a", target: "b" }),
          makeEdge({ id: "e2", source: "b", target: "c" }),
          makeEdge({ id: "e3", source: "c", target: "a" }),
        ],
      },
    });
    const result = cycleCountCalculation.compute(c)!;
    if (result.value.kind === "scalar") expect(result.value.value).toBe(1);
    expect(result.tone).toBe("red");
    expect(result.detail).toContain("A-03");
  });

  it("detects a self-loop", () => {
    const a = makeNode({ id: "a" });
    const c = ctx({
      graph: {
        nodes: [a],
        edges: [makeEdge({ id: "e1", source: "a", target: "a" })],
      },
    });
    const result = cycleCountCalculation.compute(c)!;
    if (result.value.kind === "scalar") expect(result.value.value).toBe(1);
  });

  it("treats severed edges as removed", () => {
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c = ctx({
      graph: {
        nodes: [a, b],
        edges: [
          makeEdge({ id: "e1", source: "a", target: "b" }),
          makeEdge({ id: "e2", source: "b", target: "a", isSevered: true }),
        ],
      },
    });
    const result = cycleCountCalculation.compute(c)!;
    if (result.value.kind === "scalar") expect(result.value.value).toBe(0);
  });

  it("detects two disjoint cycles", () => {
    // Cycle 1: a → b → a; Cycle 2: c → d → c
    const a = makeNode({ id: "a" });
    const b = makeNode({ id: "b" });
    const c2 = makeNode({ id: "c" });
    const d = makeNode({ id: "d" });
    const c = ctx({
      graph: {
        nodes: [a, b, c2, d],
        edges: [
          makeEdge({ id: "e1", source: "a", target: "b" }),
          makeEdge({ id: "e2", source: "b", target: "a" }),
          makeEdge({ id: "e3", source: "c", target: "d" }),
          makeEdge({ id: "e4", source: "d", target: "c" }),
        ],
      },
    });
    const result = cycleCountCalculation.compute(c)!;
    if (result.value.kind === "scalar") expect(result.value.value).toBe(2);
  });
});
