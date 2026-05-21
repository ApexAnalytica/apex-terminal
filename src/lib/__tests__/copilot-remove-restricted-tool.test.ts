// ─── remove_restricted_nodes — focused tool tests ─────────────
//
// Direct unit tests for the bulk-ablate-restricted-nodes tool.
// We import tools.ts (side-effect register) and then invoke the
// tool via executeTagWithTrace against a mock store. Pure tests:
// no live LLM, no DOM, no Supabase.

import { describe, it, expect } from "vitest";
import {
  executeTagWithTrace,
  type ToolContext,
} from "@/lib/copilot/tool-registry";
import type { ApexState } from "@/stores/useApexStore";
import type { CausalGraph, TarskiAxiom, ProofTrace } from "@/lib/types";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";
// Side-effect: registers all built-in tools (including
// remove_restricted_nodes) into the shared registry. The other
// built-in-tool test suite uses the same pattern — don't reset
// the registry between tests, just rely on this import.
import "@/lib/copilot/tools";

// ─── Mock store ─────────────────────────────────────────────────

interface StoreSpy {
  ablationModeCalls: boolean[];
  toggledNodeIds: string[];
  ablatedNodeIds: string[];
}

function makeCtx(
  graph: CausalGraph,
  tarskiReport: {
    restrictedNodeIds: Set<string>;
    proofTraces: ProofTrace[];
  } | null,
  initialAblated: string[] = [],
): { ctx: ToolContext; spy: StoreSpy } {
  const spy: StoreSpy = {
    ablationModeCalls: [],
    toggledNodeIds: [],
    ablatedNodeIds: [...initialAblated],
  };

  const fakeStore = {
    graphData: graph,
    ablatedNodeIds: spy.ablatedNodeIds,
    tarskiReport: tarskiReport
      ? {
          restrictedNodeIds: tarskiReport.restrictedNodeIds,
          proofTraces: tarskiReport.proofTraces,
          inconsistentEdgeIds: new Set<string>(),
          totalViolations: tarskiReport.proofTraces.length,
        }
      : null,
    setAblationMode: (on: boolean) => spy.ablationModeCalls.push(on),
    toggleAblatedNode: (id: string) => {
      spy.toggledNodeIds.push(id);
      // Mirror real store: toggle membership in ablatedNodeIds.
      const idx = spy.ablatedNodeIds.indexOf(id);
      if (idx === -1) spy.ablatedNodeIds.push(id);
      else spy.ablatedNodeIds.splice(idx, 1);
    },
  } as unknown as ApexState;

  return { ctx: { getStore: () => fakeStore }, spy };
}

// ─── Fixtures ───────────────────────────────────────────────────

function fixtureGraph(): CausalGraph {
  // Five nodes, four edges. Restricted: GRID_USA, FAB_TW, ASML_NL.
  // Proof traces flag GRID_USA → FAB_TW under A-01 (Temporal
  // Priority), and ASML_NL → FAB_TW under A-04 (Hormuz Chokepoint).
  const nodes = [
    makeNode({ id: "GRID_USA", label: "USA Power Grid" }),
    makeNode({ id: "OIL_TX", label: "TX Oil Pipeline" }),
    makeNode({ id: "FAB_TW", label: "TSMC Fab" }),
    makeNode({ id: "ASML_NL", label: "ASML EUV Tools" }),
    makeNode({ id: "BANK_NY", label: "NY Clearing Bank" }),
  ];
  const edges = [
    makeEdge({ id: "e1", source: "GRID_USA", target: "FAB_TW" }),
    makeEdge({ id: "e2", source: "OIL_TX", target: "FAB_TW" }),
    makeEdge({ id: "e3", source: "ASML_NL", target: "FAB_TW" }),
    makeEdge({ id: "e4", source: "BANK_NY", target: "GRID_USA" }),
  ];
  return makeGraph(nodes, edges);
}

const restrictedReport = {
  restrictedNodeIds: new Set(["GRID_USA", "FAB_TW", "ASML_NL"]),
  proofTraces: [
    {
      edgeId: "e1",
      violatedAxioms: ["A-01"],
      verdict: "REJECTED" as const,
      solverUsed: "Z3" as const,
      checkTimeMs: 1,
    },
    {
      edgeId: "e3",
      violatedAxioms: ["A-04"],
      verdict: "REJECTED" as const,
      solverUsed: "Z3" as const,
      checkTimeMs: 1,
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────

describe("remove_restricted_nodes", () => {
  it("errors clearly when no Tarski report is present", async () => {
    const { ctx } = makeCtx(fixtureGraph(), null);
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: "", raw: "" },
      ctx,
    );
    expect(trace.result).toMatch(/no tarski report/i);
    expect(trace.error).toBeNull();
  });

  it("returns a no-op message when the report has zero restricted nodes", async () => {
    const { ctx, spy } = makeCtx(fixtureGraph(), {
      restrictedNodeIds: new Set(),
      proofTraces: [],
    });
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: "", raw: "" },
      ctx,
    );
    expect(trace.result).toMatch(/no restricted nodes/i);
    expect(spy.toggledNodeIds).toEqual([]);
    expect(spy.ablationModeCalls).toEqual([]);
  });

  it("ablates every restricted node when called with no filter", async () => {
    const { ctx, spy } = makeCtx(fixtureGraph(), restrictedReport);
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: "", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    // All three restricted nodes get ablated.
    expect(spy.toggledNodeIds.sort()).toEqual(["ASML_NL", "FAB_TW", "GRID_USA"]);
    // Ablation mode turned on so the renderer hides them.
    expect(spy.ablationModeCalls).toContain(true);
    // Result text counts + lists labels.
    expect(trace.result).toMatch(/removed 3 restricted nodes/i);
  });

  it("skips already-ablated nodes so the toggle doesn't un-ablate them", async () => {
    const { ctx, spy } = makeCtx(fixtureGraph(), restrictedReport, ["GRID_USA"]);
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: "", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    // GRID_USA was already ablated — only the other two should toggle.
    expect(spy.toggledNodeIds.sort()).toEqual(["ASML_NL", "FAB_TW"]);
  });

  it("filters by axiom id (exact)", async () => {
    const { ctx, spy } = makeCtx(fixtureGraph(), restrictedReport);
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: "axiom=A-01", raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    // A-01 flags edge e1 (GRID_USA → FAB_TW). Both endpoints are
    // in restrictedNodeIds, so both ablate.
    expect(spy.toggledNodeIds.sort()).toEqual(["FAB_TW", "GRID_USA"]);
    expect(spy.toggledNodeIds).not.toContain("ASML_NL");
  });

  it("filters by axiom name substring (case-insensitive)", async () => {
    // Spot-check that the axiom library has a substring we expect.
    const axiom = (await import("@/lib/tarski-data")).AXIOM_LIBRARY.find(
      (a: TarskiAxiom) => a.id === "A-04",
    );
    expect(axiom).toBeDefined();
    // Find some recognizable substring of A-04's name.
    const namePart = axiom!.name.split(" ")[0].toLowerCase();

    const { ctx, spy } = makeCtx(fixtureGraph(), restrictedReport);
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: `axiom=${namePart}`, raw: "" },
      ctx,
    );
    expect(trace.error).toBeNull();
    // A-04 flags e3 (ASML_NL → FAB_TW). Both endpoints restricted → both ablate.
    expect(spy.toggledNodeIds.sort()).toEqual(["ASML_NL", "FAB_TW"]);
  });

  it("errors when the axiom string matches nothing", async () => {
    const { ctx, spy } = makeCtx(fixtureGraph(), restrictedReport);
    const trace = await executeTagWithTrace(
      { name: "remove_restricted_nodes", payload: "axiom=unknown-axiom-xyz", raw: "" },
      ctx,
    );
    expect(trace.result).toMatch(/no tarski axiom matched/i);
    expect(spy.toggledNodeIds).toEqual([]);
  });
});
