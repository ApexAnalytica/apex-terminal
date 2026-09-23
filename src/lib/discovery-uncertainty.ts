import type { CausalNode, CausalEdge } from "./types";

// ─── Discovery Uncertainty Aggregation ──────────────────────────
//
// Owner: SPIRTES session.
//
// Aggregates per-edge confidence and per-node discovery source into a
// graph-level uncertainty summary. The right panel surfaces this so a
// user can see at a glance how much of the discovered structure is
// triangulated (multiple algorithms agree → "merged") vs. single-source.
//
// Edge confidence is the per-edge signal SPIRTES outputs alongside each
// discovered edge. Node `discoverySource` is the algorithm that surfaced
// the node into the active graph: "merged" means multiple algorithms
// agreed; "DCD" / "PCMCI+" / "FCI" are single-source. The Tarski A-06
// axiom thresholds confidence at 0.7, so we report `lowConfidence`
// using the same cutoff for consistency.

export interface DiscoveryUncertaintySummary {
  edgeCount: number;
  meanEdgeConfidence: number;
  medianEdgeConfidence: number;
  lowConfidenceCount: number;
  lowConfidenceFraction: number;
  sourceBreakdown: {
    DCD: number;
    PCMCI: number;
    FCI: number;
    merged: number;
    other: number;
  };
  mergedFraction: number;
  singleSourceFraction: number;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function summarizeDiscoveryUncertainty(
  nodes: CausalNode[],
  edges: CausalEdge[],
): DiscoveryUncertaintySummary {

  const confidences = edges
    .map((e) => e.confidence)
    .filter((c): c is number => Number.isFinite(c));

  const meanEdgeConfidence =
    confidences.length === 0
      ? 0
      : confidences.reduce((s, c) => s + c, 0) / confidences.length;

  const medianEdgeConfidence = computeMedian(confidences);

  const lowConfidenceCount = confidences.filter(
    (c) => c < LOW_CONFIDENCE_THRESHOLD,
  ).length;
  const lowConfidenceFraction =
    confidences.length === 0 ? 0 : lowConfidenceCount / confidences.length;

  const breakdown = { DCD: 0, PCMCI: 0, FCI: 0, merged: 0, other: 0 };
  nodes.forEach((n) => {
    switch (n.discoverySource) {
      case "DCD":
        breakdown.DCD += 1;
        break;
      case "PCMCI+":
        breakdown.PCMCI += 1;
        break;
      case "FCI":
        breakdown.FCI += 1;
        break;
      case "merged":
        breakdown.merged += 1;
        break;
      default:
        breakdown.other += 1;
    }
  });

  const totalNodes = nodes.length;
  const mergedFraction = totalNodes === 0 ? 0 : breakdown.merged / totalNodes;
  const singleSourceFraction =
    totalNodes === 0
      ? 0
      : (breakdown.DCD + breakdown.PCMCI + breakdown.FCI) / totalNodes;

  return {
    edgeCount: edges.length,
    meanEdgeConfidence,
    medianEdgeConfidence,
    lowConfidenceCount,
    lowConfidenceFraction,
    sourceBreakdown: breakdown,
    mergedFraction,
    singleSourceFraction,
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
