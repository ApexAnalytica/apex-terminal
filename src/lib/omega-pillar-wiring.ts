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
import { detectCommunities } from "@/lib/community-detection";

const J_BUMP_PER_PROGRAM = 0.4; // each active OFAC program lifts J by 0.4
const J_BUMP_CAP = 4.0; // ceiling on the total J adjustment from live sanctions
const C_HIGH_OUT_DEGREE_THRESHOLD = 5; // out-degree above this is "amplifier-shaped"
const C_BUMP_PER_DEGREE = 0.3; // each out-edge above the threshold lifts C by 0.3
const C_BUMP_CAP = 3.0;
// Cross-community amplifier — a hub bridging communities is a stronger
// cascade signal than a hub serving its own community. Each cross-
// community out-edge adds 0.4; capped at +2.0 amplifier alone; total
// (base + amplifier) still capped at C_BUMP_CAP = 3.0.
const C_CROSS_COMMUNITY_BUMP_PER_EDGE = 0.4;
const C_CROSS_COMMUNITY_BUMP_CAP = 2.0;

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
 * graph. Two components:
 *
 *   1. Base bump from raw out-degree (high out-degree → cascade-prone).
 *   2. Cross-community amplifier from the share of out-edges that
 *      cross community boundaries (a hub bridging communities is more
 *      cascade-prone than a hub serving its own community).
 *
 * Communities are computed via Louvain phase 1 on the live graph
 * topology (`detectCommunities`). The base bump uses the existing
 * out-degree threshold; the amplifier adds 0.4 per cross-community
 * out-edge, capped at +2.0. The total (base + amplifier) is still
 * capped at C_BUMP_CAP = 3.0.
 */
export function computeCascadeLoadDelta(
  node: CausalNode,
  graph: CausalGraph,
): { delta: number; source: string } {
  let outDegree = 0;
  let crossCommunityOut = 0;
  const membership = detectCommunities(graph.nodes, graph.edges).membership;
  const ownCommunity = membership.get(node.id);
  for (const e of graph.edges) {
    if (e.source !== node.id) continue;
    outDegree += 1;
    if (ownCommunity !== undefined && membership.get(e.target) !== ownCommunity) {
      crossCommunityOut += 1;
    }
  }
  return composeCDelta(outDegree, crossCommunityOut);
}

/**
 * Walk a graph and return new nodes with `liveAdjustments` set. Existing
 * `omegaFragility` is untouched — adjustments are an overlay. When a node
 * has zero deltas in both pillars, `liveAdjustments` is left undefined so
 * downstream code can quickly skip nodes with no live overlay.
 */
export function applyOmegaLiveAdjustments(graph: CausalGraph): CausalGraph {
  // Pre-compute out-degree once instead of doing
  // `graph.edges.filter(e => e.source === node.id)` inside
  // `computeCascadeLoadDelta` for each node — that pattern was O(N×E).
  // For a 200-node × 300-edge graph it's 60k ops, fine; for a 500-node
  // CROSS-DOMAIN selection it's 400k synchronous ops on the launch path
  // and the user reports the page freezing right after LAUNCH WORKSPACE.
  // Building a Map<sourceId, count> first drops it to O(N + E).
  const outDegreeBy = new Map<string, number>();
  const crossCommunityOutBy = new Map<string, number>();
  const membership =
    graph.edges.length > 0
      ? detectCommunities(graph.nodes, graph.edges).membership
      : new Map<string, string>();
  for (const e of graph.edges) {
    outDegreeBy.set(e.source, (outDegreeBy.get(e.source) ?? 0) + 1);
    const sourceComm = membership.get(e.source);
    const targetComm = membership.get(e.target);
    if (
      sourceComm !== undefined &&
      targetComm !== undefined &&
      sourceComm !== targetComm
    ) {
      crossCommunityOutBy.set(
        e.source,
        (crossCommunityOutBy.get(e.source) ?? 0) + 1,
      );
    }
  }
  const nodes = graph.nodes.map((n) => {
    const j = computeJurisdictionalHazardDelta(n);
    const c = composeCDelta(
      outDegreeBy.get(n.id) ?? 0,
      crossCommunityOutBy.get(n.id) ?? 0,
    );
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
 * Compose the cascade-load delta from pre-computed out-degree and
 * cross-community out-degree counts. Internal variant of
 * `computeCascadeLoadDelta` shared between the per-node and graph-walk
 * paths so the formula and source-string format stay consistent.
 *
 * Returns delta = 0 when both signals are below their respective
 * thresholds. Source string attributes the contributing components.
 */
function composeCDelta(
  outDegree: number,
  crossCommunityOut: number,
): { delta: number; source: string } {
  const excess = Math.max(0, outDegree - C_HIGH_OUT_DEGREE_THRESHOLD);
  const baseBump = Math.min(C_BUMP_CAP, excess * C_BUMP_PER_DEGREE);
  const amplifier = Math.min(
    C_CROSS_COMMUNITY_BUMP_CAP,
    crossCommunityOut * C_CROSS_COMMUNITY_BUMP_PER_EDGE,
  );
  const total = Math.min(C_BUMP_CAP, baseBump + amplifier);
  if (total === 0) return { delta: 0, source: "" };
  const parts: string[] = [];
  if (baseBump > 0) {
    parts.push(`out-degree ${outDegree} (${excess} above structural median)`);
  }
  if (amplifier > 0) {
    parts.push(
      `${crossCommunityOut} cross-community out-edge${crossCommunityOut === 1 ? "" : "s"}`,
    );
  }
  return {
    delta: round1(total),
    source: `+${round1(total)} from ${parts.join(", ")}`,
  };
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
