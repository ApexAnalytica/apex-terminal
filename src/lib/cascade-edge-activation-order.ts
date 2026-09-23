// ─── Cascade edge activation order ──────────────────────────────
//
// Sibling helper to `cascadeActivationOrder` (which produces per-node
// "1, 2, 3…" ordinals from PR #371). This one produces per-EDGE
// activation info so the 3D / 2D edge renderers can pulse the edge at
// the moment signal first crossed it during cascade propagation.
//
// Semantics — what counts as "the edge firing"
// --------------------------------------------
// An edge fires the moment its TARGET node first activates. That's
// the epoch in which signal crossed the edge to flip the target on.
// Choosing the target (not the source) means:
//   - At epoch t=0, the seed node activates. Its outgoing edges have
//     NOT fired yet (no downstream lit up).
//   - At epoch t=1, signal flows seed → next; the edge fires AT t=1.
//   - At epoch t=2, the next layer fires.
//
// This makes the visual cascade-of-fires read as "the signal walking
// outward from the seed", which matches what an analyst expects from
// the propagation order — and it pairs cleanly with the existing node
// activation badges (a node's badge appears at the same epoch its
// incoming edge fires).
//
// Edges whose target never activates (or activates after `upToEpoch`)
// are absent from the returned map — callers should treat absence as
// "this edge never fired in the visible cascade window."
//
// Determinism
// -----------
// Ties (multiple edges firing in the same epoch) are broken by
// `(targetId ASC, edgeId ASC)`. The target tiebreak keeps the ordering
// consistent with `cascadeActivationOrder` (which uses node id as the
// tiebreak), so edges firing into nodes with smaller ids show up
// before edges firing into nodes with larger ids when they all fire
// in the same epoch.

import type { CausalEdge, EpochSnapshot } from "./types";

/**
 * Per-edge activation info — populated only for edges that fired by
 * `upToEpoch`. The `ordinal` field is 1-indexed firing order across the
 * visible cascade; the `activationEpoch` is the literal epoch at which
 * the target node first activated (which is when this edge fired).
 *
 * The renderer uses `activationEpoch` to compute a "fire phase" — how
 * far the current replay position is from when this edge lit up — so
 * it can pulse the edge for a brief window after activation.
 */
export interface EdgeActivationInfo {
  /** 1-indexed firing order across all visible-cascade edges. */
  ordinal: number;
  /** Epoch the edge fired at (= target's first-activation epoch). */
  activationEpoch: number;
}

/**
 * Compute the per-edge firing order + activation epoch.
 *
 * Both `cascadeActivationOrder` and this helper iterate the snapshot
 * array once, so calling both at the canvas level is O(2 × epochs ×
 * nodes) — well within budget for the 192-node demo at 60fps.
 *
 * Edge cases:
 *  - Empty `epochs` or negative `upToEpoch` → empty map
 *  - `upToEpoch` past the end → clamped to `epochs.length - 1`
 *  - Edge whose source / target never appears in any snapshot → absent
 *  - Edge whose target activates but `isSevered` was set → still included.
 *    Whether to suppress severed edges visually is a renderer decision,
 *    not a data one. The helper returns the *historical* firing order
 *    in case the renderer wants to show a dimmed fire pulse for cuts
 *    the analyst just applied (the demo loop's "apply cuts → watch
 *    the would-have-fired edges go dark" use case).
 */
export function cascadeEdgeActivationOrder(
  edges: ReadonlyArray<CausalEdge>,
  epochs: ReadonlyArray<EpochSnapshot>,
  upToEpoch: number,
): Map<string, EdgeActivationInfo> {
  if (epochs.length === 0 || upToEpoch < 0 || edges.length === 0) {
    return new Map();
  }
  const cutoff = Math.min(upToEpoch, epochs.length - 1);

  // Pass 1 — first activation epoch per node (same scan
  // `cascadeActivationOrder` does, repeated here so callers can use
  // either helper independently without coupling internals).
  const firstActivation = new Map<string, number>();
  for (let e = 0; e <= cutoff; e++) {
    const states = epochs[e].nodeStates;
    for (const nodeId in states) {
      if (!Object.prototype.hasOwnProperty.call(states, nodeId)) continue;
      if (firstActivation.has(nodeId)) continue;
      if (states[nodeId].isActivated) firstActivation.set(nodeId, e);
    }
  }

  // Pass 2 — derive each edge's firing epoch from its target's
  // activation. Edges whose target never activated are skipped.
  type EdgeEntry = {
    edgeId: string;
    targetId: string;
    activationEpoch: number;
  };
  const entries: EdgeEntry[] = [];
  for (const edge of edges) {
    const targetEpoch = firstActivation.get(edge.target);
    if (targetEpoch === undefined) continue;
    entries.push({
      edgeId: edge.id,
      targetId: edge.target,
      activationEpoch: targetEpoch,
    });
  }

  // Pass 3 — sort by (epoch ASC, targetId ASC, edgeId ASC) and assign
  // 1-indexed ordinals. The targetId tiebreak mirrors how
  // `cascadeActivationOrder` orders nodes within an epoch, so a node
  // with badge #N has its incoming edges grouped together in the edge
  // ordering. The edgeId tiebreak handles the multi-incoming-edge case
  // deterministically.
  entries.sort((a, b) => {
    if (a.activationEpoch !== b.activationEpoch) {
      return a.activationEpoch - b.activationEpoch;
    }
    if (a.targetId !== b.targetId) {
      return a.targetId < b.targetId ? -1 : 1;
    }
    return a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0;
  });

  const out = new Map<string, EdgeActivationInfo>();
  for (let i = 0; i < entries.length; i++) {
    out.set(entries[i].edgeId, {
      ordinal: i + 1,
      activationEpoch: entries[i].activationEpoch,
    });
  }
  return out;
}

/**
 * Compute the "fire phase" intensity for an edge — how brightly it
 * should pulse at the current replay epoch, given when it activated.
 *
 * Returns:
 *   1.0 at the exact activation epoch
 *   ~0.5 one epoch before/after
 *   0.0 outside the [activationEpoch - 1, activationEpoch + windowEpochs] band
 *
 * Asymmetric window: one epoch of lead-in (so the pulse appears
 * naturally as the signal arrives) and `windowEpochs` of decay
 * afterward (so the analyst has time to register the fire before it
 * fades to the continuous-flow signal the edge already carries).
 *
 * Designed to be called per-frame in the renderer's `useFrame`, so
 * it's purely a math helper — no allocations, no state. The cost is
 * a few comparisons + a subtraction + a divide.
 */
export function edgeFireIntensity(
  activationEpoch: number,
  currentEpoch: number,
  windowEpochs: number = 3,
): number {
  if (windowEpochs <= 0) return currentEpoch === activationEpoch ? 1 : 0;
  const delta = currentEpoch - activationEpoch;
  if (delta < -1) return 0;
  if (delta > windowEpochs) return 0;
  if (delta < 0) {
    // Lead-in: -1 < delta < 0 maps to 0 → 1 (but delta is integer in
    // the discrete-epoch case, so this only fires when delta === -1 →
    // returns 0.5). Kept fractional in case a future caller passes a
    // continuous epoch (scrub interpolation).
    return Math.max(0, 1 + delta);
  }
  // Decay: 0 ≤ delta ≤ windowEpochs maps to 1 → 0.
  return Math.max(0, 1 - delta / windowEpochs);
}
