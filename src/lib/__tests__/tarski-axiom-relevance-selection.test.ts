import { describe, it, expect } from "vitest";
import { scoreAxiomRelevance } from "@/lib/tarski-data";
import {
  makeNode,
  makeEdge,
  makeGraph,
} from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

// ─── scoreAxiomRelevance — selection-aware boosts ─────────────────────
//
// The recommender used to ignore the user's node selection entirely;
// PR makes it react. Tests pin:
//   - undefined / empty selection → behaviour identical to before
//   - selected chokepoint → A-04 / R-03 boosted with selection-specific
//     reason
//   - selected node with cross-domain incident edges → R-04 boost
//   - selected node with high J → R-01 / R-02 boost
//   - selected single-source node → A-05 boost
//   - selected node with live capacity saturation → A-02 + A-04 boost
//   - structural reasons are overridden by selection-specific ones

function scoreById(scored: ReturnType<typeof scoreAxiomRelevance>) {
  return new Map(scored.map((s) => [s.axiom.id, s]));
}

describe("scoreAxiomRelevance — no selection (backwards compat)", () => {
  it("undefined selection produces the same result as omitting the arg", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const graph = makeGraph([a], []);
    const noSel = scoreAxiomRelevance(graph, "geopolitical");
    const undefSel = scoreAxiomRelevance(graph, "geopolitical", undefined);
    expect(undefSel.map((s) => s.axiom.id)).toEqual(
      noSel.map((s) => s.axiom.id),
    );
    for (const s of noSel) {
      const matched = undefSel.find((x) => x.axiom.id === s.axiom.id)!;
      expect(matched.relevanceScore).toBe(s.relevanceScore);
    }
  });

  it("empty selection.selectedNode/selectedNodes does not change scores", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const graph = makeGraph([a], []);
    const noSel = scoreAxiomRelevance(graph, "geopolitical");
    const empty = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: null,
      selectedNodes: [],
    });
    for (const s of noSel) {
      const matched = empty.find((x) => x.axiom.id === s.axiom.id)!;
      expect(matched.relevanceScore).toBe(s.relevanceScore);
    }
  });
});

describe("scoreAxiomRelevance — selected chokepoint boosts A-04 / R-03", () => {
  it("selecting a Strait of Hormuz node boosts A-04 with selection-specific reason", () => {
    const hormuz = makeNode({
      id: "hormuz",
      label: "Strait of Hormuz",
      domain: "Saudi Aramco Energy",
    });
    const other = makeNode({ id: "other", domain: "Saudi Aramco Energy" });
    const graph = makeGraph(
      [hormuz, other],
      [makeEdge({ id: "e1", source: "other", target: "hormuz" })],
    );

    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "hormuz",
    });

    const a04Before = scoreById(without).get("A-04")!;
    const a04After = scoreById(withSel).get("A-04")!;
    expect(a04After.relevanceScore).toBeGreaterThan(a04Before.relevanceScore);
    expect(a04After.reason).toContain("Strait of Hormuz");
    expect(a04After.reason).toContain("chokepoint");
  });
});

describe("scoreAxiomRelevance — selected node with cross-domain incident edges boosts R-04", () => {
  it("boosts R-04 when an incident edge crosses domains", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const b = makeNode({ id: "b", domain: "finance" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "a", target: "b" })],
    );

    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "a",
    });

    const r04Before = scoreById(without).get("R-04")!;
    const r04After = scoreById(withSel).get("R-04")!;
    expect(r04After.relevanceScore).toBeGreaterThan(r04Before.relevanceScore);
    expect(r04After.reason).toContain("cross-domain");
  });

  it("does not boost R-04 when incident edges stay within one domain", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const b = makeNode({ id: "b", domain: "energy" });
    const graph = makeGraph(
      [a, b],
      [makeEdge({ id: "e1", source: "a", target: "b" })],
    );
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "a",
    });
    const r04Before = scoreById(without).get("R-04")!;
    const r04After = scoreById(withSel).get("R-04")!;
    expect(r04After.relevanceScore).toBe(r04Before.relevanceScore);
  });
});

describe("scoreAxiomRelevance — selected high-J node boosts R-01 / R-02", () => {
  it("selecting a node with J ≥ 6 boosts R-01 and R-02", () => {
    const highJ = makeNode({
      id: "highj",
      domain: "energy",
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 7,
        jurisdictionalHazard: 8,
        cascadeLoad: 5,
        tailDepth: 5,
      },
    });
    const graph = makeGraph([highJ], []);
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "highj",
    });
    for (const id of ["R-01", "R-02"]) {
      const b = scoreById(without).get(id)!;
      const a = scoreById(withSel).get(id)!;
      expect(a.relevanceScore).toBeGreaterThan(b.relevanceScore);
      expect(a.reason).toContain("high-J jurisdiction");
    }
  });
});

describe("scoreAxiomRelevance — selected single-source node boosts A-05", () => {
  it("boosts A-05 when the selected node has exactly 1 inbound + high cascade", () => {
    const src = makeNode({ id: "src" });
    const tgt = makeNode({
      id: "tgt",
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 8,
        tailDepth: 5,
      },
    });
    const graph = makeGraph(
      [src, tgt],
      [makeEdge({ id: "e1", source: "src", target: "tgt" })],
    );
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "tgt",
    });
    const before = scoreById(without).get("A-05")!;
    const after = scoreById(withSel).get("A-05")!;
    expect(after.relevanceScore).toBeGreaterThan(before.relevanceScore);
    expect(after.reason).toContain("single-supplier");
  });
});

describe("scoreAxiomRelevance — live capacity saturation boosts A-02 and A-04", () => {
  it("selecting a saturated production node boosts both", () => {
    const live: LiveDataPoint = {
      kind: "production",
      value: 11,
      capacity: 12,
      unit: "mb/d",
      observedAt: "2025-01-01T00:00:00.000Z",
      source: "test",
    };
    const sat = makeNode({
      id: "sat",
      label: "Saudi Crude",
      domain: "Saudi Aramco Energy",
      liveData: [live],
    });
    const graph = makeGraph([sat], []);
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "sat",
    });
    const a02Before = scoreById(without).get("A-02")!;
    const a02After = scoreById(withSel).get("A-02")!;
    expect(a02After.relevanceScore).toBeGreaterThan(a02Before.relevanceScore);
    expect(a02After.reason).toContain("saturation");
    expect(a02After.reason).toContain("A-02");

    const a04Before = scoreById(without).get("A-04")!;
    const a04After = scoreById(withSel).get("A-04")!;
    expect(a04After.relevanceScore).toBeGreaterThan(a04Before.relevanceScore);
  });

  it("does NOT boost A-02 when live ratio is below 0.9", () => {
    const live: LiveDataPoint = {
      kind: "production",
      value: 5,
      capacity: 12, // 0.42
      unit: "mb/d",
      observedAt: "2025-01-01T00:00:00.000Z",
      source: "test",
    };
    const sat = makeNode({ id: "sat", liveData: [live] });
    const graph = makeGraph([sat], []);
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "sat",
    });
    const before = scoreById(without).get("A-02")!;
    const after = scoreById(withSel).get("A-02")!;
    expect(after.relevanceScore).toBe(before.relevanceScore);
  });
});

describe("scoreAxiomRelevance — multi-select reasons use a count", () => {
  it("two selected chokepoints produce a 'Selection (2 nodes)' reason", () => {
    const a = makeNode({
      id: "a",
      label: "Strait of Hormuz",
      domain: "energy",
    });
    const b = makeNode({
      id: "b",
      label: "Bab el-Mandeb chokepoint",
      domain: "energy",
    });
    const graph = makeGraph([a, b], []);
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNodes: ["a", "b"],
    });
    const a04 = scoreById(withSel).get("A-04")!;
    expect(a04.reason).toContain("Selection (2 nodes)");
  });
});
