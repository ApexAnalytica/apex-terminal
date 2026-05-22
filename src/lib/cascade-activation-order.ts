// ─── Cascade activation order ────────────────────────────────────
//
// Given the snapshot array a cascade simulation produces, returns a
// 1-indexed ordinal per node indicating *the order in which it first
// activated*. This is the data driving the small "1, 2, 3, …" badges
// that float over nodes on the canvas during replay — analysts watch
// the sequence to see how a shock propagates through the graph.
//
// Honest framing
// --------------
// "Activation" is the simulator's binary `isActivated` flag, which is
// set when a node's `shockIntensity` rises above ~0.001 (see
// `cascade-simulator.ts:runEpoch`). It captures the moment a node
// joined the cascade, not the moment of any particular Ω threshold.
// Two cards may both be "activated" while having very different Ω
// trajectories — the badge tells you about *propagation order*, not
// *severity*. Severity reads from the orb size + colour as before.
//
// Determinism
// -----------
// Ties (multiple nodes flipping isActivated in the same epoch) are
// broken by node id (ASCII lexicographic). This is the same rule the
// graph data uses for stable iteration; downstream UI doesn't reorder
// across renders.
//
// Cutoff
// ------
// `upToEpoch` clamps the search window — useful when the user is
// scrubbing the TimeDial backwards. Only nodes that have activated by
// `epochs[upToEpoch]` get an ordinal; later activations are hidden so
// the badges always reflect the *currently-visible* state of the
// cascade, not the full eventual one.

import type { EpochSnapshot } from "./types";

/**
 * Map of nodeId → 1-indexed ordinal. Nodes that never activated
 * (or that activate after `upToEpoch`) are absent from the map —
 * callers should treat absence as "no badge."
 */
export function cascadeActivationOrder(
  epochs: ReadonlyArray<EpochSnapshot>,
  upToEpoch: number,
): Map<string, number> {
  if (epochs.length === 0 || upToEpoch < 0) return new Map();
  const cutoff = Math.min(upToEpoch, epochs.length - 1);

  // Pass 1 — first activation epoch per node.
  const firstActivation = new Map<string, number>();
  for (let e = 0; e <= cutoff; e++) {
    const states = epochs[e].nodeStates;
    for (const nodeId in states) {
      if (!Object.prototype.hasOwnProperty.call(states, nodeId)) continue;
      if (firstActivation.has(nodeId)) continue;
      if (states[nodeId].isActivated) firstActivation.set(nodeId, e);
    }
  }

  // Pass 2 — sort by (epoch ASC, nodeId ASC) and assign 1-indexed
  // ordinals. The id tiebreaker keeps the output stable across renders
  // even when the underlying snapshot iteration order varies.
  const entries = [...firstActivation.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  const out = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    out.set(entries[i][0], i + 1);
  }
  return out;
}
