import { describe, it, expect } from "vitest";
import { AXIOM_LIBRARY, scoreAxiomRelevance } from "@/lib/tarski-data";
import { makeGraph, makeNode, makeEdge } from "./fixtures/graph-fixtures";

const UNIVERSAL_AXIOM_IDS = [
  "A-01",
  "A-02",
  "A-03",
  "A-05",
  "R-04",
  "H-01",
  "H-02",
] as const;

describe("Universal axiom library — Phase resolution of #75 follow-up", () => {
  it("the 7 universal-concept axioms have no appliesTo (apply to every profile)", () => {
    for (const id of UNIVERSAL_AXIOM_IDS) {
      const axiom = AXIOM_LIBRARY.find((a) => a.id === id);
      expect(axiom, `axiom ${id} missing from library`).toBeDefined();
      expect(axiom!.appliesTo, `axiom ${id} should be universal (no appliesTo)`).toBeUndefined();
    }
  });

  it("universal axioms have no domain-specific `relevantDomains` (genericized)", () => {
    for (const id of UNIVERSAL_AXIOM_IDS) {
      const axiom = AXIOM_LIBRARY.find((a) => a.id === id)!;
      expect(axiom.relevantDomains).toEqual([]);
    }
  });

  it("universal axioms' descriptions and plainText carry no geopolitical-specific vocabulary", () => {
    const geopoliticalTokens = [
      "saudi",
      "aramco",
      "qatar",
      "qafco",
      "ma'aden",
      "phosphate",
      "lng",
      "hormuz",
      "strait",
      "war-adjacent",
    ];
    for (const id of UNIVERSAL_AXIOM_IDS) {
      const axiom = AXIOM_LIBRARY.find((a) => a.id === id)!;
      const haystack = `${axiom.description} ${axiom.plainText} ${axiom.diagramHint ?? ""}`.toLowerCase();
      for (const token of geopoliticalTokens) {
        expect(
          haystack.includes(token),
          `axiom ${id} wording leaks geopolitical token "${token}"`,
        ).toBe(false);
      }
    }
  });

  it("universal axioms surface as recommended on a T1D-profile graph", () => {
    // Synthetic T1D-flavoured graph (no geopolitical domains)
    const t1dGraph = makeGraph(
      [
        makeNode({ id: "n1", label: "β-cell mass", domain: "Glycemic Control" }),
        makeNode({ id: "n2", label: "Insulin output", domain: "Glycemic Control" }),
      ],
      [makeEdge({ id: "e1", source: "n1", target: "n2" })],
    );
    const scored = scoreAxiomRelevance(t1dGraph, "t1d");
    for (const id of UNIVERSAL_AXIOM_IDS) {
      const entry = scored.find((s) => s.axiom.id === id);
      expect(entry, `axiom ${id} should appear in scored list for T1D profile`).toBeDefined();
      expect(
        entry!.relevanceScore,
        `axiom ${id} should score >= 0.4 (recommended) on T1D`,
      ).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("universal axioms still surface on a geopolitical-profile graph", () => {
    const geoGraph = makeGraph(
      [
        makeNode({ id: "n1", label: "Saudi Producer", domain: "Saudi Aramco Energy" }),
        makeNode({ id: "n2", label: "European Refinery", domain: "QatarEnergy LNG" }),
      ],
      [makeEdge({ id: "e1", source: "n1", target: "n2" })],
    );
    const scored = scoreAxiomRelevance(geoGraph, "geopolitical");
    for (const id of UNIVERSAL_AXIOM_IDS) {
      const entry = scored.find((s) => s.axiom.id === id);
      expect(entry, `axiom ${id} should appear in scored list for geopolitical profile`).toBeDefined();
      expect(
        entry!.relevanceScore,
        `axiom ${id} should score >= 0.4 on geopolitical`,
      ).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("geopolitical-only axioms (A-04, R-01, R-02, R-03) still scoped to geopolitical", () => {
    const geoOnly = ["A-04", "R-01", "R-02", "R-03"] as const;
    for (const id of geoOnly) {
      const axiom = AXIOM_LIBRARY.find((a) => a.id === id);
      expect(axiom, `axiom ${id} missing`).toBeDefined();
      expect(axiom!.appliesTo, `axiom ${id} must stay scoped to geopolitical`).toEqual([
        "geopolitical",
      ]);
    }
  });

  it("T1D-only axioms (TA-*, TR-*, TH-*) still scoped to t1d", () => {
    const t1dOnly = AXIOM_LIBRARY.filter((a) => a.id.startsWith("T"));
    expect(t1dOnly.length).toBeGreaterThan(0);
    for (const axiom of t1dOnly) {
      expect(axiom.appliesTo, `axiom ${axiom.id} must stay scoped to t1d`).toEqual(["t1d"]);
    }
  });

  it("universal axioms do NOT surface on a T1D-flavoured graph when the geopolitical-only A-04 is queried", () => {
    // Negative-control: A-04 is geopolitical-only, so it should be filtered out
    // when activeProfileId === "t1d", regardless of universal axioms surfacing.
    const t1dGraph = makeGraph(
      [makeNode({ id: "n1", label: "β-cell mass", domain: "Glycemic Control" })],
      [],
    );
    const scored = scoreAxiomRelevance(t1dGraph, "t1d");
    expect(scored.find((s) => s.axiom.id === "A-04")).toBeUndefined();
  });
});
