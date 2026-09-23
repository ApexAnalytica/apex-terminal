import { describe, it, expect } from "vitest";
import { TOUR_STEPS } from "../tour-steps";

// ─── Tour: calc → DIAL → watchlist loop ───────────────────────────────
//
// Pins the new 3-step loop's contract:
//   1. All three steps exist in the loop deep-dive track
//   2. Their target selectors point at the data-tour anchors we wired
//      onto CalculationsPanel + TimeSeriesOverlay
//   3. The middle step's awaitInteraction predicate flips true exactly
//      when ONE of the calc history stores has its first entry
//   4. The middle step's hint is non-empty (target-alignment contract
//      already enforces this generically; we re-pin it here so a
//      regression on the calc step shows up in this targeted file too)

const STEP_IDS = [
  "calculations-panel-intro",
  "calc-dial-push",
  "calc-watchlist-row",
] as const;

describe("tour-steps — calculations loop", () => {
  it("all three steps are in the loop deep-dive track", () => {
    for (const id of STEP_IDS) {
      const step = TOUR_STEPS.find((s) => s.id === id);
      expect(step, `step ${id} missing`).toBeDefined();
      expect(step!.phase).toBe("deep-dive");
      expect(step!.deepDiveTrack).toBe("loop");
    }
  });

  it("target selectors point at the data-tour anchors we added", () => {
    const intro = TOUR_STEPS.find((s) => s.id === "calculations-panel-intro")!;
    const dial = TOUR_STEPS.find((s) => s.id === "calc-dial-push")!;
    const watchlist = TOUR_STEPS.find((s) => s.id === "calc-watchlist-row")!;
    expect(intro.targetSelector).toBe('[data-tour="calculations-panel"]');
    expect(dial.targetSelector).toBe('[data-tour="calc-dial-button"]');
    expect(watchlist.targetSelector).toBe('[data-tour="calc-watchlist"]');
  });

  it("the dial step has a hint and an awaitInteraction predicate", () => {
    const dial = TOUR_STEPS.find((s) => s.id === "calc-dial-push")!;
    expect(dial.awaitInteraction).toBeDefined();
    expect(dial.awaitInteraction!.hint).toMatch(/dial/i);
    expect(typeof dial.awaitInteraction!.predicate).toBe("function");
  });

  it("predicate is false on a fresh store and true after a calc push", () => {
    const dial = TOUR_STEPS.find((s) => s.id === "calc-dial-push")!;
    const pred = dial.awaitInteraction!.predicate;
    // Mock the slice of state the predicate reads — typed loosely
    // because the predicate only touches the two history keys.
    type PartialStore = {
      graphCalcHistory: Record<string, unknown[]>;
      nodeCalcHistory: Record<string, unknown[]>;
    };
    const empty = {
      graphCalcHistory: {},
      nodeCalcHistory: {},
    } as unknown as Parameters<typeof pred>[0];
    expect(pred(empty)).toBe(false);

    const graphPushed: PartialStore = {
      graphCalcHistory: { "mean-omega": [{ value: 5.5, observedAt: "x" }] },
      nodeCalcHistory: {},
    };
    expect(pred(graphPushed as unknown as Parameters<typeof pred>[0])).toBe(true);

    const nodePushed: PartialStore = {
      graphCalcHistory: {},
      nodeCalcHistory: { "node-a": [] },
    };
    expect(pred(nodePushed as unknown as Parameters<typeof pred>[0])).toBe(true);
  });

  it("the three steps are contiguous in TOUR_STEPS (visual ordering matters)", () => {
    const introIdx = TOUR_STEPS.findIndex((s) => s.id === "calculations-panel-intro");
    const dialIdx = TOUR_STEPS.findIndex((s) => s.id === "calc-dial-push");
    const watchIdx = TOUR_STEPS.findIndex((s) => s.id === "calc-watchlist-row");
    expect(dialIdx).toBe(introIdx + 1);
    expect(watchIdx).toBe(dialIdx + 1);
  });
});
