import { describe, it, expect } from "vitest";
import { validateParsedGraph } from "@/lib/import/validation";
import { ParsedGraph } from "@/lib/import/types";
import { makeGraph, makeNode, makeEdge } from "../fixtures/graph-fixtures";

function makeParsed(overrides?: Partial<ParsedGraph>): ParsedGraph {
  return {
    nodes: [],
    edges: [],
    format: "json",
    warnings: [],
    ...overrides,
  };
}

const EMPTY_EXISTING = makeGraph([], []);

describe("validateParsedGraph", () => {
  it("returns valid for clean input", () => {
    const parsed = makeParsed({
      nodes: [{ id: "n1", category: "energy" }],
      edges: [],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.valid).toBe(true);
    expect(result.resolvedNodes).toHaveLength(1);
  });

  it("flags duplicate node IDs within import file as errors", () => {
    const parsed = makeParsed({
      nodes: [{ id: "n1" }, { id: "n1" }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    const dupIssue = result.issues.find(
      (i) => i.severity === "error" && i.message.includes("Duplicate node")
    );
    expect(dupIssue).toBeDefined();
  });

  it("warns when node ID already exists in graph", () => {
    const existing = makeGraph([makeNode({ id: "n1" })], []);
    const parsed = makeParsed({ nodes: [{ id: "n1" }] });
    const result = validateParsedGraph(parsed, existing);
    const warn = result.issues.find(
      (i) => i.severity === "warning" && i.message.includes("already exists")
    );
    expect(warn).toBeDefined();
  });

  it("warns about unknown category", () => {
    const parsed = makeParsed({
      nodes: [{ id: "n1", category: "alien_tech" }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    const warn = result.issues.find(
      (i) => i.severity === "warning" && i.message.includes("Unknown category")
    );
    expect(warn).toBeDefined();
  });

  it("adds info issue when omegaFragility is missing", () => {
    const parsed = makeParsed({ nodes: [{ id: "n1" }] });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    const info = result.issues.find(
      (i) => i.severity === "info" && i.message.includes("Ω-Fragility")
    );
    expect(info).toBeDefined();
  });

  it("flags duplicate edge IDs as errors", () => {
    const parsed = makeParsed({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e1", source: "b", target: "a" },
      ],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("Duplicate edge"))).toBe(true);
  });

  it("flags edges with missing source as error", () => {
    const parsed = makeParsed({
      nodes: [{ id: "a" }],
      edges: [{ id: "e1", target: "a" }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("no source"))).toBe(true);
  });

  it("flags edges referencing unknown source as error", () => {
    const parsed = makeParsed({
      nodes: [{ id: "a" }],
      edges: [{ id: "e1", source: "missing", target: "a" }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("unknown source"))).toBe(true);
  });

  it("flags edges referencing unknown target as error", () => {
    const parsed = makeParsed({
      nodes: [{ id: "a" }],
      edges: [{ id: "e1", source: "a", target: "missing" }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.valid).toBe(false);
  });

  it("warns about weight outside [0,1]", () => {
    const parsed = makeParsed({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "e1", source: "a", target: "b", weight: 1.5 }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.issues.some((i) => i.message.includes("Weight") && i.message.includes("clamped"))).toBe(true);
  });

  it("warns about confidence outside [0,1]", () => {
    const parsed = makeParsed({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "e1", source: "a", target: "b", confidence: -0.5 }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.issues.some((i) => i.message.includes("Confidence"))).toBe(true);
  });

  it("resolves nodes with defaults applied", () => {
    const parsed = makeParsed({
      nodes: [{ id: "n1" }],
    });
    const result = validateParsedGraph(parsed, EMPTY_EXISTING);
    expect(result.resolvedNodes[0].category).toBe("infrastructure"); // default
    // After enrichment: sole node gets I=7, R=5, J=3, C=2, T=5 → composite≈4.5
    expect(result.resolvedNodes[0].omegaFragility.composite).toBe(4.5);
  });

  it("allows edges referencing nodes from existing graph", () => {
    const existing = makeGraph([makeNode({ id: "a" })], []);
    const parsed = makeParsed({
      nodes: [{ id: "b" }],
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    const result = validateParsedGraph(parsed, existing);
    // Should not have referential integrity error since 'a' exists in graph
    const sourceErr = result.issues.find(
      (i) => i.severity === "error" && i.field === "source"
    );
    expect(sourceErr).toBeUndefined();
  });
});
