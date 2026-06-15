import { describe, it, expect } from "vitest";

import {
  computeDemoPayoff,
  FLOWS,
  getFlowById,
  type DemoFlow,
} from "../demo-flows";
import type { EpochSnapshot, OmegaStatus } from "../types";

// ── Synthetic epoch builder ──────────────────────────────────────
// computeDemoPayoff only reads omegaBuffer / omegaStatus / isCritical and
// each node state's isActivated, so we build minimal snapshots and cast.
function makeEpoch(
  epoch: number,
  omegaBuffer: number,
  omegaStatus: OmegaStatus,
  isCritical: boolean,
  activatedCount: number,
): EpochSnapshot {
  const nodeStates: Record<string, unknown> = {};
  for (let i = 0; i < activatedCount; i++) {
    nodeStates[`n${i}`] = { isActivated: true, shockIntensity: 0.5 };
  }
  // A couple of inactive nodes so the count is "peak activated", not total.
  nodeStates.inactive_a = { isActivated: false, shockIntensity: 0 };
  nodeStates.inactive_b = { isActivated: false, shockIntensity: 0 };
  return {
    epoch,
    nodeStates,
    edgeStates: {},
    omegaBuffer,
    omegaStatus,
    criticalityEstimate: null,
    isStable: !isCritical,
    isCritical,
  } as unknown as EpochSnapshot;
}

describe("computeDemoPayoff", () => {
  it("computes before/after deltas from baseline vs intervention epochs", () => {
    const baseline = [
      makeEpoch(0, 60, "ELEVATED", false, 3),
      makeEpoch(1, 10, "OMEGA_BREACH", true, 8), // worst frame
    ];
    const intervention = [
      makeEpoch(0, 60, "ELEVATED", false, 3),
      makeEpoch(1, 50, "ELEVATED", false, 4),
    ];

    const payoff = computeDemoPayoff(baseline, intervention, null);

    expect(payoff.baseline).not.toBeNull();
    expect(payoff.intervention).not.toBeNull();
    expect(payoff.baseline!.finalBuffer).toBe(10);
    expect(payoff.baseline!.finalStatus).toBe("OMEGA_BREACH");
    expect(payoff.baseline!.peakActivated).toBe(8);
    expect(payoff.baseline!.epochToCritical).toBe(1);
    expect(payoff.intervention!.finalBuffer).toBe(50);
    expect(payoff.intervention!.epochToCritical).toBeNull();

    expect(payoff.deltas).not.toBeNull();
    expect(payoff.deltas!.bufferGain).toBe(40); // 50 - 10
    expect(payoff.deltas!.fewerActivated).toBe(4); // 8 - 4
    expect(payoff.deltas!.statusImproved).toBe(true);
    // ttf(50)=round(182.5)=183 ; ttf(10)=round(36.5)=37 ; extra=146
    expect(payoff.deltas!.extraDaysToFailure).toBe(146);
  });

  it("returns null intervention summary + null deltas when not yet branched", () => {
    const baseline = [makeEpoch(0, 20, "CRITICAL", true, 5)];
    const payoff = computeDemoPayoff(baseline, [], null);
    expect(payoff.baseline).not.toBeNull();
    expect(payoff.intervention).toBeNull();
    expect(payoff.deltas).toBeNull();
  });

  it("passes the interdiction result through untouched", () => {
    const result = {
      interventions: [
        {
          target: { type: "edge" as const, id: "e1", label: "A → B" },
          damage: 12,
          marginalReduction: 20,
        },
      ],
      baselineDamage: 40,
      bestDamage: 12,
      reductionPct: 70,
    };
    const payoff = computeDemoPayoff([], [], result);
    expect(payoff.interdiction).toBe(result);
  });
});

describe("FLOWS structure", () => {
  it("getFlowById resolves every registered flow", () => {
    for (const flow of FLOWS) {
      expect(getFlowById(flow.id)).toBe(flow);
    }
    expect(getFlowById("does-not-exist")).toBeUndefined();
  });

  it("each flow tours modules, runs a real solve, and ends on a payoff", () => {
    const collectActionTypes = (flow: DemoFlow) =>
      flow.steps.flatMap((s) => (s.actions ?? []).map((a) => a.type));

    for (const flow of FLOWS) {
      expect(flow.steps.length).toBeGreaterThan(0);

      // The last step is the quantified payoff.
      const last = flow.steps[flow.steps.length - 1];
      expect(last.payoff).toBe(true);

      const actionTypes = collectActionTypes(flow);
      expect(actionTypes).toContain("shock");
      expect(actionTypes).toContain("replay");
      expect(actionTypes).toContain("solveInterdiction");
      expect(actionTypes).toContain("applyAndBranch");

      // The branch must happen before the payoff step renders.
      const branchStepIdx = flow.steps.findIndex((s) =>
        (s.actions ?? []).some((a) => a.type === "applyAndBranch"),
      );
      const payoffStepIdx = flow.steps.findIndex((s) => s.payoff);
      expect(branchStepIdx).toBeGreaterThanOrEqual(0);
      expect(payoffStepIdx).toBeGreaterThan(branchStepIdx);

      // The flow visits more than one module (a real tour, not one tab).
      const modules = new Set(
        flow.steps.map((s) => s.module).filter(Boolean),
      );
      expect(modules.size).toBeGreaterThanOrEqual(3);
    }
  });
});
