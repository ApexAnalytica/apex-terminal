import { describe, expect, it } from "vitest";

import {
  cascadeEdgeActivationOrder,
  edgeFireIntensity,
} from "@/lib/cascade-edge-activation-order";
import type {
  CausalEdge,
  EpochSnapshot,
  NodeEpochState,
} from "@/lib/types";

// ─── Fixtures ─────────────────────────────────────────────────────

function edge(id: string, source: string, target: string): CausalEdge {
  return {
    id,
    source,
    target,
    weight: 0.5,
    lag: 0,
    type: "directed",
    confidence: 0.5,
    isInconsistent: false,
    physicalMechanism: "",
  };
}

function nodeState(isActivated: boolean): NodeEpochState {
  return {
    shockIntensity: isActivated ? 0.5 : 0,
    isActivated,
    omegaComposite: 5,
    omegaProfile: {
      composite: 5,
      irreplaceability: 5,
      restorationLatency: 5,
      jurisdictionalHazard: 5,
      cascadeLoad: 5,
      tailDepth: 5,
    },
  };
}

function snapshot(
  activatedIds: string[],
  allNodeIds: string[],
  epochIndex: number = 0,
): EpochSnapshot {
  const states: Record<string, NodeEpochState> = {};
  const activated = new Set(activatedIds);
  for (const id of allNodeIds) {
    states[id] = nodeState(activated.has(id));
  }
  return {
    epoch: epochIndex,
    nodeStates: states,
    edgeStates: {},
    omegaBuffer: 100,
    omegaStatus: "NOMINAL",
    isCritical: false,
    isStable: true,
    criticalityEstimate: null,
  };
}

// ─── cascadeEdgeActivationOrder ──────────────────────────────────

describe("cascadeEdgeActivationOrder", () => {
  it("returns empty map for empty inputs", () => {
    expect(cascadeEdgeActivationOrder([], [], 0).size).toBe(0);
    expect(
      cascadeEdgeActivationOrder([edge("e1", "a", "b")], [], 0).size,
    ).toBe(0);
    expect(
      cascadeEdgeActivationOrder([], [snapshot([], ["a"])], 0).size,
    ).toBe(0);
  });

  it("returns empty map for negative upToEpoch", () => {
    const result = cascadeEdgeActivationOrder(
      [edge("e1", "a", "b")],
      [snapshot(["a", "b"], ["a", "b"])],
      -1,
    );
    expect(result.size).toBe(0);
  });

  it("orders edges by their target's first-activation epoch", () => {
    const edges = [
      edge("e_ab", "a", "b"),
      edge("e_bc", "b", "c"),
      edge("e_cd", "c", "d"),
    ];
    const epochs: EpochSnapshot[] = [
      snapshot(["a"], ["a", "b", "c", "d"]),               // t=0: seed a
      snapshot(["a", "b"], ["a", "b", "c", "d"]),          // t=1: b activates
      snapshot(["a", "b", "c"], ["a", "b", "c", "d"]),     // t=2: c activates
      snapshot(["a", "b", "c", "d"], ["a", "b", "c", "d"]), // t=3: d activates
    ];
    const result = cascadeEdgeActivationOrder(edges, epochs, 3);

    // e_ab fires at t=1 (b activated), e_bc at t=2, e_cd at t=3.
    expect(result.get("e_ab")?.ordinal).toBe(1);
    expect(result.get("e_ab")?.activationEpoch).toBe(1);
    expect(result.get("e_bc")?.ordinal).toBe(2);
    expect(result.get("e_bc")?.activationEpoch).toBe(2);
    expect(result.get("e_cd")?.ordinal).toBe(3);
    expect(result.get("e_cd")?.activationEpoch).toBe(3);
  });

  it("skips edges whose target never activates", () => {
    const edges = [edge("e_ab", "a", "b"), edge("e_az", "a", "z")];
    const epochs: EpochSnapshot[] = [
      snapshot(["a"], ["a", "b", "z"]),
      snapshot(["a", "b"], ["a", "b", "z"]),
    ];
    const result = cascadeEdgeActivationOrder(edges, epochs, 1);
    expect(result.has("e_ab")).toBe(true);
    expect(result.has("e_az")).toBe(false); // z never activated
  });

  it("respects upToEpoch cutoff (hides later edges during scrub-back)", () => {
    const edges = [edge("e_ab", "a", "b"), edge("e_bc", "b", "c")];
    const epochs: EpochSnapshot[] = [
      snapshot(["a"], ["a", "b", "c"]),
      snapshot(["a", "b"], ["a", "b", "c"]),
      snapshot(["a", "b", "c"], ["a", "b", "c"]),
    ];
    // At epoch 1, only e_ab has fired.
    const atT1 = cascadeEdgeActivationOrder(edges, epochs, 1);
    expect(atT1.has("e_ab")).toBe(true);
    expect(atT1.has("e_bc")).toBe(false);

    // At epoch 2, both have fired.
    const atT2 = cascadeEdgeActivationOrder(edges, epochs, 2);
    expect(atT2.has("e_ab")).toBe(true);
    expect(atT2.has("e_bc")).toBe(true);
  });

  it("breaks same-epoch ties by (targetId ASC, edgeId ASC)", () => {
    // Three edges firing into different targets in the same epoch.
    // Expected ordinals follow target id sort.
    const edges = [
      edge("e_to_z", "a", "z"),
      edge("e_to_b", "a", "b"),
      edge("e_to_m", "a", "m"),
    ];
    const epochs: EpochSnapshot[] = [
      snapshot(["a"], ["a", "b", "m", "z"]),
      snapshot(["a", "b", "m", "z"], ["a", "b", "m", "z"]),
    ];
    const result = cascadeEdgeActivationOrder(edges, epochs, 1);
    // All fire at t=1 → ordered by target id: b, m, z.
    expect(result.get("e_to_b")?.ordinal).toBe(1);
    expect(result.get("e_to_m")?.ordinal).toBe(2);
    expect(result.get("e_to_z")?.ordinal).toBe(3);
  });

  it("breaks same-target ties by edgeId ASC (multi-incoming-edge case)", () => {
    // Two edges firing into the same node at the same epoch — possible
    // when a target has multiple upstream causes that activate together.
    const edges = [edge("e_z_to_t", "z", "t"), edge("e_a_to_t", "a", "t")];
    const epochs: EpochSnapshot[] = [
      snapshot(["a", "z"], ["a", "z", "t"]),
      snapshot(["a", "z", "t"], ["a", "z", "t"]),
    ];
    const result = cascadeEdgeActivationOrder(edges, epochs, 1);
    // Both have target "t" and same activationEpoch=1 → sorted by edge id.
    expect(result.get("e_a_to_t")?.ordinal).toBe(1);
    expect(result.get("e_z_to_t")?.ordinal).toBe(2);
  });

  it("includes severed edges that historically fired (renderer decides visibility)", () => {
    // Renderer concern, not data concern — return the historical fire
    // event so the demo can show "would-have-fired" dimmed pulses for
    // edges the analyst severs after the cascade ran.
    const edges = [{ ...edge("e_ab", "a", "b"), isSevered: true }];
    const epochs: EpochSnapshot[] = [
      snapshot(["a"], ["a", "b"]),
      snapshot(["a", "b"], ["a", "b"]),
    ];
    const result = cascadeEdgeActivationOrder(edges, epochs, 1);
    expect(result.has("e_ab")).toBe(true);
  });

  it("clamps upToEpoch past the end to epochs.length - 1", () => {
    const edges = [edge("e_ab", "a", "b")];
    const epochs: EpochSnapshot[] = [
      snapshot(["a"], ["a", "b"]),
      snapshot(["a", "b"], ["a", "b"]),
    ];
    // upToEpoch=999 should not throw; should match upToEpoch=1.
    const result = cascadeEdgeActivationOrder(edges, epochs, 999);
    expect(result.size).toBe(1);
  });
});

// ─── edgeFireIntensity ───────────────────────────────────────────

describe("edgeFireIntensity", () => {
  it("returns 1.0 at the exact activation epoch", () => {
    expect(edgeFireIntensity(5, 5)).toBe(1);
  });

  it("returns 0 well outside the window", () => {
    expect(edgeFireIntensity(5, 10)).toBe(0); // 5 epochs after
    expect(edgeFireIntensity(5, 0)).toBe(0); // 5 before
  });

  it("decays linearly across the post-activation window", () => {
    // Default window is 3 epochs.
    expect(edgeFireIntensity(5, 5)).toBe(1);
    expect(edgeFireIntensity(5, 6)).toBeCloseTo(2 / 3, 5);
    expect(edgeFireIntensity(5, 7)).toBeCloseTo(1 / 3, 5);
    expect(edgeFireIntensity(5, 8)).toBe(0);
  });

  it("handles the one-epoch lead-in (-1 → 0.0)", () => {
    // delta = -1 → 1 + (-1) = 0. So pure-integer lead-in only matters
    // for fractional scrub interpolation; with epoch=integer, the
    // edge appears at activationEpoch with full intensity.
    expect(edgeFireIntensity(5, 4)).toBe(0);
  });

  it("respects custom windowEpochs", () => {
    expect(edgeFireIntensity(5, 6, 1)).toBe(0); // window=1, decay finishes by delta=1
    expect(edgeFireIntensity(5, 6, 5)).toBeCloseTo(0.8, 5);
  });

  it("windowEpochs ≤ 0 only fires at the exact epoch (no decay)", () => {
    expect(edgeFireIntensity(5, 5, 0)).toBe(1);
    expect(edgeFireIntensity(5, 6, 0)).toBe(0);
    expect(edgeFireIntensity(5, 5, -1)).toBe(1);
  });
});
