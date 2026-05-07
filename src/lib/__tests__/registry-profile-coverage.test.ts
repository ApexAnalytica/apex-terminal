// Registry × profile coverage contract.
//
// Catches the failure mode that motivated PR #246: an estimator's
// `defaultAvailability: "ready"` flips on in the registry but no
// production profile lists it in `criticalityEstimators`, so the new
// runtime never renders. Production was stuck on three tabs after
// PR #234 wired BOCPD live, until #246 added "bocpd" to the analyst
// profile array.
//
// Contract: every estimator the registry advertises as "ready" must
// appear in at least one production profile. New "ready" estimators
// either need a profile entry or — if scoped to a single domain — an
// allow-list entry in `EXEMPT_READY_ESTIMATORS` below with a reason.
//
// Adding a new "ready" estimator without updating either side fails
// this test. Future flips from "awaiting-data" → "ready" go through
// the same gate.

import { describe, it, expect } from "vitest";
import { getAllEstimatorMeta } from "../criticality-registry";
import {
  GEOPOLITICAL_PROFILE,
  T1D_PROFILE,
  AI_SAFETY_PROFILE,
  type EstimatorId,
} from "../domain-profiles";

const PRODUCTION_PROFILES = [
  GEOPOLITICAL_PROFILE,
  T1D_PROFILE,
  AI_SAFETY_PROFILE,
];

/**
 * Estimators allowed to be "ready" in the registry without being
 * listed in any production profile. Use sparingly — the whole point
 * of this test is to make profile-coverage gaps fail loudly. Each
 * entry needs a one-line justification.
 */
const EXEMPT_READY_ESTIMATORS: Partial<Record<EstimatorId, string>> = {
  // No exemptions today. Add entries here only when an estimator is
  // genuinely ready but intentionally not surfaced in any default
  // profile (e.g. a flagship-feature gated behind a paid tier).
};

describe("criticality-registry × domain-profile coverage", () => {
  it("every registry entry marked 'ready' appears in at least one production profile", () => {
    const allCovered = new Set<EstimatorId>();
    for (const profile of PRODUCTION_PROFILES) {
      for (const eid of profile.criticalityEstimators) {
        allCovered.add(eid);
      }
    }

    const missing: { id: EstimatorId; reason?: string }[] = [];
    for (const meta of getAllEstimatorMeta()) {
      if (meta.defaultAvailability !== "ready") continue;
      if (allCovered.has(meta.id)) continue;
      if (EXEMPT_READY_ESTIMATORS[meta.id]) continue;
      missing.push({ id: meta.id });
    }

    expect(
      missing,
      missing.length === 0
        ? ""
        : `These estimators are 'ready' in the registry but absent from every production profile:\n  ${missing
            .map((m) => `- ${m.id}`)
            .join("\n  ")}\n` +
          `Either add them to GEOPOLITICAL_PROFILE / T1D_PROFILE in src/lib/domain-profiles.ts, ` +
          `or whitelist them in EXEMPT_READY_ESTIMATORS in this test with a one-line reason.`,
    ).toEqual([]);
  });

  it("every estimator listed in a production profile exists in the registry", () => {
    const registered = new Set(getAllEstimatorMeta().map((m) => m.id));
    const orphans: { profile: string; id: EstimatorId }[] = [];
    for (const profile of PRODUCTION_PROFILES) {
      for (const eid of profile.criticalityEstimators) {
        if (!registered.has(eid)) {
          orphans.push({ profile: profile.id, id: eid });
        }
      }
    }
    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `These profile entries reference estimator IDs that the registry doesn't define:\n  ${orphans
            .map((o) => `- ${o.profile} → ${o.id}`)
            .join("\n  ")}`,
    ).toEqual([]);
  });

  it("no production profile is empty", () => {
    for (const profile of PRODUCTION_PROFILES) {
      expect(profile.criticalityEstimators.length).toBeGreaterThan(0);
    }
  });
});
