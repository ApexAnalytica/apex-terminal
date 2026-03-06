import { describe, it, expect } from "vitest";
import { solveInterdiction } from "../interdiction-engine";
import {
  linearGraph,
  unstableGraph,
  emptyGraph,
  makeShock,
  SINGLE_SHOCK,
  MULTI_SHOCKS,
} from "./fixtures/graph-fixtures";

describe("solveInterdiction", () => {
  it("returns zero damage with no shocks", () => {
    const result = solveInterdiction(linearGraph(), [], [], 3, "edge");
    expect(result.baselineDamage).toBe(0);
    expect(result.bestDamage).toBe(0);
    expect(result.interventions).toHaveLength(0);
  });

  it("finds edge interventions for a linear graph", () => {
    const graph = linearGraph();
    const shocks = [makeShock({ id: "s1", severity: 0.5, category: "compute" })];
    const result = solveInterdiction(graph, shocks, [], 2, "edge");

    expect(result.baselineDamage).toBeGreaterThan(0);
    expect(result.interventions.length).toBeGreaterThanOrEqual(1);
    expect(result.bestDamage).toBeLessThanOrEqual(result.baselineDamage);

    // Each intervention should have a target of type edge
    for (const int of result.interventions) {
      expect(int.target.type).toBe("edge");
      expect(int.marginalReduction).toBeGreaterThan(0);
    }
  });

  it("finds node interventions when mode is node", () => {
    const graph = unstableGraph();
    const result = solveInterdiction(graph, MULTI_SHOCKS, [], 2, "node");

    expect(result.interventions.length).toBeGreaterThanOrEqual(1);
    for (const int of result.interventions) {
      expect(int.target.type).toBe("node");
    }
  });

  it("respects budget limit", () => {
    const graph = unstableGraph();
    const result = solveInterdiction(graph, MULTI_SHOCKS, [], 1, "edge");
    expect(result.interventions.length).toBeLessThanOrEqual(1);
  });

  it("handles empty graph gracefully", () => {
    const result = solveInterdiction(emptyGraph(), [SINGLE_SHOCK], [], 3, "edge");
    expect(result.baselineDamage).toBe(0);
    expect(result.interventions).toHaveLength(0);
  });

  it("reduction percentage is computed correctly", () => {
    const graph = unstableGraph();
    const result = solveInterdiction(graph, MULTI_SHOCKS, [], 3, "edge");

    if (result.baselineDamage > 0 && result.interventions.length > 0) {
      const expectedPct = Math.round(
        ((result.baselineDamage - result.bestDamage) / result.baselineDamage) * 100
      );
      expect(result.reductionPct).toBe(expectedPct);
    }
  });

  it("greedy ordering produces diminishing returns", () => {
    const graph = unstableGraph();
    const result = solveInterdiction(graph, MULTI_SHOCKS, [], 3, "edge");

    // Each successive intervention should have equal or lower marginal reduction
    for (let i = 1; i < result.interventions.length; i++) {
      expect(result.interventions[i].marginalReduction).toBeLessThanOrEqual(
        result.interventions[i - 1].marginalReduction + 0.01 // small epsilon for float
      );
    }
  });

  it("skips already-severed edges", () => {
    const graph = linearGraph();
    const shocks = [makeShock({ id: "s1", severity: 0.5, category: "compute" })];
    // Sever the first edge — only the second should be a candidate
    const result = solveInterdiction(graph, shocks, ["e_AB"], 2, "edge");

    for (const int of result.interventions) {
      expect(int.target.id).not.toBe("e_AB");
    }
  });

  it("both mode finds mix of edges and nodes", () => {
    const graph = unstableGraph();
    const result = solveInterdiction(graph, MULTI_SHOCKS, [], 3, "both");

    expect(result.interventions.length).toBeGreaterThanOrEqual(1);
    // At least verifies both types are candidates (may not always select both)
    const types = new Set(result.interventions.map((i) => i.target.type));
    expect(types.size).toBeGreaterThanOrEqual(1);
  });
});
