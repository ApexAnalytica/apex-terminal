import { describe, it, expect } from "vitest";
import { runTarskiValidation } from "@/lib/tarski-data";
import { makeGraph, makeNode, makeEdge } from "./fixtures/graph-fixtures";

// ─── Profile Isolation Suite ─────────────────────────────────────
// Verifies that geopolitical-only axioms (A-04, R-01, R-02, R-03) don't
// fire on a t1d-profile graph and vice versa once activeProfileId is
// supplied — closes the leakage gap surfaced in the Tarski audit.

function makeT1dGraph() {
  return makeGraph(
    [
      makeNode({
        id: "t1d_beta_mass",
        label: "β-cell mass",
        domain: "T1D β-cell Biology",
        category: "infrastructure",
        omegaFragility: {
          composite: 8.5,
          irreplaceability: 9,
          cascadeLoad: 8,
          tailDepth: 7,
          restorationLatency: 9,       // would trigger R-02 absent profile filter
          jurisdictionalHazard: 8.5,   // would trigger R-01 / R-02 absent filter
        },
      }),
      makeNode({
        id: "t1d_glucose",
        label: "Plasma glucose",
        domain: "T1D Metabolic",
        category: "infrastructure",
        omegaFragility: {
          composite: 7,
          irreplaceability: 6,
          cascadeLoad: 7,
          tailDepth: 6,
          restorationLatency: 5,
          jurisdictionalHazard: 8.5,   // pair w/ source above to satisfy maxJ ≥ 8
        },
      }),
    ],
    [
      makeEdge({
        id: "e_beta_glucose",
        source: "t1d_beta_mass",
        target: "t1d_glucose",
        weight: 0.85,                  // > 0.7 R-01 trigger threshold
        confidence: 0.9,
      }),
    ],
  );
}

function makeGeopoliticalChokepointGraph() {
  return makeGraph(
    [
      makeNode({
        id: "sa_terminal",
        label: "Ras Tanura terminal",
        domain: "Saudi Aramco Energy",
        category: "energy",
        omegaFragility: {
          composite: 7,
          irreplaceability: 8,
          cascadeLoad: 7,
          tailDepth: 6,
          restorationLatency: 6,
          jurisdictionalHazard: 7,
        },
      }),
      makeNode({
        id: "qf_strait_of_hormuz",
        label: "Strait of Hormuz",
        domain: "Saudi Aramco Energy",
        category: "infrastructure",
        omegaFragility: {
          composite: 9,
          irreplaceability: 10,
          cascadeLoad: 9,
          tailDepth: 8,
          restorationLatency: 8,
          jurisdictionalHazard: 9,
        },
      }),
    ],
    [
      makeEdge({
        id: "e_sa_strait",
        source: "sa_terminal",
        target: "qf_strait_of_hormuz",
        weight: 1.5,                   // structural-flow trigger for A-04
        type: "temporal",
      }),
      makeEdge({
        id: "e_strait_out",
        source: "qf_strait_of_hormuz",
        target: "sa_terminal",         // edge out, sums to > 3.0 structural threshold
        weight: 1.6,
        type: "temporal",
      }),
    ],
  );
}

describe("runTarskiValidation — profile isolation", () => {
  it("geopolitical-scoped axioms fire on a geopolitical graph (no profile filter)", () => {
    const graph = makeGeopoliticalChokepointGraph();
    const report = runTarskiValidation(graph);
    const fired = new Set(
      report.proofTraces.flatMap((t) => t.violatedAxioms),
    );
    // A-04 (Chokepoint) must fire — that's the chokepoint axiom
    expect(fired.has("A-04")).toBe(true);
  });

  it("geopolitical-scoped axioms STILL fire on geopolitical graph WITH profile id (positive control)", () => {
    const graph = makeGeopoliticalChokepointGraph();
    const report = runTarskiValidation(graph, undefined, "geopolitical");
    const fired = new Set(
      report.proofTraces.flatMap((t) => t.violatedAxioms),
    );
    expect(fired.has("A-04")).toBe(true);
  });

  it("geopolitical-scoped axioms do NOT fire on t1d profile (leakage prevention)", () => {
    const graph = makeT1dGraph();
    const report = runTarskiValidation(graph, undefined, "t1d");
    const fired = new Set(
      report.proofTraces.flatMap((t) => t.violatedAxioms),
    );
    // A-04 / R-01 / R-02 / R-03 are scoped to "geopolitical" via appliesTo.
    // None should appear in violations on a t1d-profile graph.
    expect(fired.has("A-04")).toBe(false);
    expect(fired.has("R-01")).toBe(false);
    expect(fired.has("R-02")).toBe(false);
    expect(fired.has("R-03")).toBe(false);
    // Universal axioms (A-05 single-source fragility) may still flag the
    // node — that's expected since a single-input + high-cascade pattern
    // is profile-agnostic. We only need the geopolitical-scoped traces
    // to be absent.
  });

  it("universal axioms (A-01) still fire on t1d profile", () => {
    // Negative-weight edge — A-01 violation that should fire on any profile.
    const graph = makeGraph(
      [
        makeNode({ id: "n1", domain: "T1D Metabolic" }),
        makeNode({ id: "n2", domain: "T1D Metabolic" }),
      ],
      [makeEdge({ id: "e_neg", source: "n1", target: "n2", weight: -0.5 })],
    );
    const report = runTarskiValidation(graph, undefined, "t1d");
    expect(
      report.proofTraces.some((t) => t.violatedAxioms.includes("A-01")),
    ).toBe(true);
  });

  it("explicit enabled-axioms set cannot override profile scoping", () => {
    // Caller asks for A-04 explicitly on a t1d graph — profile filter wins.
    const graph = makeT1dGraph();
    const report = runTarskiValidation(
      graph,
      new Set(["A-04", "R-01", "A-01"]),
      "t1d",
    );
    const fired = new Set(
      report.proofTraces.flatMap((t) => t.violatedAxioms),
    );
    expect(fired.has("A-04")).toBe(false);
    expect(fired.has("R-01")).toBe(false);
  });

  it("legacy two-arg call signature still works (back-compat)", () => {
    const graph = makeGeopoliticalChokepointGraph();
    // Old signature: no profile id. Legacy behaviour — every implemented
    // check fires. A-04 is currently implemented; verify it does fire.
    const report = runTarskiValidation(graph, undefined);
    const fired = new Set(
      report.proofTraces.flatMap((t) => t.violatedAxioms),
    );
    expect(fired.has("A-04")).toBe(true);
  });
});
