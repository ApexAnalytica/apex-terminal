// Tour-step target / pulse / predicate structural alignment contract.
//
// Motivation: PR #367 fixed a real visibility bug where the
// `time-dial-and-cascade` step had `targetSelector: '[data-tour="risk-flow"]'`
// while its `awaitInteraction.predicate` gated on `s.currentEpoch > 0`
// (a TimeDial interaction). The spotlight + pulse landed on the
// comparison-cards strip *above* the dial; the user was told "drag the
// time dial" but the highlight was on the wrong band of the UI. The
// predicate was right, the selector was wrong, and nothing caught the
// drift at PR time.
//
// This test enforces the *structural* shape that would have flagged
// that drift mechanically:
//
//   1. Every step with `awaitInteraction` MUST point at SOMETHING — a
//      non-null `targetSelector` or a `pulseSelector` (or both). A
//      gated step with neither leaves the user with no visual anchor
//      for the interaction.
//   2. Every step with `awaitInteraction` MUST carry a non-empty
//      `hint` string. Without it, the user has no text guidance for
//      what to do.
//   3. Any selector string we DO carry (`targetSelector`,
//      `secondaryTargetSelector`, `pulseSelector`) MUST follow the
//      project convention `[data-tour="..."]`. Other CSS selectors
//      (class names, id selectors, etc.) bypass our convention and
//      become fragile to component refactors.
//
// What this test deliberately does NOT do: it does NOT verify that
// the selector actually resolves to a DOM element when the step is
// active. That would require scanning the React component sources for
// `data-tour="..."` attributes at test time — brittle and
// maintenance-heavy. The Vercel preview comment loop (manual demo
// playthrough) is the right place to catch "selector points at the
// wrong band of the UI" bugs; this test is the cheap mechanical
// guardrail for the class of "I added an awaitInteraction but forgot
// to point at the right element entirely" mistakes.

import { describe, it, expect } from "vitest";
import { TOUR_STEPS, type TourStep } from "../tour-steps";

const DATA_TOUR_SELECTOR_RE = /^\[data-tour="[a-z0-9-]+"\]$/;

describe("tour-steps × target alignment", () => {
  it("every awaitInteraction step has a non-null target or pulse selector", () => {
    const stepsMissingAnchor: string[] = [];
    for (const step of TOUR_STEPS) {
      if (!step.awaitInteraction) continue;
      const hasTarget = step.targetSelector !== null;
      const hasPulse = !!step.awaitInteraction.pulseSelector;
      if (!hasTarget && !hasPulse) {
        stepsMissingAnchor.push(step.id);
      }
    }
    expect(
      stepsMissingAnchor,
      stepsMissingAnchor.length === 0
        ? ""
        : `These steps gate on user interaction but point at no UI element ` +
          `(targetSelector is null AND no pulseSelector). The user will see ` +
          `the tooltip but won't know where to click:\n  ${stepsMissingAnchor
            .map((id) => `- ${id}`)
            .join("\n  ")}`,
    ).toEqual([]);
  });

  it("every awaitInteraction step has a non-empty hint", () => {
    const stepsMissingHint: string[] = [];
    for (const step of TOUR_STEPS) {
      if (!step.awaitInteraction) continue;
      if (!step.awaitInteraction.hint || !step.awaitInteraction.hint.trim()) {
        stepsMissingHint.push(step.id);
      }
    }
    expect(
      stepsMissingHint,
      stepsMissingHint.length === 0
        ? ""
        : `These steps gate on user interaction but ship without a hint. ` +
          `The escalating pulse will fire but the user won't have text ` +
          `guidance for what to do:\n  ${stepsMissingHint
            .map((id) => `- ${id}`)
            .join("\n  ")}`,
    ).toEqual([]);
  });

  it("every selector string follows the [data-tour=\"...\"] convention", () => {
    const violations: { id: string; field: string; value: string }[] = [];
    for (const step of TOUR_STEPS) {
      const fields: { field: string; value: string | null | undefined }[] = [
        { field: "targetSelector", value: step.targetSelector },
        { field: "secondaryTargetSelector", value: step.secondaryTargetSelector },
        { field: "awaitInteraction.pulseSelector", value: step.awaitInteraction?.pulseSelector },
      ];
      for (const { field, value } of fields) {
        if (!value) continue;
        if (!DATA_TOUR_SELECTOR_RE.test(value)) {
          violations.push({ id: step.id, field, value });
        }
      }
    }
    expect(
      violations,
      violations.length === 0
        ? ""
        : `These selectors break the [data-tour="..."] convention. ` +
          `Class-name and id selectors bypass our convention and become ` +
          `fragile to component refactors:\n  ${violations
            .map((v) => `- ${v.id}.${v.field} = ${JSON.stringify(v.value)}`)
            .join("\n  ")}`,
    ).toEqual([]);
  });

  // Specific regression: the time-dial step MUST point at the dial, not
  // the comparison-cards strip above it. This is the exact bug PR #367
  // fixed; pin it down so it can't silently regress.
  it("the time-dial step points at the time-dial element, not risk-flow", () => {
    const step = TOUR_STEPS.find((s) => s.id === "time-dial-and-cascade") as
      | TourStep
      | undefined;
    expect(step, "time-dial-and-cascade step is missing from TOUR_STEPS").toBeDefined();
    expect(step!.targetSelector).toBe('[data-tour="time-dial"]');
    expect(step!.awaitInteraction?.pulseSelector).toBe('[data-tour="time-dial"]');
  });

  // Specific regression: the node-inspector step's spotlight stays on
  // the wider inspector panel for context, but its PULSE narrows to
  // the radar pentagon — the actual element the user has to click.
  it("the node-inspector step pulses the radar specifically, not the whole module-panel", () => {
    const step = TOUR_STEPS.find((s) => s.id === "node-inspector") as
      | TourStep
      | undefined;
    expect(step, "node-inspector step is missing from TOUR_STEPS").toBeDefined();
    expect(step!.targetSelector).toBe('[data-tour="module-panel"]');
    expect(step!.awaitInteraction?.pulseSelector).toBe('[data-tour="pillar-radar"]');
  });
});
