// System-level Ω-Fragility — the aggregation layer above per-node ΩF.
//
// Node ΩF (omegaFragility.composite) answers "how fragile is THIS node?".
// The system layer answers "how fragile is the NETWORK?" via two weighted
// aggregations the platform's `/framework` page advertises but that, until
// now, had no implementation (the `OmegaSystemFragility` interface in
// types.ts was declared and never constructed/read):
//
//   ΩSF — throughput-weighted fragility: Σ(αᵢ·ΩFᵢ)/Σαᵢ. "Where the load
//         actually flows, how fragile is it?" αᵢ is live throughput
//         utilization where a feed is attached, else the cascadeLoad pillar
//         (the topological throughput proxy) so every node contributes.
//
//   ΩSX — exposure-weighted fragility: Σ(eᵢ·ΩFᵢ)/Σeᵢ. "Weighted by how
//         exposed/concentrated each node is, how fragile is the system?"
//         eᵢ is geographic/market concentration (globalConcentration share),
//         chosen because it has full node coverage AND is orthogonal to αᵢ —
//         so ΩSX measures something ΩSF doesn't, rather than re-weighting the
//         same signal.
//
// Both are weighted means on the same 0–10 scale as node composites, so they
// sit naturally beside avg/max ΩF in the CD-Ω monitor.

import type { CausalGraph, CausalNode, OmegaSystemFragility } from "./types";
import { getLiveSignal } from "./types";

/** Composite at/above this is "in the loss zone" — counted by contagionRadius. */
export const LOSS_THRESHOLD = 7.0;
/** Headroom scale for bufferHorizon (epochs). Matches the geopolitical
 *  relevance-reference horizon ("node-critical event within next 50 epochs"). */
export const MAX_BUFFER_EPOCHS = 50;
/** Floor so a node with zero throughput/exposure still contributes a sliver
 *  rather than dropping out of the weighted mean entirely. */
const MIN_WEIGHT = 0.05;

/**
 * αᵢ — throughput weight. Live throughput utilization (value/capacity, e.g.
 * EIA Hormuz) where a feed is attached; otherwise the cascadeLoad pillar
 * (downstream-impact depth — the topological throughput proxy) normalised to
 * 0–1, so coverage is total even though live throughput is sparse.
 */
export function throughputWeight(node: CausalNode): number {
  const sig = getLiveSignal(node, "throughput");
  if (sig && sig.capacity > 0) {
    return Math.max(MIN_WEIGHT, Math.min(1, sig.value / sig.capacity));
  }
  return Math.max(MIN_WEIGHT, Math.min(1, node.omegaFragility.cascadeLoad / 10));
}

/**
 * eᵢ — exposure weight = geographic/market concentration share parsed from
 * `globalConcentration` ("100% Saudi Arabia" → 1.0, "93% China" → 0.93).
 * Unparseable strings fall back to a neutral 0.5 (unknown exposure), except
 * explicit single-source phrasing → 1.0. Floored so every node contributes.
 */
export function exposureWeight(node: CausalNode): number {
  const gc = node.globalConcentration?.toLowerCase() ?? "";
  const pct = gc.match(/(\d+)%/);
  let e: number;
  if (pct) {
    e = parseInt(pct[1], 10) / 100;
  } else if (gc.includes("single-source") || gc.includes("single source")) {
    e = 1;
  } else {
    e = 0.5;
  }
  return Math.max(MIN_WEIGHT, Math.min(1, e));
}

/** Weighted mean of node composites under a per-node weight fn, rounded to
 *  one decimal (matching the composite scale). Returns 0 for no weight. */
function weightedMeanComposite(
  nodes: CausalNode[],
  weightFn: (n: CausalNode) => number,
): number {
  let num = 0;
  let den = 0;
  for (const n of nodes) {
    const w = weightFn(n);
    num += w * n.omegaFragility.composite;
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : 0;
}

/**
 * Compute the system-level ΩF object for a graph. Pure + side-effect free —
 * the CD-Ω monitor calls this per graph reference (memoised).
 */
export function computeSystemFragility(graph: CausalGraph): OmegaSystemFragility {
  const nodes = graph.nodes;
  if (nodes.length === 0) {
    return { omegaSF: 0, omegaSX: 0, contagionRadius: 0, bufferHorizon: MAX_BUFFER_EPOCHS };
  }

  const omegaSF = weightedMeanComposite(nodes, throughputWeight);
  const omegaSX = weightedMeanComposite(nodes, exposureWeight);

  // contagionRadius: how many nodes sit in the loss zone (composite ≥ threshold)
  // — the count of "critical" nodes a system-wide shock would light up.
  const contagionRadius = nodes.filter(
    (n) => n.omegaFragility.composite >= LOSS_THRESHOLD,
  ).length;

  // bufferHorizon: epochs of headroom before systemic failure, scaled by how
  // far ΩSF sits below the 0–10 ceiling. Higher system fragility → fewer epochs.
  const bufferHorizon = Math.max(
    1,
    Math.round((MAX_BUFFER_EPOCHS * (10 - omegaSF)) / 10),
  );

  return { omegaSF, omegaSX, contagionRadius, bufferHorizon };
}
