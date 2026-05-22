import { describe, it, expect } from "vitest";
import { cascadeActivationOrder } from "../cascade-activation-order";
import type { EpochSnapshot, NodeEpochState } from "../types";

// ─── Test fixtures ──────────────────────────────────────────────

/**
 * Build a minimal snapshot per epoch. `activated` is the set of node
 * ids that should have `isActivated: true` at that epoch. All other
 * node-state fields are stubbed — the util only reads `isActivated`.
 */
function snapshot(epoch: number, activated: string[]): EpochSnapshot {
  const nodeStates: Record<string, NodeEpochState> = {};
  for (const id of activated) {
    nodeStates[id] = {
      omegaComposite: 5,
      omegaProfile: {
        composite: 5,
        irreplaceability: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 5,
        cascadeLoad: 5,
        tailDepth: 5,
      },
      shockIntensity: 0.5,
      isActivated: true,
    };
  }
  return {
    epoch,
    nodeStates,
    edgeStates: {},
    omegaBuffer: 80,
    omegaStatus: "NOMINAL",
    criticalityEstimate: null,
    isStable: false,
    isCritical: false,
  };
}

describe("cascadeActivationOrder", () => {
  it("returns an empty map for an empty snapshot array", () => {
    const out = cascadeActivationOrder([], 100);
    expect(out.size).toBe(0);
  });

  it("returns an empty map when upToEpoch is negative", () => {
    const epochs = [snapshot(0, ["A", "B"])];
    expect(cascadeActivationOrder(epochs, -1).size).toBe(0);
  });

  it("returns ordinals in activation order (single-epoch baseline)", () => {
    // A and B both activate at epoch 0 — tied epoch, tiebreak by id.
    // A < B lexicographically → A gets ordinal 1, B gets 2.
    const epochs = [snapshot(0, ["B", "A"])];
    const out = cascadeActivationOrder(epochs, 0);
    expect(out.get("A")).toBe(1);
    expect(out.get("B")).toBe(2);
    expect(out.size).toBe(2);
  });

  it("orders across epochs by first-activation epoch", () => {
    // A activates at epoch 0; B at epoch 1; C at epoch 2. Ordering
    // follows the cascade timeline, not lexicographic order.
    const epochs = [
      snapshot(0, ["A"]),
      snapshot(1, ["A", "B"]),
      snapshot(2, ["A", "B", "C"]),
    ];
    const out = cascadeActivationOrder(epochs, 2);
    expect(out.get("A")).toBe(1);
    expect(out.get("B")).toBe(2);
    expect(out.get("C")).toBe(3);
  });

  it("breaks within-epoch ties by node id (deterministic)", () => {
    // Three nodes flip at epoch 1 simultaneously. Tie-break by id:
    // ASCII order Z < a < b (capitals sort before lowercase). Map
    // entries are in insertion order.
    const epochs = [
      snapshot(0, []),
      snapshot(1, ["b", "Z", "a"]),
    ];
    const out = cascadeActivationOrder(epochs, 1);
    expect(out.get("Z")).toBe(1);
    expect(out.get("a")).toBe(2);
    expect(out.get("b")).toBe(3);
  });

  it("honours the upToEpoch cutoff (hides later activations)", () => {
    // C only activates at epoch 2 — hidden when we ask for up to epoch 1.
    const epochs = [
      snapshot(0, ["A"]),
      snapshot(1, ["A", "B"]),
      snapshot(2, ["A", "B", "C"]),
    ];
    const out = cascadeActivationOrder(epochs, 1);
    expect(out.get("A")).toBe(1);
    expect(out.get("B")).toBe(2);
    expect(out.has("C")).toBe(false);
    expect(out.size).toBe(2);
  });

  it("clamps upToEpoch beyond the end of the snapshot array", () => {
    const epochs = [snapshot(0, ["A"]), snapshot(1, ["A", "B"])];
    const out = cascadeActivationOrder(epochs, 99);
    expect(out.get("A")).toBe(1);
    expect(out.get("B")).toBe(2);
  });

  it("ignores nodes that appear in nodeStates but never set isActivated", () => {
    // Build a snapshot where some node-states have isActivated=false.
    const inactive: EpochSnapshot = {
      epoch: 0,
      nodeStates: {
        A: {
          omegaComposite: 5,
          omegaProfile: {
            composite: 5,
            irreplaceability: 5,
            restorationLatency: 5,
            jurisdictionalHazard: 5,
            cascadeLoad: 5,
            tailDepth: 5,
          },
          shockIntensity: 0,
          isActivated: false,
        },
      },
      edgeStates: {},
      omegaBuffer: 100,
      omegaStatus: "NOMINAL",
      criticalityEstimate: null,
      isStable: true,
      isCritical: false,
    };
    const out = cascadeActivationOrder([inactive], 0);
    expect(out.size).toBe(0);
  });

  it("preserves first-activation epoch even if a node deactivates later", () => {
    // A activates at 0, deactivates at 1, reactivates at 2.
    // First-activation rule: still epoch 0 (we don't re-rank on re-activation).
    const epochs = [
      snapshot(0, ["A"]),
      snapshot(1, []),
      snapshot(2, ["A", "B"]),
    ];
    const out = cascadeActivationOrder(epochs, 2);
    expect(out.get("A")).toBe(1);
    expect(out.get("B")).toBe(2);
  });
});
