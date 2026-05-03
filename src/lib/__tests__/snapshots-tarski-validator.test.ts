import { describe, it, expect } from "vitest";
import {
  reportToValidationResult,
  validateSnapshot,
} from "@/lib/snapshots/tarski-validator";
import type { SystemStateSnapshot } from "@/lib/snapshots/types";
import type { TarskiValidationReport } from "@/lib/tarski-data";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";

const baseSnapshot = (
  overrides: Partial<SystemStateSnapshot> = {},
): SystemStateSnapshot => ({
  version: 1,
  timestamp: new Date().toISOString(),
  graph: { nodes: [], edges: [] },
  engineOutputs: { spirtes: null, pareto: null, pearl: null },
  tarskiValidation: { status: "PENDING", violations: [], checkedAt: "" },
  metadata: { epochCount: 0, shockCount: 0, activeModule: "tarski" },
  ...overrides,
});

describe("validateSnapshot — unified with full 32-axiom validator", () => {
  it("uses the full validator when liveGraph is provided (chokepoint scenario)", () => {
    // Build a graph where A-04 should fire: a chokepoint node with
    // edge-weight sum exceeding the structural threshold.
    const graph = makeGraph(
      [
        makeNode({ id: "prod", label: "Persian Gulf Producer", domain: "Saudi Aramco Energy" }),
        makeNode({ id: "hormuz", label: "Strait of Hormuz", domain: "Saudi Aramco Energy" }),
        makeNode({ id: "buyer", label: "Asian Refinery", domain: "QatarEnergy LNG" }),
      ],
      [
        makeEdge({ id: "e1", source: "prod", target: "hormuz", weight: 1.0, type: "temporal" }),
        makeEdge({ id: "e2", source: "hormuz", target: "buyer", weight: 1.0, type: "temporal" }),
        makeEdge({ id: "e3", source: "prod", target: "hormuz", weight: 1.0, type: "temporal" }),
        makeEdge({ id: "e4", source: "hormuz", target: "buyer", weight: 1.0, type: "temporal" }),
      ],
    );

    const result = validateSnapshot(baseSnapshot(), {
      liveGraph: graph,
      enabledAxioms: new Set(["A-04"]),
    });
    expect(result.status).toBe("VIOLATIONS_FOUND");
    // A-04 surfaces as edge-bound violations on the temporal edges
    const a04 = result.violations.filter((v) => v.axiomId === "A-04");
    expect(a04.length).toBeGreaterThan(0);
    expect(a04[0].detail).toContain("Strait of Hormuz");
  });

  it("returns PASSED when liveGraph violates nothing", () => {
    const graph = makeGraph(
      [makeNode({ id: "n1", label: "Quiet node", domain: "Macro" })],
      [],
    );
    const result = validateSnapshot(baseSnapshot(), {
      liveGraph: graph,
      enabledAxioms: new Set(["A-04"]),
    });
    expect(result.status).toBe("PASSED");
    expect(result.violations).toHaveLength(0);
  });

  it("falls back to degraded 5-axiom checks when liveGraph is absent", () => {
    // Snapshot with omega > 9.5 should fire H-02 in the degraded path.
    const snapshot = baseSnapshot({
      graph: {
        nodes: [
          { id: "n1", omega: 9.7, fragility: 9.7, isActivated: true },
        ],
        edges: [],
      },
    });
    const result = validateSnapshot(snapshot);
    expect(result.status).toBe("VIOLATIONS_FOUND");
    const h02 = result.violations.find((v) => v.axiomId === "H-02");
    expect(h02).toBeDefined();
    expect(h02!.nodeId).toBe("n1");
  });

  it("degraded path PASSES when nothing is breached", () => {
    const snapshot = baseSnapshot({
      graph: {
        nodes: [{ id: "n1", omega: 5.0, fragility: 5.0, isActivated: true }],
        edges: [{ id: "e1", weight: 0.5, probability: 0.7, isSevered: false }],
      },
    });
    const result = validateSnapshot(snapshot);
    expect(result.status).toBe("PASSED");
  });
});

describe("reportToValidationResult adapter", () => {
  it("flattens proof traces into violations (one per axiom per trace)", () => {
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["e1"]),
      restrictedNodeIds: new Set(),
      proofTraces: [
        {
          edgeId: "e1",
          violatedAxioms: ["A-04", "R-01"],
          verdict: "FLAGGED",
          solverUsed: "Z3",
          checkTimeMs: 5,
          detail: "Hormuz chokepoint exceeded",
        },
      ],
      totalViolations: 1,
    };
    const result = reportToValidationResult(report);
    expect(result.status).toBe("VIOLATIONS_FOUND");
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0].axiomId).toBe("A-04");
    expect(result.violations[0].detail).toBe("Hormuz chokepoint exceeded");
    expect(result.violations[1].axiomId).toBe("R-01");
  });

  it("synthesises a default detail when the proof trace has none", () => {
    const report: TarskiValidationReport = {
      inconsistentEdgeIds: new Set(["e1"]),
      restrictedNodeIds: new Set(),
      proofTraces: [
        {
          edgeId: "e1",
          violatedAxioms: ["H-02"],
          verdict: "FLAGGED",
          solverUsed: "cvc5",
          checkTimeMs: 3,
        },
      ],
      totalViolations: 1,
    };
    const result = reportToValidationResult(report);
    expect(result.violations[0].detail).toContain("e1");
    expect(result.violations[0].detail).toContain("H-02");
  });

  it("returns PASSED when there are no proof traces and no restrictions", () => {
    const result = reportToValidationResult({
      inconsistentEdgeIds: new Set(),
      restrictedNodeIds: new Set(),
      proofTraces: [],
      totalViolations: 0,
    });
    expect(result.status).toBe("PASSED");
    expect(result.violations).toHaveLength(0);
  });
});
