import { describe, it, expect } from "vitest";
import { VX880_GRAPH } from "../t1d-vx880-graph-data";
import { simulateCascade } from "../cascade-simulator";
import { solveInterdiction } from "../interdiction-engine";
import type { CausalShock } from "../types";

describe("VX-880 flagship graph", () => {
  it("has non-trivial topology", () => {
    expect(VX880_GRAPH.nodes.length).toBeGreaterThanOrEqual(15);
    expect(VX880_GRAPH.edges.length).toBeGreaterThanOrEqual(18);
  });

  it("every edge endpoint refers to a real node", () => {
    const ids = new Set(VX880_GRAPH.nodes.map((n) => n.id));
    for (const edge of VX880_GRAPH.edges) {
      expect(ids.has(edge.source), `edge ${edge.id} source ${edge.source}`).toBe(true);
      expect(ids.has(edge.target), `edge ${edge.id} target ${edge.target}`).toBe(true);
    }
  });

  it("every node id is unique", () => {
    const ids = VX880_GRAPH.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every edge id is unique", () => {
    const ids = VX880_GRAPH.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("node omega composite is within [0,10]", () => {
    for (const node of VX880_GRAPH.nodes) {
      expect(node.omegaFragility.composite).toBeGreaterThanOrEqual(0);
      expect(node.omegaFragility.composite).toBeLessThanOrEqual(10);
    }
  });

  it("edge weights are within [-1,1]", () => {
    for (const edge of VX880_GRAPH.edges) {
      expect(Math.abs(edge.weight)).toBeLessThanOrEqual(1);
    }
  });

  it("all nodes are tagged category=science and domain=T1D VX-880", () => {
    for (const node of VX880_GRAPH.nodes) {
      expect(node.category).toBe("science");
      expect(node.domain).toBe("T1D VX-880");
    }
  });

  it("core trial-endpoint nodes exist", () => {
    const ids = new Set(VX880_GRAPH.nodes.map((n) => n.id));
    // Primary efficacy + safety endpoints VX-880 is judged on
    expect(ids.has("vx880_mmtt_auc")).toBe(true);
    expect(ids.has("vx880_insulin_indep")).toBe(true);
    expect(ids.has("vx880_hypo_events")).toBe(true);
    expect(ids.has("vx880_graft_beta_mass")).toBe(true);
    expect(ids.has("vx880_dose")).toBe(true);
    expect(ids.has("vx880_immunosuppression")).toBe(true);
  });

  it("graph supports a non-trivial cascade under a health shock", () => {
    const shock: CausalShock = {
      id: "autoimmune_recurrence_shock",
      name: "Autoimmune recurrence flare",
      severity: 0.6,
      category: "health",
      description: "Synthetic health shock for cascade sanity",
    };
    const epochs = simulateCascade(VX880_GRAPH, [shock], []);
    // Health shock now maps onto science nodes → cascade should register real activity
    const peakIntensity = Math.max(
      ...epochs.flatMap((e) =>
        Object.values(e.nodeStates).map((s) => s.shockIntensity),
      ),
    );
    expect(peakIntensity).toBeGreaterThan(0.05);
  });

  it("interdiction solver produces ranked cuts on a health shock", () => {
    const shock: CausalShock = {
      id: "health_shock",
      name: "Autoimmune recurrence flare",
      severity: 0.6,
      category: "health",
      description: "Synthetic health shock",
    };
    const result = solveInterdiction(VX880_GRAPH, [shock], [], 3, "edge");
    // With the cascade fix, real cuts should come back with non-zero marginal reduction
    expect(result.baselineDamage).toBeGreaterThan(0);
    expect(result.interventions.length).toBeGreaterThan(0);
    expect(result.interventions[0].marginalReduction).toBeGreaterThan(0);
  });
});
