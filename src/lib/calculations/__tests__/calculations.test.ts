import { describe, it, expect } from "vitest";
import {
  CALCULATION_REGISTRY,
  availableCalculations,
} from "@/lib/calculations/registry";
import { hhiCalculation } from "@/lib/calculations/hhi";
import { crossDomainEdgesCalculation } from "@/lib/calculations/cross-domain-edges";
import { meanOmegaCalculation } from "@/lib/calculations/mean-omega";
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
});
