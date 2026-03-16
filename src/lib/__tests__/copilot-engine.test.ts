import { describe, it, expect } from "vitest";
import { processAction, processNodeAnalysis, processQuery } from "@/lib/copilot-engine";
import { linearGraph, makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";

function richGraph() {
  const nodes = [
    makeNode({
      id: "n1",
      label: "TSMC Fab",
      shortLabel: "TSM",
      category: "manufacturing",
      domain: "EUV Lithography",
      omegaFragility: { composite: 9.9, irreplaceability: 9.5, cascadeLoad: 9.8, tailDepth: 9.6, restorationLatency: 5.0, jurisdictionalHazard: 5.0 },
      globalConcentration: "92% Taiwan",
      replacementTime: "5-7 years",
      discoverySource: "DCD",
      isConfounded: true,
      isRestricted: true,
      physicalConstraint: "EUV lithography single-source",
    }),
    makeNode({
      id: "n2",
      label: "AI Compute",
      shortLabel: "AIC",
      category: "infrastructure",
      domain: "AI Compute",
      omegaFragility: { composite: 8.5, irreplaceability: 8.0, cascadeLoad: 9.0, tailDepth: 8.2, restorationLatency: 5.0, jurisdictionalHazard: 5.0 },
    }),
    makeNode({
      id: "n3",
      label: "Data Centers",
      shortLabel: "DC",
      category: "infrastructure",
      domain: "Data Centers",
      omegaFragility: { composite: 7.0, irreplaceability: 6.5, cascadeLoad: 7.5, tailDepth: 6.8, restorationLatency: 5.0, jurisdictionalHazard: 5.0 },
    }),
  ];
  const edges = [
    makeEdge({ id: "e1", source: "n1", target: "n2", physicalMechanism: "supplies chips" }),
    makeEdge({ id: "e2", source: "n2", target: "n3", physicalMechanism: "powers" }),
  ];
  return makeGraph(nodes, edges);
}

// ─── processAction ──────────────────────────────────────────────

describe("processAction", () => {
  it("DISCOVER_STRUCTURE returns Spirtes module output", () => {
    const msgs = processAction("DISCOVER_STRUCTURE", richGraph());
    expect(msgs).toHaveLength(1);
    expect(msgs[0].module).toBe("spirtes");
    expect(msgs[0].content).toContain("SPIRTES");
    expect(msgs[0].content).toContain("DCD");
  });

  it("DISCOVER_STRUCTURE includes graph stats", () => {
    const graph = richGraph();
    const msgs = processAction("DISCOVER_STRUCTURE", graph);
    expect(msgs[0].content).toContain(String(graph.metadata.totalNodes));
    expect(msgs[0].content).toContain(String(graph.metadata.totalEdges));
  });

  it("DISCOVER_STRUCTURE includes dynamic cascade chains", () => {
    const msgs = processAction("DISCOVER_STRUCTURE", richGraph());
    // Should reference actual node labels, not hardcoded ones
    expect(msgs[0].content).toContain("TSM");
  });

  it("EXPLAIN_REJECTION returns Tarski module output", () => {
    const msgs = processAction("EXPLAIN_REJECTION", richGraph());
    expect(msgs[0].module).toBe("tarski");
    expect(msgs[0].content).toContain("TARSKI");
  });

  it("EXPLAIN_REJECTION uses dynamic Tarski data", () => {
    const msgs = processAction("EXPLAIN_REJECTION", richGraph());
    const content = msgs[0].content;
    // Should contain detected counts from validation, not hardcoded text
    expect(content).toContain("inconsistent edge(s)");
    expect(content).toContain("node(s)");
    // Should NOT contain old hardcoded references
    expect(content).not.toContain("N. Virginia Hub");
    expect(content).not.toContain("Fed Swap Lines");
  });

  it("VERIFY_LOGIC returns Pearl module output", () => {
    const msgs = processAction("VERIFY_LOGIC", richGraph());
    expect(msgs[0].module).toBe("pearl");
    expect(msgs[0].content).toContain("PEARL");
    expect(msgs[0].content).toContain("do-calculus");
  });

  it("VERIFY_LOGIC includes dynamic intervention targets", () => {
    const msgs = processAction("VERIFY_LOGIC", richGraph());
    const content = msgs[0].content;
    // Should reference actual graph nodes
    expect(content).toContain("TSM");
  });

  it("all messages have valid IDs and timestamps", () => {
    const msgs = processAction("DISCOVER_STRUCTURE", richGraph());
    for (const msg of msgs) {
      expect(msg.id).toMatch(/^cop-\d+/);
      expect(typeof msg.timestamp).toBe("number");
      expect(msg.role).toBe("assistant");
    }
  });
});

// ─── processNodeAnalysis ────────────────────────────────────────

describe("processNodeAnalysis", () => {
  it("returns node not found for invalid ID", () => {
    const msgs = processNodeAnalysis("nonexistent", richGraph());
    expect(msgs[0].content).toContain("not found");
  });

  it("returns full Ω-Fragility breakdown", () => {
    const msgs = processNodeAnalysis("n1", richGraph());
    const content = msgs[0].content;
    expect(content).toContain("Composite:");
    expect(content).toContain("Irreplaceability:");
    expect(content).toContain("Cascade Load:");
    expect(content).toContain("9.9"); // composite value
  });

  it("shows OMEGA-CRITICAL tier for composite > 9", () => {
    const msgs = processNodeAnalysis("n1", richGraph());
    expect(msgs[0].content).toContain("OMEGA-CRITICAL");
  });

  it("shows HIGH RISK tier for composite >= 7", () => {
    const msgs = processNodeAnalysis("n2", richGraph());
    expect(msgs[0].content).toContain("HIGH RISK");
  });

  it("includes upstream and downstream edges", () => {
    const msgs = processNodeAnalysis("n2", richGraph());
    const content = msgs[0].content;
    expect(content).toContain("Upstream (1)");
    expect(content).toContain("Downstream (1)");
    expect(content).toContain("TSM"); // upstream shortLabel
    expect(content).toContain("DC"); // downstream shortLabel
  });

  it("includes confounded and restricted warnings", () => {
    const msgs = processNodeAnalysis("n1", richGraph());
    const content = msgs[0].content;
    expect(content).toContain("Confounded");
    expect(content).toContain("Tarski-restricted");
  });

  it("includes physical constraint when present", () => {
    const msgs = processNodeAnalysis("n1", richGraph());
    expect(msgs[0].content).toContain("Physical Constraint");
  });
});

// ─── processQuery ───────────────────────────────────────────────

describe("processQuery", () => {
  it("routes RISK keyword to risk propagation analysis", () => {
    const msgs = processQuery("risk propagation paths", richGraph());
    expect(msgs[0].content).toContain("Risk propagation");
    expect(msgs[0].module).toBe("spirtes");
  });

  it("risk query includes dynamic cascade chains from graph", () => {
    const msgs = processQuery("risk propagation", richGraph());
    const content = msgs[0].content;
    // Should reference actual graph nodes, not hardcoded chains
    expect(content).toContain("TSM");
    expect(content).not.toContain("ZEISS Optics");
    expect(content).not.toContain("Baotou Rare Earth");
  });

  it("routes COUNTERFACTUAL keyword to Pearl engine", () => {
    const msgs = processQuery("counterfactual analysis of TSMC", richGraph());
    expect(msgs[0].content).toContain("PEARL");
    expect(msgs[0].module).toBe("pearl");
  });

  it("routes WHAT IF keyword to Pearl engine", () => {
    const msgs = processQuery("what if we remove this node", richGraph());
    expect(msgs[0].content).toContain("PEARL");
  });

  it("routes SHOCK keyword to shock injection info", () => {
    const msgs = processQuery("available shock scenarios", richGraph());
    expect(msgs[0].content).toContain("Shock injection");
    expect(msgs[0].module).toBe("pareto");
  });

  it("routes STRESS keyword to shock info", () => {
    const msgs = processQuery("stress test the grid", richGraph());
    expect(msgs[0].content).toContain("Shock injection");
  });

  it("returns generic analysis for unmatched queries", () => {
    const msgs = processQuery("tell me about this graph", richGraph());
    const content = msgs[0].content;
    expect(content).toContain("Analyzing");
    expect(content).toContain(String(richGraph().metadata.totalNodes));
  });

  it("generic query includes top node by omega", () => {
    const msgs = processQuery("overview", richGraph());
    expect(msgs[0].content).toContain("TSMC Fab"); // highest omega
  });
});
