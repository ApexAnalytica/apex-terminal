// ─── VX-880 Flagship Demo: Literature-Calibrated Trial Cohort ──────
//
// Two linked "trial-like" datasets used by the VX-880 analysis panel:
//
//   (A) NATURAL-HISTORY C-PEPTIDE DECAY
//       12 adults with recent-onset T1D (reference arm), stimulated
//       C-peptide AUC (nmol/L) at 8 visits over 3 years. Decays
//       monoexponentially — exactly the shape the TS NLME port fits.
//       Calibrated to DCCT/EDIC and Hvidøre C-peptide attrition reports:
//       baseline ~0.22 nmol/L, t½ ≈ 2-3 yr (k ≈ 0.25-0.35 /yr).
//
//   (B) INSULIN-INDEPENDENCE TIME-TO-EVENT
//       24 patients total — 12 on VX-880 (half-dose + full-dose cohorts,
//       FORWARD-101) + 12 natural-history controls. Event = sustained
//       insulin independence (HbA1c < 7% with 0 exogenous insulin for
//       ≥ 14 d). Time axis in months post-enrollment; censored at 12 mo.
//
//       VX-880 arm numbers track the Reichman NEJM 2023 interim report:
//       ~50% of dosed subjects met insulin-independence criteria by
//       month 12, typically first achieved at months 4-9. Control arm
//       has essentially zero events — endogenous β-cell recovery is
//       not part of T1D natural history. We include one partial-response
//       event late in the control arm to keep the Cox partial likelihood
//       well-conditioned (otherwise β → +∞ under perfect separation).
//
// Literature grounding (primary sources):
//   · Reichman T et al. NEJM 2023 — VX-880 first-in-human results
//   · DCCT/EDIC Research Group 1998, 2003 — C-peptide attrition
//     in intensively treated recent-onset T1D
//   · Hvidøre Study Group — pediatric/young-adult C-peptide trajectories
//   · Freireich EJ et al. Blood 1963 — canonical Cox benchmark shape
//
// Values are hand-calibrated to published means + published between-
// subject CVs — not re-digitized from individual-patient records
// (those are DUA-restricted). For institutional demos the right next
// step is to request DCCT/T1DX access and regenerate the fixture from
// real individual trajectories; until then this file tells the same
// mechanistic story with transparent assumptions.

import type { NlmeSubject } from "./estimators/nlme";

// ─── (A) Natural-history C-peptide decay cohort ─────────────────────

/** Visit schedule in years from T1D diagnosis. */
const CPEPTIDE_VISITS_YEARS = [0.0, 0.25, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

/**
 * Twelve natural-history trajectories. Each row is stimulated
 * C-peptide AUC in nmol/L at the visits above. Hand-seeded from
 * independent log-A ~ N(log 0.22, 0.20²) and log-k ~ N(log 0.28, 0.35²)
 * draws with ~8% residual noise — produces a cohort median A ≈ 0.22
 * and median k ≈ 0.28 /yr (t½ ≈ 2.5 yr), matching DCCT/EDIC.
 */
const NATURAL_HISTORY_CPEPTIDE: number[][] = [
  [0.239, 0.223, 0.210, 0.184, 0.160, 0.141, 0.124, 0.108],
  [0.271, 0.249, 0.232, 0.202, 0.175, 0.153, 0.132, 0.114],
  [0.195, 0.173, 0.157, 0.127, 0.103, 0.084, 0.068, 0.055],
  [0.213, 0.192, 0.178, 0.152, 0.131, 0.112, 0.096, 0.082],
  [0.248, 0.234, 0.220, 0.197, 0.174, 0.155, 0.137, 0.122],
  [0.228, 0.198, 0.175, 0.136, 0.107, 0.084, 0.066, 0.052],
  [0.205, 0.185, 0.168, 0.140, 0.116, 0.098, 0.082, 0.068],
  [0.256, 0.242, 0.227, 0.202, 0.180, 0.160, 0.142, 0.127],
  [0.184, 0.165, 0.149, 0.122, 0.100, 0.082, 0.068, 0.056],
  [0.232, 0.207, 0.185, 0.148, 0.119, 0.096, 0.077, 0.062],
  [0.219, 0.204, 0.190, 0.165, 0.144, 0.125, 0.108, 0.094],
  [0.242, 0.214, 0.189, 0.148, 0.116, 0.091, 0.072, 0.056],
];

/**
 * Natural-history C-peptide cohort, shaped for `nlmeFit(subjects)`.
 * Returns a defensive copy on every call so callers can mutate freely.
 */
export function getNaturalHistoryCpeptideCohort(): NlmeSubject[] {
  return NATURAL_HISTORY_CPEPTIDE.map((y) => ({
    t: CPEPTIDE_VISITS_YEARS.slice(),
    y: y.slice(),
  }));
}

// ─── (B) Insulin-independence time-to-event cohort ──────────────────

export interface TteSubject {
  /** Arbitrary stable id for display — e.g. "VX-04". */
  id: string;
  /** Months from enrollment to event or censoring. */
  timeMonths: number;
  /** 1 = event (sustained insulin independence), 0 = censored. */
  event: 0 | 1;
  /** 1 = VX-880 treatment arm, 0 = natural-history control. */
  treatment: 0 | 1;
}

/**
 * 24-patient TTE dataset — 12 VX-880 + 12 control. VX-880 arm shows
 * 7 events at months 4, 5, 6, 6, 7, 8, 10 (mirrors Reichman 2023's
 * ~50% insulin-independence at 12 mo). Control arm has 1 late partial-
 * response event (see file header for rationale).
 */
const TTE_DATA: TteSubject[] = [
  // VX-880 treatment arm — 12 subjects, 7 events, 5 censored
  { id: "VX-01", timeMonths: 4, event: 1, treatment: 1 },
  { id: "VX-02", timeMonths: 5, event: 1, treatment: 1 },
  { id: "VX-03", timeMonths: 6, event: 1, treatment: 1 },
  { id: "VX-04", timeMonths: 6, event: 1, treatment: 1 },
  { id: "VX-05", timeMonths: 7, event: 1, treatment: 1 },
  { id: "VX-06", timeMonths: 8, event: 1, treatment: 1 },
  { id: "VX-07", timeMonths: 10, event: 1, treatment: 1 },
  { id: "VX-08", timeMonths: 12, event: 0, treatment: 1 },
  { id: "VX-09", timeMonths: 12, event: 0, treatment: 1 },
  { id: "VX-10", timeMonths: 12, event: 0, treatment: 1 },
  { id: "VX-11", timeMonths: 12, event: 0, treatment: 1 },
  { id: "VX-12", timeMonths: 12, event: 0, treatment: 1 },
  // Natural-history control arm — 12 subjects, 1 late event, 11 censored
  { id: "NH-01", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-02", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-03", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-04", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-05", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-06", timeMonths: 11, event: 1, treatment: 0 },
  { id: "NH-07", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-08", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-09", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-10", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-11", timeMonths: 12, event: 0, treatment: 0 },
  { id: "NH-12", timeMonths: 12, event: 0, treatment: 0 },
];

export function getInsulinIndependenceTte(): {
  subjects: TteSubject[];
  X: number[][];
  times: number[];
  events: number[];
} {
  const subjects = TTE_DATA.map((s) => ({ ...s }));
  return {
    subjects,
    X: subjects.map((s) => [s.treatment]),
    times: subjects.map((s) => s.timeMonths),
    events: subjects.map((s) => s.event),
  };
}

// ─── Literature-grounded targets (for display) ──────────────────────

/**
 * Narrative anchors shown in the analysis panel so the institutional
 * viewer can sanity-check our fits against published numbers.
 */
export const VX880_LITERATURE_ANCHORS = {
  cpeptideHalfLifeYears: "~2-3 yr (DCCT/EDIC intensive arm)",
  cpeptideBaseline: "~0.20-0.25 nmol/L stimulated AUC (recent-onset T1D)",
  vx880InsulinIndepRate:
    "~50% by 12 mo on full-dose (Reichman NEJM 2023 FORWARD-101)",
  naturalHistoryInsulinIndepRate:
    "≈ 0% — spontaneous reversal is not part of T1D natural history",
};
