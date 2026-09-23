import { describe, it, expect } from "vitest";
import { VX880_GRAPH } from "../t1d-vx880-graph-data";
import { simulateCascade } from "../cascade-simulator";
import { solveInterdiction, solveInterdictionAsync } from "../interdiction-engine";
import { DOMAIN_MAP } from "@/hooks/useFilteredGraph";
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

  it("the DomainSelector 't1d-vx880' id maps to the VX-880 graph domain", () => {
    // Regression guard: without this mapping, useFilteredGraph strips
    // every VX-880 node before CausalDAG3D renders, leaving the canvas
    // black even though the dataset is loaded (sidebar still shows counts
    // from the unfiltered store). See fix for the empty-canvas bug.
    const mapped = DOMAIN_MAP["t1d-vx880"];
    expect(mapped, "missing DOMAIN_MAP entry for 't1d-vx880'").toBeDefined();
    const allowed = new Set(mapped);
    const accepted = VX880_GRAPH.nodes.filter((n) => allowed.has(n.domain));
    expect(accepted.length).toBe(VX880_GRAPH.nodes.length);
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

  it("async solver returns the same interventions as the sync solver", async () => {
    // The async variant has to be identical to the sync one — same
    // greedy minimax algorithm, same `simulateCascade` call per
    // candidate, same `computeDamage` scoring. The only differences are
    // the periodic yield and the optional progress callback, neither of
    // which should alter the picked interventions or their damages.
    // This guard catches accidental divergence on future edits
    // (re-ordering the inner loop, dropping a budget step, etc.).
    const shock: CausalShock = {
      id: "health_shock_async",
      name: "Autoimmune recurrence flare",
      severity: 0.6,
      category: "health",
      description: "Synthetic health shock",
    };
    const sync = solveInterdiction(VX880_GRAPH, [shock], [], 3, "edge");
    const async = await solveInterdictionAsync(VX880_GRAPH, [shock], [], 3, "edge");

    expect(async.baselineDamage).toBe(sync.baselineDamage);
    expect(async.bestDamage).toBe(sync.bestDamage);
    expect(async.reductionPct).toBe(sync.reductionPct);
    expect(async.interventions.length).toBe(sync.interventions.length);
    for (let i = 0; i < sync.interventions.length; i++) {
      expect(async.interventions[i].target.id).toBe(sync.interventions[i].target.id);
      expect(async.interventions[i].target.type).toBe(sync.interventions[i].target.type);
      expect(async.interventions[i].damage).toBe(sync.interventions[i].damage);
      expect(async.interventions[i].marginalReduction).toBe(
        sync.interventions[i].marginalReduction,
      );
    }
  });

  it("async solver respects AbortSignal", async () => {
    const shock: CausalShock = {
      id: "health_shock_abort",
      name: "Autoimmune recurrence flare",
      severity: 0.6,
      category: "health",
      description: "Synthetic health shock",
    };
    const ctrl = new AbortController();
    // Abort immediately so the solver bails before completing its
    // first cascade run. This proves the signal is plumbed through;
    // production callers (InterdictionPanel) rely on it to cancel a
    // run when the user clicks SOLVE twice in quick succession.
    ctrl.abort();
    await expect(
      solveInterdictionAsync(VX880_GRAPH, [shock], [], 3, "edge", {
        signal: ctrl.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });

  it("async solver emits progress callbacks", async () => {
    const shock: CausalShock = {
      id: "health_shock_progress",
      name: "Autoimmune recurrence flare",
      severity: 0.6,
      category: "health",
      description: "Synthetic health shock",
    };
    // Yield aggressively so we definitely get at least one mid-run
    // progress callback even on a small graph. yieldEveryMs=0 means
    // every candidate evaluation gets a yield.
    const calls: Array<{ done: number; total: number }> = [];
    await solveInterdictionAsync(VX880_GRAPH, [shock], [], 2, "edge", {
      yieldEveryMs: 0,
      onProgress: (done, total) => calls.push({ done, total }),
    });
    expect(calls.length).toBeGreaterThan(0);
    // Monotonically non-decreasing `done` across the run.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].done).toBeGreaterThanOrEqual(calls[i - 1].done);
    }
  });
});
