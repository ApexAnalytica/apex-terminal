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

// ─── Trial-prior scaffold (consumed by MC engine) ───────────────────

/**
 * Fixed pieces of the VX-880 trial prior that the MC engine needs but
 * that aren't produced by the NLME/Cox fits themselves. Combined at
 * runtime with the fit outputs (β, SE, popK, τ_k) to form the full
 * TrialPrior published to useApexStore.
 *
 * `outcomeNodeId` is the id of the insulin-independence endpoint in
 * `t1d-vx880-graph-data.ts` — the MC engine watches its cascade
 * intensity to attenuate the treatment effect when the attack path
 * reaches the outcome.
 *
 * `baselineHazardPerEpoch` is calibrated to the control arm: 1 partial-
 * response event in 12 subjects at month 11 gives an empirical per-
 * month hazard ≈ 1 / (12 * 11) ≈ 0.0076. With the MC's default 60-
 * epoch horizon mapped to 12 trial months this is 5 epochs/month, so
 * ≈ 0.0015 per epoch. Rounding to 0.002 keeps the control-arm fan
 * landing near the reported ~8% 12-month event rate.
 */
export const VX880_TRIAL_PRIOR_META = {
  label: "VX-880 insulin independence",
  outcomeNodeId: "vx880_insulin_indep",
  baselineHazardPerEpoch: 0.002,
  source: "Reichman NEJM 2023 · DCCT/EDIC",
} as const;

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

// ─── Cox covariate modifiers (for the do-operator slider surface) ───
//
// The fitted Cox β captures "VX-880 vs natural history" averaged over
// the trial's typical patient/protocol covariates. The slider surface
// in VX880TrialPanel asks the do-operator question: how does the
// observed treatment HR shift if the audience changes one of those
// covariates? We compose multiplicatively on the fitted log-HR:
//
//   log_HR = β_treat · interdictionFrac + computeCovariateLogHR(covariates)
//
// where the covariate term is:
//
//   - δ_hla · (hlaMismatch  − baseline)
//   - δ_aab · (autoantibody − baseline)
//   + δ_is  · (isIntensity  − baseline)
//
// Sign convention: HLA mismatch ↑ and autoantibody titer ↑ both attack
// the graft → HR shrinks toward 1. Tighter immunosuppression → preserves
// graft β-mass → HR stays closer to the trial-fit value.
//
// PROVENANCE NOTE — IMPORTANT FOR INSTITUTIONAL VIEWERS
// =====================================================
// The δ values below are **illustrative, not citation-grade**. They are
// order-of-magnitude estimates rounded for clean math, anchored in the
// neighbourhood of the cited papers but not lifted from a specific
// table cell. The trial cohort here (n=24, single-covariate model) is
// too small to identify these multipliers in a partial-likelihood
// refit honestly, so the slider surface is a configurable scaffold
// rather than a published model. A collaborator wanting a defensible
// covariate model would replace these δ values with refit values from
// their own cohort or with table values pulled directly from the cited
// papers.
//
// The slider's job is to make the do-operator question concrete and
// compositional with the interdiction surface, not to publish a CDE.
export type CovariateProvenance = "illustrative" | "citation-grade";

export interface CovariateState {
  hlaMismatch: number;
  autoantibodyZ: number;
  isIntensity: number;
}

export const VX880_COVARIATE_MODIFIERS = {
  hlaMismatch: {
    label: "HLA mismatch",
    short: "DR/DQ allele mismatches between donor cell line and recipient",
    unit: "mismatches",
    min: 0,
    max: 6,
    step: 1,
    baseline: 3,
    // Per-mismatch log-HR for graft-loss-driven loss of treatment effect.
    deltaLogHR: 0.26,
    citation:
      "Anchor neighbourhood: ~1.3× HR per DR/DQ mismatch in solid-organ allograft loss registries (Lefaucheur, Wiebe, etc.)",
    provenance: "illustrative" as CovariateProvenance,
  },
  autoantibodyZ: {
    label: "Autoantibody titer",
    short: "GAD/IA-2/ZnT8 titer relative to trial baseline (z-score)",
    unit: "σ from baseline",
    min: -2,
    max: 3,
    step: 0.5,
    baseline: 0,
    // Per-σ log-HR for autoimmune-recurrence-driven loss of treatment effect.
    deltaLogHR: 0.35,
    citation:
      "Anchor neighbourhood: ~2× recurrence rate at high titer (Vendrame, Burke, et al.) over a 2σ shift",
    provenance: "illustrative" as CovariateProvenance,
  },
  isIntensity: {
    label: "Immunosuppression intensity",
    short: "0 = sub-therapeutic / lapse · 1 = standard tac+MMF · 2 = aggressive ATG induction",
    unit: "regimen tier",
    min: 0,
    max: 2,
    step: 1,
    baseline: 1,
    // Per-tier log-HR for IS-driven preservation of treatment effect.
    deltaLogHR: 0.69,
    citation:
      "Anchor neighbourhood: ~0.5× graft-loss hazard per induction step (CIBMTR registry / Hering Diabetes Care 2016 family)",
    provenance: "illustrative" as CovariateProvenance,
  },
} as const;

/**
 * Default covariate state — every slider sits at its trial-cohort
 * baseline so the panel reads "untouched = trial-fit HR" until the
 * audience moves a knob.
 */
export const VX880_COVARIATE_BASELINE: CovariateState = {
  hlaMismatch: VX880_COVARIATE_MODIFIERS.hlaMismatch.baseline,
  autoantibodyZ: VX880_COVARIATE_MODIFIERS.autoantibodyZ.baseline,
  isIntensity: VX880_COVARIATE_MODIFIERS.isIntensity.baseline,
};

/**
 * Compose the slider state into a log-HR delta. Used by both the
 * VX880TrialPanel HR readout and the trialPrior published to the MC
 * engine — keeps the displayed HR and the survival fan in lock-step
 * when the audience drags a slider.
 *
 * Returns 0 when every covariate is at baseline.
 */
export function computeCovariateLogHR(covariates: CovariateState): number {
  const cm = VX880_COVARIATE_MODIFIERS;
  const hla =
    -cm.hlaMismatch.deltaLogHR *
    (covariates.hlaMismatch - cm.hlaMismatch.baseline);
  const aab =
    -cm.autoantibodyZ.deltaLogHR *
    (covariates.autoantibodyZ - cm.autoantibodyZ.baseline);
  const is =
    cm.isIntensity.deltaLogHR *
    (covariates.isIntensity - cm.isIntensity.baseline);
  return hla + aab + is;
}
