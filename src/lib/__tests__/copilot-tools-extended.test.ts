import { describe, it, expect } from "vitest";
import { executeTag } from "@/lib/copilot/tool-registry";
import "@/lib/copilot/tools";
import type { ApexState } from "@/stores/useApexStore";
import type { CausalGraph } from "@/lib/types";
import type { TarskiValidationReport } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";

// ─── Fixture + mock context ─────────────────────────────────────

function buildGraph(): CausalGraph {
  const nodes = [
    makeNode({
      id: "GRID_USA",
      label: "USA Power Grid",
      shortLabel: "USA",
      category: "energy",
      domain: "Energy",
      omegaFragility: {
        composite: 8.5,
        irreplaceability: 9,
        cascadeLoad: 8,
        tailDepth: 8,
        restorationLatency: 9,
        jurisdictionalHazard: 8,
      },
    }),
    makeNode({
      id: "FAB_TW",
      label: "TSMC Fab",
      shortLabel: "TSMC",
      category: "manufacturing",
      domain: "Semiconductors",
      omegaFragility: {
        composite: 9.5,
        irreplaceability: 10,
        cascadeLoad: 9,
        tailDepth: 9,
        restorationLatency: 10,
        jurisdictionalHazard: 9,
      },
    }),
    makeNode({
      id: "OIL_TX",
      label: "TX Oil Pipeline",
      shortLabel: "OIL",
      category: "energy",
      domain: "Energy",
    }),
  ];
  const edges = [
    makeEdge({ id: "e1", source: "GRID_USA", target: "FAB_TW" }),
    makeEdge({ id: "e2", source: "OIL_TX", target: "FAB_TW" }),
  ];
  return makeGraph(nodes, edges);
}

interface StoreSpy {
  runTarskiCalls: number;
  nodeSizeMetricCalls: string[];
  resetAblationCalls: number;
}

function makeMockContext(graph: CausalGraph, tarskiReport: TarskiValidationReport | null = null) {
  const spy: StoreSpy = {
    runTarskiCalls: 0,
    nodeSizeMetricCalls: [],
    resetAblationCalls: 0,
  };

  const fakeStore = {
    graphData: graph,
    tarskiReport,
    runTarskiWithAxioms: () => {
      spy.runTarskiCalls++;
    },
    setNodeSizeMetric: (m: string) => {
      spy.nodeSizeMetricCalls.push(m);
    },
    resetAblation: () => {
      spy.resetAblationCalls++;
    },
  } as unknown as ApexState;

  return { ctx: { getStore: () => fakeStore }, spy };
}

// ─── explain_node ───────────────────────────────────────────────

describe("explain_node", () => {
  it("returns a compact Ω-fragility breakdown for a known node", () => {
    const { ctx } = makeMockContext(buildGraph());
    const result = executeTag({ name: "explain_node", payload: "GRID_USA", raw: "" }, ctx);
    expect(result).toContain("USA Power Grid");
    expect(result).toContain("Energy");
    expect(result).toContain("Ω composite 8.5/10");
    expect(result).toContain("HIGH RISK");
    expect(result).toContain("Upstream");
    expect(result).toContain("Downstream");
  });

  it("resolves nodes by shortLabel as well as id", () => {
    const { ctx } = makeMockContext(buildGraph());
    const result = executeTag({ name: "explain_node", payload: "TSMC", raw: "" }, ctx);
    expect(result).toContain("TSMC Fab");
    expect(result).toContain("OMEGA-CRITICAL");
  });

  it("returns 'Node not found' for unknown refs", () => {
    const { ctx } = makeMockContext(buildGraph());
    const result = executeTag({ name: "explain_node", payload: "NONEXISTENT", raw: "" }, ctx);
    expect(result).toMatch(/Node not found/);
  });
});

// ─── compare_nodes ──────────────────────────────────────────────

describe("compare_nodes", () => {
  it("returns side-by-side analysis + delta on Ω composite", () => {
    const { ctx } = makeMockContext(buildGraph());
    const result = executeTag(
      { name: "compare_nodes", payload: "ids=GRID_USA|FAB_TW", raw: "" },
      ctx,
    );
    expect(result).toContain("USA Power Grid");
    expect(result).toContain("TSMC Fab");
    expect(result).toContain("Delta:");
    // FAB_TW (9.5) − GRID_USA (8.5) = 1.0
    expect(result).toContain("TSMC is 1.0 Ω points more fragile than USA");
  });

  it("rejects a single id with a clear error", () => {
    const { ctx } = makeMockContext(buildGraph());
    const result = executeTag(
      { name: "compare_nodes", payload: "ids=GRID_USA", raw: "" },
      ctx,
    );
    expect(result).toMatch(/needs at least two ids/);
  });

  it("reports missing ids before doing any work", () => {
    const { ctx } = makeMockContext(buildGraph());
    const result = executeTag(
      { name: "compare_nodes", payload: "ids=GRID_USA|GHOST_NODE", raw: "" },
      ctx,
    );
    expect(result).toMatch(/Nodes not found: GHOST_NODE/);
  });
});

// ─── run_tarski ─────────────────────────────────────────────────

describe("run_tarski", () => {
  it("invokes the store's runTarskiWithAxioms and summarizes the report", () => {
    const fakeReport: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["e_1", "e_2"]),
      restrictedNodeIds: new Set(["n_1"]),
      proofTraces: [
        {
          edgeId: "e_1",
          verdict: "REJECTED",
          violatedAxioms: ["A-01"],
          solverUsed: "Z3",
          checkTimeMs: 1,
        },
      ],
      totalViolations: 3,
    };
    const { ctx, spy } = makeMockContext(buildGraph(), fakeReport);
    const result = executeTag({ name: "run_tarski", payload: "", raw: "" }, ctx);
    expect(spy.runTarskiCalls).toBe(1);
    expect(result).toContain("2 inconsistent edge(s)");
    expect(result).toContain("1 restricted node(s)");
    expect(result).toContain("1 proof trace(s)");
  });

  it("handles the no-report case without throwing", () => {
    const { ctx, spy } = makeMockContext(buildGraph(), null);
    const result = executeTag({ name: "run_tarski", payload: "", raw: "" }, ctx);
    expect(spy.runTarskiCalls).toBe(1);
    expect(result).toMatch(/produced no report/);
  });
});

// ─── set_node_size_metric ───────────────────────────────────────

describe("set_node_size_metric", () => {
  it("sets the metric on the store", () => {
    const { ctx, spy } = makeMockContext(buildGraph());
    const result = executeTag(
      { name: "set_node_size_metric", payload: "betweenness", raw: "" },
      ctx,
    );
    expect(spy.nodeSizeMetricCalls).toEqual(["betweenness"]);
    expect(result).toMatch(/betweenness/);
  });

  it("rejects values not in the enum", () => {
    const { ctx, spy } = makeMockContext(buildGraph());
    const result = executeTag(
      { name: "set_node_size_metric", payload: "purple", raw: "" },
      ctx,
    );
    expect(spy.nodeSizeMetricCalls).toEqual([]);
    expect(result).toMatch(/not in/);
  });
});

// ─── reset_ablation ─────────────────────────────────────────────

describe("reset_ablation", () => {
  it("calls resetAblation on the store", () => {
    const { ctx, spy } = makeMockContext(buildGraph());
    const result = executeTag({ name: "reset_ablation", payload: "", raw: "" }, ctx);
    expect(spy.resetAblationCalls).toBe(1);
    expect(result).toMatch(/Reset all ablations/);
  });
});
