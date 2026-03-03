import { CausalGraph, NodeCategory, EdgeType } from "@/lib/types";
import { ParsedGraph, ValidationIssue, ValidationResult } from "./types";
import { applyNodeDefaults, applyEdgeDefaults } from "./defaults";

const VALID_CATEGORIES: Set<string> = new Set<NodeCategory>([
  "manufacturing",
  "infrastructure",
  "economic",
  "finance",
  "energy",
  "geopolitical",
  "communications",
  "agriculture",
]);

const VALID_EDGE_TYPES: Set<string> = new Set<EdgeType>([
  "directed",
  "confounded",
  "temporal",
]);

export function validateParsedGraph(
  parsed: ParsedGraph,
  existingGraph: CausalGraph
): ValidationResult {
  const issues: ValidationIssue[] = [];

  const existingNodeIds = new Set(existingGraph.nodes.map((n) => n.id));
  const existingEdgeIds = new Set(existingGraph.edges.map((e) => e.id));

  // Track parsed node IDs for edge reference checks
  const parsedNodeIds = new Set<string>();
  const seenNodeIds = new Set<string>();

  // ─── Validate nodes ──────────────────────────────────────────
  parsed.nodes.forEach((raw, i) => {
    const id = raw.id ?? `imported_node_${i}`;

    // Duplicate within file
    if (seenNodeIds.has(id)) {
      issues.push({
        severity: "error",
        row: i,
        entity: "node",
        field: "id",
        message: `Duplicate node ID "${id}" within import file`,
      });
    }
    seenNodeIds.add(id);
    parsedNodeIds.add(id);

    // Already in graph
    if (existingNodeIds.has(id)) {
      issues.push({
        severity: "warning",
        row: i,
        entity: "node",
        field: "id",
        message: `Node "${id}" already exists in graph — will be skipped`,
      });
    }

    // Invalid category
    if (raw.category && !VALID_CATEGORIES.has(raw.category)) {
      issues.push({
        severity: "warning",
        row: i,
        entity: "node",
        field: "category",
        message: `Unknown category "${raw.category}" — defaulting to "infrastructure"`,
      });
    }

    // No omega data
    if (!raw.omegaFragility || Object.keys(raw.omegaFragility).length === 0) {
      issues.push({
        severity: "info",
        row: i,
        entity: "node",
        field: "omegaFragility",
        message: `No Ω-Fragility data — midpoint defaults (5.0) will be applied`,
      });
    }
  });

  // ─── Validate edges ──────────────────────────────────────────
  const seenEdgeIds = new Set<string>();
  const allNodeIds = new Set([...existingNodeIds, ...parsedNodeIds]);

  parsed.edges.forEach((raw, i) => {
    const id = raw.id ?? `imported_edge_${i}`;

    // Duplicate within file
    if (seenEdgeIds.has(id)) {
      issues.push({
        severity: "error",
        row: i,
        entity: "edge",
        field: "id",
        message: `Duplicate edge ID "${id}" within import file`,
      });
    }
    seenEdgeIds.add(id);

    // Already in graph
    if (existingEdgeIds.has(id)) {
      issues.push({
        severity: "warning",
        row: i,
        entity: "edge",
        field: "id",
        message: `Edge "${id}" already exists in graph — will be skipped`,
      });
    }

    // Missing source/target
    if (!raw.source) {
      issues.push({
        severity: "error",
        row: i,
        entity: "edge",
        field: "source",
        message: `Edge "${id}" has no source node`,
      });
    } else if (!allNodeIds.has(raw.source)) {
      issues.push({
        severity: "error",
        row: i,
        entity: "edge",
        field: "source",
        message: `Edge "${id}" references unknown source "${raw.source}"`,
      });
    }

    if (!raw.target) {
      issues.push({
        severity: "error",
        row: i,
        entity: "edge",
        field: "target",
        message: `Edge "${id}" has no target node`,
      });
    } else if (!allNodeIds.has(raw.target)) {
      issues.push({
        severity: "error",
        row: i,
        entity: "edge",
        field: "target",
        message: `Edge "${id}" references unknown target "${raw.target}"`,
      });
    }

    // Invalid type
    if (raw.type && !VALID_EDGE_TYPES.has(raw.type)) {
      issues.push({
        severity: "warning",
        row: i,
        entity: "edge",
        field: "type",
        message: `Unknown edge type "${raw.type}" — defaulting to "directed"`,
      });
    }

    // Weight/confidence range
    if (raw.weight !== undefined && (raw.weight < 0 || raw.weight > 1)) {
      issues.push({
        severity: "warning",
        row: i,
        entity: "edge",
        field: "weight",
        message: `Weight ${raw.weight} outside [0,1] — will be clamped`,
      });
    }
    if (raw.confidence !== undefined && (raw.confidence < 0 || raw.confidence > 1)) {
      issues.push({
        severity: "warning",
        row: i,
        entity: "edge",
        field: "confidence",
        message: `Confidence ${raw.confidence} outside [0,1] — will be clamped`,
      });
    }
  });

  // ─── Summary info ────────────────────────────────────────────
  const defaultedNodeCount = parsed.nodes.filter(
    (n) => !n.omegaFragility || !n.category || !n.domain
  ).length;
  if (defaultedNodeCount > 0) {
    issues.push({
      severity: "info",
      row: -1,
      entity: "graph",
      message: `${defaultedNodeCount} node(s) will have default values applied for missing fields`,
    });
  }

  // ─── Apply defaults and produce resolved arrays ──────────────
  const resolvedNodes = parsed.nodes.map((raw, i) => applyNodeDefaults(raw, i));
  const resolvedEdges = parsed.edges.map((raw, i) => applyEdgeDefaults(raw, i));

  const hasErrors = issues.some((iss) => iss.severity === "error");

  return {
    valid: !hasErrors,
    issues,
    resolvedNodes,
    resolvedEdges,
  };
}
