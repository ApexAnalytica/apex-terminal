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

describe("scoreAxiomRelevance — calc-driven boosts (HHI → A-05 / R-01)", () => {
  function hhiPoint(
    kind: "calc:supply-hhi" | "calc:buyer-hhi",
    value: number,
  ): LiveDataPoint {
    return {
      kind,
      value,
      capacity: 10_000,
      unit: "HHI",
      observedAt: "2025-01-01T00:00:00.000Z",
      source: "test",
    };
  }

  it("Supply HHI ≥ 2500 on selected node boosts A-05 with HHI-specific reason", () => {
    const n = makeNode({
      id: "n",
      label: "Refinery",
      liveData: [hhiPoint("calc:supply-hhi", 3200)],
    });
    const graph = makeGraph([n], []);
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "n",
    });
    const before = scoreById(without).get("A-05")!;
    const after = scoreById(withSel).get("A-05")!;
    expect(after.relevanceScore).toBeGreaterThan(before.relevanceScore);
    expect(after.reason).toContain("Refinery");
    expect(after.reason).toContain("Supply HHI");
    expect(after.reason).toContain("concentrated");
  });

  it("Buyer HHI ≥ 2500 on selected node boosts A-05 when no Supply HHI present", () => {
    const n = makeNode({
      id: "n",
      label: "Smelter",
      liveData: [hhiPoint("calc:buyer-hhi", 2800)],
    });
    const graph = makeGraph([n], []);
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "n",
    });
    const a05 = scoreById(withSel).get("A-05")!;
    expect(a05.reason).toContain("Buyer HHI");
    expect(a05.reason).toContain("concentrated demand");
  });

  it("Supply HHI below 2500 does NOT boost A-05", () => {
    const n = makeNode({
      id: "n",
      liveData: [hhiPoint("calc:supply-hhi", 1800)], // moderately concentrated, not HIGH
    });
    const graph = makeGraph([n], []);
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "n",
    });
    const before = scoreById(without).get("A-05")!;
    const after = scoreById(withSel).get("A-05")!;
    expect(after.relevanceScore).toBe(before.relevanceScore);
  });

  it("Supply HHI ≥ 2500 + jurisdictionalHazard ≥ 6 compounds into R-01", () => {
    const n = makeNode({
      id: "n",
      label: "Hormuz",
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        cascadeLoad: 5,
        tailDepth: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 8, // ≥ 6
      },
      liveData: [hhiPoint("calc:supply-hhi", 3500)],
    });
    const graph = makeGraph([n], []);
    const without = scoreAxiomRelevance(graph, "geopolitical");
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "n",
    });
    const before = scoreById(without).get("R-01")!;
    const after = scoreById(withSel).get("R-01")!;
    expect(after.relevanceScore).toBeGreaterThan(before.relevanceScore);
    expect(after.reason).toContain("Supply HHI");
    expect(after.reason).toContain("high-J");
  });

  it("falls back to plain high-J reason when HHI < 2500 even if J ≥ 6", () => {
    const n = makeNode({
      id: "n",
      label: "Tank",
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        cascadeLoad: 5,
        tailDepth: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 8,
      },
      liveData: [hhiPoint("calc:supply-hhi", 1200)],
    });
    const graph = makeGraph([n], []);
    const withSel = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "n",
    });
    const r01 = scoreById(withSel).get("R-01")!;
    expect(r01.reason).toContain("high-J jurisdiction");
    expect(r01.reason).not.toContain("Supply HHI");
  });
});

describe("scoreAxiomRelevance — recommender memory (recency boost)", () => {
  it("recent click on an axiom lifts its score above baseline", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const graph = makeGraph([a], []);
    const baseline = scoreAxiomRelevance(graph, "geopolitical");
    const baselineR04 = scoreById(baseline).get("R-04")!;

    const withRecency = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {
        "R-04": {
          lastClickedAt: "2026-05-30T00:00:00.000Z",
          clickCount: 1,
        },
      },
      now: "2026-05-30T00:00:00.000Z", // Δd = 0
    });
    const lifted = scoreById(withRecency).get("R-04")!;
    expect(lifted.relevanceScore).toBeGreaterThan(baselineR04.relevanceScore);
    // Δd = 0 ⇒ full boost (~0.15)
    expect(lifted.relevanceScore - baselineR04.relevanceScore).toBeCloseTo(0.15, 2);
  });

  it("decays toward zero as Δt grows past several τ", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const graph = makeGraph([a], []);
    const baseline = scoreAxiomRelevance(graph, "geopolitical");
    const baselineR04 = scoreById(baseline).get("R-04")!;

    // 30 days ⇒ exp(-30/7) ≈ 0.014 ⇒ boost ≈ 0.0021 (below 0.005 cutoff)
    const decayed = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {
        "R-04": {
          lastClickedAt: "2026-04-30T00:00:00.000Z",
          clickCount: 1,
        },
      },
      now: "2026-05-30T00:00:00.000Z",
    });
    const r04 = scoreById(decayed).get("R-04")!;
    expect(r04.relevanceScore).toBe(baselineR04.relevanceScore);
  });

  it("partially decays at Δt = τ (one week)", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const graph = makeGraph([a], []);
    const baseline = scoreAxiomRelevance(graph, "geopolitical");
    const baselineR04 = scoreById(baseline).get("R-04")!;

    // 7 days = τ ⇒ exp(-1) ≈ 0.368 ⇒ boost ≈ 0.055
    const oneTau = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {
        "R-04": {
          lastClickedAt: "2026-05-23T00:00:00.000Z",
          clickCount: 1,
        },
      },
      now: "2026-05-30T00:00:00.000Z",
    });
    const r04 = scoreById(oneTau).get("R-04")!;
    const delta = r04.relevanceScore - baselineR04.relevanceScore;
    expect(delta).toBeGreaterThan(0.04);
    expect(delta).toBeLessThan(0.07);
  });

  it("does NOT mask selection-aware reasons", () => {
    const hormuz = makeNode({
      id: "hormuz",
      label: "Strait of Hormuz",
      domain: "Saudi Aramco Energy",
    });
    const graph = makeGraph([hormuz], []);
    const scored = scoreAxiomRelevance(graph, "geopolitical", {
      selectedNode: "hormuz",
      interactionHistory: {
        "A-04": {
          lastClickedAt: "2026-05-30T00:00:00.000Z",
          clickCount: 5,
        },
      },
      now: "2026-05-30T00:00:00.000Z",
    });
    const a04 = scoreById(scored).get("A-04")!;
    // Selection reason wins; recency does not overwrite it
    expect(a04.reason).toContain("Strait of Hormuz");
    expect(a04.reason).not.toContain("Recently investigated");
  });

  it("falls back to a recency reason when no other reason fires", () => {
    const a = makeNode({ id: "a", domain: "weather" }); // off-profile
    const graph = makeGraph([a], []);
    const scored = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {
        "R-04": {
          lastClickedAt: "2026-05-30T00:00:00.000Z",
          clickCount: 1,
        },
      },
      now: "2026-05-30T00:00:00.000Z",
    });
    const r04 = scoreById(scored).get("R-04")!;
    expect(r04.reason).toContain("Recently investigated");
    expect(r04.reason).toContain("today");
  });

  it("uses 'yesterday' / 'N days ago' labels for older clicks", () => {
    const a = makeNode({ id: "a", domain: "weather" });
    const graph = makeGraph([a], []);
    const yesterday = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {
        "R-04": {
          lastClickedAt: "2026-05-29T00:00:00.000Z",
          clickCount: 1,
        },
      },
      now: "2026-05-30T00:00:00.000Z",
    });
    expect(scoreById(yesterday).get("R-04")!.reason).toContain("yesterday");

    const fiveDaysAgo = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {
        "R-04": {
          lastClickedAt: "2026-05-25T00:00:00.000Z",
          clickCount: 1,
        },
      },
      now: "2026-05-30T00:00:00.000Z",
    });
    expect(scoreById(fiveDaysAgo).get("R-04")!.reason).toContain("5 days ago");
  });

  it("omitting interactionHistory preserves backwards-compat (no recency layer)", () => {
    const a = makeNode({ id: "a", domain: "energy" });
    const graph = makeGraph([a], []);
    const withoutHistory = scoreAxiomRelevance(graph, "geopolitical");
    const withEmptyHistory = scoreAxiomRelevance(graph, "geopolitical", {
      interactionHistory: {},
    });
    for (const s of withoutHistory) {
      const matched = withEmptyHistory.find((x) => x.axiom.id === s.axiom.id)!;
      expect(matched.relevanceScore).toBe(s.relevanceScore);
    }
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
