// Lightweight Tarski helpers — extracted from `tarski-data.ts` so the
// `useApexStore` (eagerly imported by every page surface) can reference
// the `TarskiValidationReport` type and the two pure graph transforms
// without dragging the 891-LOC AXIOM_LIBRARY + 800-LOC validation engine
// into the critical-path bundle. The heavy `runTarskiValidation` stays
// in `tarski-data.ts` and is dynamic-imported at the few sites that
// actually need to run validation.

import type { CausalGraph, ProofTrace } from "./types";

export interface TarskiValidationReport {
  inconsistentEdgeIds: Set<string>;
  restrictedNodeIds: Set<string>;
  proofTraces: ProofTrace[];
  totalViolations: number;
}

// Apply flags from a validation report to a graph. Returns a new graph
// with `isInconsistent` / `isRestricted` flags set and the metadata's
// `verificationStatus` updated accordingly.
export function applyTarskiFlags(
  graph: CausalGraph,
  report: TarskiValidationReport,
): CausalGraph {
  const nodes = graph.nodes.map((n) => ({
    ...n,
    isRestricted: report.restrictedNodeIds.has(n.id),
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    isInconsistent: report.inconsistentEdgeIds.has(e.id),
  }));

  const inconsistentEdges = edges.filter((e) => e.isInconsistent).length;
  const restrictedNodes = nodes.filter((n) => n.isRestricted).length;

  return {
    nodes,
    edges,
    metadata: {
      ...graph.metadata,
      inconsistentEdges,
      restrictedNodes,
      verificationStatus: inconsistentEdges > 0 || restrictedNodes > 0
        ? "INCONSISTENCIES_FOUND"
        : "VERIFIED",
    },
  };
}

// Reset all Tarski flags on a graph (back to RAW).
export function clearTarskiFlags(graph: CausalGraph): CausalGraph {
  const nodes = graph.nodes.map((n) => ({
    ...n,
    isRestricted: false,
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    isInconsistent: false,
  }));

  return {
    nodes,
    edges,
    metadata: {
      ...graph.metadata,
      inconsistentEdges: 0,
      restrictedNodes: 0,
      verificationStatus: "UNVERIFIED" as const,
    },
  };
}
