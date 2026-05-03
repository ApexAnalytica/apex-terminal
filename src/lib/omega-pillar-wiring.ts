/**
 * Engine-side ΩF pillar wiring — computes live deltas on top of each
 * node's static `omegaFragility` profile so the baseline stays auditable.
 *
 * Two wires are implemented per the session brief:
 *
 *   1. Tarski → J (jurisdictionalHazard)
 *      Live sanctions on a node (`liveData[].kind === "sanctions"`) elevate
 *      the J pillar. The delta is proportional to the program count,
 *      capped so live sanctions can't push J past 10.
 *
 *   2. Spirtes (network metrics) → C (cascadeLoad)
 *      Out-degree above the structural median elevates the C pillar — a
 *      cheap proxy for "this node propagates to many downstream targets."
 *      Eigenvector centrality would be a fuller signal but is expensive
 *      to compute on the hot path; out-degree is the same shape, just
 *      coarser.
 *
 * Both wires are ADDITIVE OVERLAYS — they never mutate `omegaFragility`.
 * Consumers (ΩF radar, copilot, hover) can render the static profile, the
 * adjusted total (`composite + jDelta + cDelta`), or the breakdown.
 */
import type {
  CausalGraph,
  CausalNode,
  OmegaLiveAdjustments,
} from "@/lib/types";

const J_BUMP_PER_PROGRAM = 0.4; // each active OFAC program lifts J by 0.4
const J_BUMP_CAP = 4.0; // ceiling on the total J adjustment from live sanctions
const C_HIGH_OUT_DEGREE_THRESHOLD = 5; // out-degree above this is "amplifier-shaped"
const C_BUMP_PER_DEGREE = 0.3; // each out-edge above the threshold lifts C by 0.3
const C_BUMP_CAP = 3.0;

/**
 * Compute the J-pillar adjustment for a node from its live `liveData[]`
 * sanctions signals. Returns 0 when no sanctions signal is present.
 */
export function computeJurisdictionalHazardDelta(
  node: CausalNode,
): { delta: number; source: string } {
  const sanctions = node.liveData?.find((p) => p.kind === "sanctions");
  if (!sanctions) return { delta: 0, source: "" };
  const programs = sanctions.value;
  if (!Number.isFinite(programs) || programs <= 0) {
    return { delta: 0, source: "" };
  }
  const delta = Math.min(J_BUMP_CAP, programs * J_BUMP_PER_PROGRAM);
  return {
    delta: round1(delta),
    source: `+${round1(delta)} from ${programs} active sanctions program${programs === 1 ? "" : "s"} (${sanctions.source.split(/[—(]/)[0].trim()})`,
  };
}

/**
 * Compute the C-pillar adjustment for a node from its position in the
 * graph (out-degree). High out-degree on the live graph means this node
 * propagates broadly downstream — adds to cascade load.
 */
export function computeCascadeLoadDelta(
  node: CausalNode,
  graph: CausalGraph,
): { delta: number; source: string } {
  const outDegree = graph.edges.filter((e) => e.source === node.id).length;
  if (outDegree <= C_HIGH_OUT_DEGREE_THRESHOLD) {
    return { delta: 0, source: "" };
  }
  const excess = outDegree - C_HIGH_OUT_DEGREE_THRESHOLD;
  const delta = Math.min(C_BUMP_CAP, excess * C_BUMP_PER_DEGREE);
  return {
    delta: round1(delta),
    source: `+${round1(delta)} from out-degree ${outDegree} (${excess} above structural median)`,
  };
}

/**
 * Walk a graph and return new nodes with `liveAdjustments` set. Existing
 * `omegaFragility` is untouched — adjustments are an overlay. When a node
 * has zero deltas in both pillars, `liveAdjustments` is left undefined so
 * downstream code can quickly skip nodes with no live overlay.
 */
export function applyOmegaLiveAdjustments(graph: CausalGraph): CausalGraph {
  const nodes = graph.nodes.map((n) => {
    const j = computeJurisdictionalHazardDelta(n);
    const c = computeCascadeLoadDelta(n, graph);
    if (j.delta === 0 && c.delta === 0) {
      // Strip any stale adjustment so a node that no longer carries live
      // signals doesn't keep showing yesterday's overlay.
      if (n.liveAdjustments) {
        const { liveAdjustments: _drop, ...rest } = n;
        void _drop;
        return rest as CausalNode;
      }
      return n;
    }
    const adjustments: OmegaLiveAdjustments = {};
    if (j.delta !== 0) {
      adjustments.jurisdictionalHazardDelta = j.delta;
      adjustments.jSource = j.source;
    }
    if (c.delta !== 0) {
      adjustments.cascadeLoadDelta = c.delta;
      adjustments.cSource = c.source;
    }
    return { ...n, liveAdjustments: adjustments };
  });
  return { ...graph, nodes };
}

/**
 * Compute the effective J + C values for a node by applying any
 * `liveAdjustments` overlay to the static profile. Returns the adjusted
 * pillar pair for downstream rendering / scoring.
 */
export function getEffectivePillars(node: CausalNode): {
  jurisdictionalHazard: number;
  cascadeLoad: number;
} {
  const baseJ = node.omegaFragility.jurisdictionalHazard;
  const baseC = node.omegaFragility.cascadeLoad;
  const jDelta = node.liveAdjustments?.jurisdictionalHazardDelta ?? 0;
  const cDelta = node.liveAdjustments?.cascadeLoadDelta ?? 0;
  return {
    jurisdictionalHazard: clamp(baseJ + jDelta, 0, 10),
    cascadeLoad: clamp(baseC + cDelta, 0, 10),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
