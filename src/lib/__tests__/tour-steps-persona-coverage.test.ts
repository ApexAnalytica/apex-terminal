// Per-persona tour copy coverage contract.
//
// Catches the issue that motivated the deep-dive persona work: a
// SCIENTIST user completes the persona-aware first-run track (life
// sciences flavour) and then opts into deep-dive — only to drop into
// shared copy that was originally written from the analyst angle.
// Domain-specific keywords like "sanctions" or "treaties" or geopolitical
// crash-narrative framing read wrong for that persona.
//
// Two contracts:
//   1. Every step that uses shared (single-StepCopy) form must be
//      domain-neutral. If it leaks an analyst-only or scientist-only
//      keyword, the test fails — split it into per-track copy.
//   2. Every step that uses per-track form must populate BOTH tracks
//      with non-empty title + description. No "shipped half the
//      personas" half-states.
//
// Adding a new step that fails either check needs an explicit
// allow-list entry below with a one-line reason.

import { describe, it, expect } from "vitest";
import {
  TOUR_STEPS,
  resolveCopy,
  type TourStep,
  type TourTrack,
} from "../tour-steps";

// Words / phrases that signal a step is leaning hard into one domain.
// Keep this list focused on framing words that *clash* — generic
// vocabulary ("node", "edge", "graph") is fine in shared copy.
const ANALYST_KEYWORDS = [
  "sanction", "treaty", "treaties", "geopolitical",
  "trade flow", "crash", "currency", "fiscal",
  "attacker-defender",
];

const SCIENTIST_KEYWORDS = [
  "C-peptide", "AAB titer", "MMTT", "HbA1c",
  "cytokine", "IRB", "FDA", "biological",
  "honeymoon-end", "clinical", "complication load",
];

/**
 * Steps allowed to use shared copy even if it contains a domain-leaning
 * keyword. Use sparingly. Each entry needs a one-line justification.
 */
const SHARED_COPY_EXEMPTIONS: Record<string, string> = {
  // The welcome step lists all five persona pills by name, so it
  // mentions "GEOPOLITICAL" as a UI label, not as analyst framing.
  "welcome-and-domain":
    "lists all 5 persona pills by name; 'GEOPOLITICAL' is a UI label not framing",
};

function isPerTrackCopy(step: TourStep): boolean {
  return !("title" in step.copy);
}

describe("tour-steps × persona coverage", () => {
  it("every per-track step populates BOTH analyst and scientist copy", () => {
    const incomplete: { id: string; missing: TourTrack[] }[] = [];
    for (const step of TOUR_STEPS) {
      if (!isPerTrackCopy(step)) continue;
      const missing: TourTrack[] = [];
      for (const track of ["analyst", "scientist"] as const) {
        const c = resolveCopy(step, track);
        if (!c.title.trim() || !c.description.trim()) missing.push(track);
      }
      if (missing.length > 0) incomplete.push({ id: step.id, missing });
    }
    expect(
      incomplete,
      incomplete.length === 0
        ? ""
        : `These per-track steps have empty copy on one or more tracks:\n  ${incomplete
            .map((i) => `- ${i.id} → missing: ${i.missing.join(", ")}`)
            .join("\n  ")}`,
    ).toEqual([]);
  });

  it("every shared-copy step is domain-neutral (no analyst/scientist-only keywords)", () => {
    const leaks: { id: string; keyword: string }[] = [];
    for (const step of TOUR_STEPS) {
      if (isPerTrackCopy(step)) continue;
      if (SHARED_COPY_EXEMPTIONS[step.id]) continue;
      const text =
        ("title" in step.copy ? step.copy.title : "") +
        " " +
        ("description" in step.copy ? step.copy.description : "");
      const lower = text.toLowerCase();
      for (const kw of [...ANALYST_KEYWORDS, ...SCIENTIST_KEYWORDS]) {
        if (lower.includes(kw.toLowerCase())) {
          leaks.push({ id: step.id, keyword: kw });
          break;
        }
      }
    }
    expect(
      leaks,
      leaks.length === 0
        ? ""
        : `These shared-copy steps contain domain-leaning vocabulary:\n  ${leaks
            .map((l) => `- ${l.id} → "${l.keyword}"`)
            .join("\n  ")}\n` +
          `Either rewrite the copy domain-neutrally, split into per-track ` +
          `(analyst / scientist) variants, or whitelist in ` +
          `SHARED_COPY_EXEMPTIONS in this test with a one-line reason.`,
    ).toEqual([]);
  });

  // The per-track leak tests below only inspect per-track-copy steps.
  // Shared copy is validated by the "domain-neutral" test above (with
  // its explicit allow-list); checking it here too would double-flag
  // steps like "welcome-and-domain" that legitimately list "GEOPOLITICAL"
  // as a UI label.
  it("per-track ANALYST copy does not contain scientist-only jargon", () => {
    const leaks: { id: string; keyword: string }[] = [];
    for (const step of TOUR_STEPS) {
      if (!isPerTrackCopy(step)) continue;
      const c = resolveCopy(step, "analyst");
      const lower = (c.title + " " + c.description).toLowerCase();
      for (const kw of SCIENTIST_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) {
          leaks.push({ id: step.id, keyword: kw });
          break;
        }
      }
    }
    expect(
      leaks,
      leaks.length === 0
        ? ""
        : `Analyst copy leaks scientist-only vocabulary:\n  ${leaks
            .map((l) => `- ${l.id} → "${l.keyword}"`)
            .join("\n  ")}`,
    ).toEqual([]);
  });

  it("per-track SCIENTIST copy does not contain analyst-only jargon", () => {
    const leaks: { id: string; keyword: string }[] = [];
    for (const step of TOUR_STEPS) {
      if (!isPerTrackCopy(step)) continue;
      const c = resolveCopy(step, "scientist");
      const lower = (c.title + " " + c.description).toLowerCase();
      for (const kw of ANALYST_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) {
          leaks.push({ id: step.id, keyword: kw });
          break;
        }
      }
    }
    expect(
      leaks,
      leaks.length === 0
        ? ""
        : `Scientist copy leaks analyst-only vocabulary:\n  ${leaks
            .map((l) => `- ${l.id} → "${l.keyword}"`)
            .join("\n  ")}`,
    ).toEqual([]);
  });
});
