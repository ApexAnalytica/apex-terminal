// ─── Synthetic nPOD-shaped Cohort Fixture ────────────────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// This is NOT real nPOD data. It is a deterministic, fully-synthetic
// cohort whose schema, stratum structure, and feature distributions
// are *modelled on* the canonical nPOD donor categories so the
// scientist-mode UI has something realistic to render before any
// institutional partnership lands.
//
// Why a fixture (not an ingester):
//   - nPOD data access requires DAC review (~weeks).
//   - The platform's UI / demo / pitch must work before that.
//   - A synthetic fixture lets us build and ship the Tissue Cohort
//     view, validate it visually, and be ready to swap in real data
//     the moment access is granted.
//
// The fixture is deterministic on `seed` so demo screenshots are
// reproducible. `containsPHI: false` is hard-typed (literal). The view
// banner that renders this cohort says "SYNTHETIC … no real PHI" so
// no viewer can mistake it for real ingested data.
//
// Strata (modelled on nPOD's standard donor categories):
//   - HC            healthy control, autoantibody-negative
//   - AAB+          at-risk, autoantibody-positive without clinical T1D
//   - NEW_ONSET     T1D ≤1 year duration
//   - LONG_DURATION T1D ≥10 years (Medalist-shaped subset)
//
// The feature distributions encode the canonical disease-progression
// story so the demo lands: HC has full β-cell mass and no insulitis;
// AAB+ has emerging immune signal; NEW_ONSET has peak insulitis with
// dropping mass; LONG_DURATION has burnt-out insulitis with very
// little mass remaining. The "junction pillar" (immune-metabolic
// coupling) peaks at NEW_ONSET and collapses at LONG_DURATION
// because there is no β-cell substrate left to couple to.

import type { Cohort, Subject, Variable } from "../cohort-types";

// ─── Stratum definitions ─────────────────────────────────────────────

export type NpodStratum = "HC" | "AAB+" | "NEW_ONSET" | "LONG_DURATION";

export const STRATUM_LABELS: Record<NpodStratum, string> = {
  HC: "Healthy control (AAB−)",
  "AAB+": "At-risk (AAB+, no clinical T1D)",
  NEW_ONSET: "Recent-onset T1D (≤1 yr)",
  LONG_DURATION: "Long-duration T1D (≥10 yr)",
};

export const STRATUM_DESCRIPTIONS: Record<NpodStratum, string> = {
  HC:
    "Autoantibody-negative non-T1D donors. Reference baseline: full β-cell mass, no insulitis, normal C-peptide.",
  "AAB+":
    "Single or multi-autoantibody-positive donors without clinical T1D — at-risk substrate for the field's prevention trials.",
  NEW_ONSET:
    "T1D within the first year of diagnosis. Active insulitis, declining residual β-cell function.",
  LONG_DURATION:
    "T1D ≥10 years. The Medalist-shaped substrate where the question becomes which patients retain residual function and why.",
};

export const STRATA: NpodStratum[] = ["HC", "AAB+", "NEW_ONSET", "LONG_DURATION"];

// ─── Variable schema (multi-modal) ───────────────────────────────────

export const NPOD_VARIABLES: Variable[] = [
  // Histology
  {
    id: "histo_insulitis_grade",
    label: "Insulitis grade",
    kind: "discrete",
    unit: "ordinal 0–4",
  },
  {
    id: "histo_beta_cell_mass_pct",
    label: "β-cell mass (% of islet area)",
    kind: "continuous",
    unit: "%",
  },
  {
    id: "histo_islet_count",
    label: "Islet count (per pancreatic section)",
    kind: "discrete",
    unit: "count",
  },

  // scRNA cluster proportions (sum to 1 per donor)
  {
    id: "scrna_alpha_pct",
    label: "α-cell proportion",
    kind: "continuous",
    unit: "fraction",
  },
  {
    id: "scrna_beta_pct",
    label: "β-cell proportion",
    kind: "continuous",
    unit: "fraction",
  },
  {
    id: "scrna_delta_pct",
    label: "δ-cell proportion",
    kind: "continuous",
    unit: "fraction",
  },
  {
    id: "scrna_immune_pct",
    label: "Immune-infiltrate proportion",
    kind: "continuous",
    unit: "fraction",
  },
  {
    id: "scrna_exocrine_pct",
    label: "Exocrine proportion",
    kind: "continuous",
    unit: "fraction",
  },

  // Proteomic / serum
  {
    id: "prot_c_peptide_pmol_per_mL",
    label: "Stimulated C-peptide AUC",
    kind: "continuous",
    unit: "pmol/mL",
  },
  {
    id: "prot_gad65_titer",
    label: "GAD65 autoantibody titer",
    kind: "continuous",
    unit: "U/mL",
  },
  {
    id: "prot_ia2_titer",
    label: "IA-2 autoantibody titer",
    kind: "continuous",
    unit: "U/mL",
  },
  {
    id: "prot_znt8_titer",
    label: "ZnT8 autoantibody titer",
    kind: "continuous",
    unit: "U/mL",
  },
  {
    id: "prot_ifn_gamma_pg_per_mL",
    label: "IFN-γ",
    kind: "continuous",
    unit: "pg/mL",
  },
  {
    id: "prot_il6_pg_per_mL",
    label: "IL-6",
    kind: "continuous",
    unit: "pg/mL",
  },
  {
    id: "prot_hba1c_pct",
    label: "HbA1c",
    kind: "continuous",
    unit: "%",
  },

  // Clinical (carried as donor-level demographics, not measurements)
  // — see Subject.demographics. We expose these as variables for the
  // ΩF pillar derivation but materialise them as t=0 measurements so
  // the algorithm layer treats them uniformly.
  {
    id: "clin_age_band",
    label: "Age band",
    kind: "discrete",
    unit: "0=child, 1=adolescent, 2=young-adult, 3=adult, 4=older-adult",
  },
  {
    id: "clin_t1d_duration_years",
    label: "T1D duration",
    kind: "continuous",
    unit: "years",
  },
  {
    id: "clin_autoantibody_count",
    label: "Autoantibody positivity count",
    kind: "discrete",
    unit: "0–4 (GAD65, IA-2, ZnT8, IAA)",
  },
];

// ─── Stratum-specific feature distributions ─────────────────────────
//
// Mean and stddev per (stratum, variable). Sampler clips to plausible
// bounds (e.g. percentages stay in [0, 100], counts stay non-negative).

interface FeatureDist {
  mean: number;
  sd: number;
  /** Clamp sampled value to [min, max]. */
  min?: number;
  max?: number;
  /** Round sampled value to nearest integer (for ordinal/count variables). */
  integer?: boolean;
}

type StratumDist = Record<string, FeatureDist>;

const DISTS: Record<NpodStratum, StratumDist> = {
  HC: {
    histo_insulitis_grade: { mean: 0.0, sd: 0.1, min: 0, max: 4, integer: true },
    histo_beta_cell_mass_pct: { mean: 70, sd: 6, min: 30, max: 95 },
    histo_islet_count: { mean: 800, sd: 120, min: 100, max: 1500, integer: true },
    scrna_alpha_pct: { mean: 0.30, sd: 0.04, min: 0.05, max: 0.6 },
    scrna_beta_pct: { mean: 0.55, sd: 0.04, min: 0.05, max: 0.85 },
    scrna_delta_pct: { mean: 0.05, sd: 0.01, min: 0.01, max: 0.15 },
    scrna_immune_pct: { mean: 0.02, sd: 0.01, min: 0.0, max: 0.25 },
    scrna_exocrine_pct: { mean: 0.08, sd: 0.02, min: 0.0, max: 0.3 },
    prot_c_peptide_pmol_per_mL: { mean: 1.2, sd: 0.25, min: 0.05, max: 3.0 },
    prot_gad65_titer: { mean: 1.5, sd: 0.6, min: 0, max: 50 },
    prot_ia2_titer: { mean: 0.8, sd: 0.4, min: 0, max: 50 },
    prot_znt8_titer: { mean: 0.6, sd: 0.3, min: 0, max: 50 },
    prot_ifn_gamma_pg_per_mL: { mean: 4.0, sd: 1.5, min: 0, max: 100 },
    prot_il6_pg_per_mL: { mean: 2.5, sd: 1.0, min: 0, max: 100 },
    prot_hba1c_pct: { mean: 5.4, sd: 0.3, min: 4.0, max: 9.0 },
    clin_age_band: { mean: 2.5, sd: 1.1, min: 0, max: 4, integer: true },
    clin_t1d_duration_years: { mean: 0, sd: 0, min: 0, max: 0 },
    clin_autoantibody_count: { mean: 0, sd: 0, min: 0, max: 4, integer: true },
  },
  "AAB+": {
    histo_insulitis_grade: { mean: 0.5, sd: 0.5, min: 0, max: 4, integer: true },
    histo_beta_cell_mass_pct: { mean: 60, sd: 8, min: 20, max: 90 },
    histo_islet_count: { mean: 720, sd: 130, min: 100, max: 1500, integer: true },
    scrna_alpha_pct: { mean: 0.32, sd: 0.05, min: 0.05, max: 0.6 },
    scrna_beta_pct: { mean: 0.48, sd: 0.06, min: 0.05, max: 0.8 },
    scrna_delta_pct: { mean: 0.05, sd: 0.015, min: 0.01, max: 0.15 },
    scrna_immune_pct: { mean: 0.06, sd: 0.03, min: 0.005, max: 0.4 },
    scrna_exocrine_pct: { mean: 0.09, sd: 0.025, min: 0.0, max: 0.3 },
    prot_c_peptide_pmol_per_mL: { mean: 1.0, sd: 0.3, min: 0.05, max: 3.0 },
    prot_gad65_titer: { mean: 35, sd: 18, min: 0, max: 200 },
    prot_ia2_titer: { mean: 22, sd: 14, min: 0, max: 200 },
    prot_znt8_titer: { mean: 18, sd: 12, min: 0, max: 200 },
    prot_ifn_gamma_pg_per_mL: { mean: 8.0, sd: 3.0, min: 0, max: 100 },
    prot_il6_pg_per_mL: { mean: 4.5, sd: 2.0, min: 0, max: 100 },
    prot_hba1c_pct: { mean: 5.7, sd: 0.4, min: 4.0, max: 9.0 },
    clin_age_band: { mean: 1.6, sd: 1.0, min: 0, max: 4, integer: true },
    clin_t1d_duration_years: { mean: 0, sd: 0, min: 0, max: 0 },
    clin_autoantibody_count: { mean: 2.2, sd: 1.0, min: 1, max: 4, integer: true },
  },
  NEW_ONSET: {
    histo_insulitis_grade: { mean: 2.6, sd: 0.7, min: 0, max: 4, integer: true },
    histo_beta_cell_mass_pct: { mean: 25, sd: 8, min: 1, max: 60 },
    histo_islet_count: { mean: 500, sd: 140, min: 50, max: 1200, integer: true },
    scrna_alpha_pct: { mean: 0.42, sd: 0.06, min: 0.05, max: 0.7 },
    scrna_beta_pct: { mean: 0.20, sd: 0.06, min: 0.0, max: 0.6 },
    scrna_delta_pct: { mean: 0.06, sd: 0.015, min: 0.01, max: 0.15 },
    scrna_immune_pct: { mean: 0.22, sd: 0.07, min: 0.05, max: 0.5 },
    scrna_exocrine_pct: { mean: 0.10, sd: 0.025, min: 0.0, max: 0.3 },
    prot_c_peptide_pmol_per_mL: { mean: 0.45, sd: 0.20, min: 0.02, max: 1.5 },
    prot_gad65_titer: { mean: 90, sd: 35, min: 5, max: 300 },
    prot_ia2_titer: { mean: 60, sd: 28, min: 0, max: 300 },
    prot_znt8_titer: { mean: 45, sd: 22, min: 0, max: 300 },
    prot_ifn_gamma_pg_per_mL: { mean: 22.0, sd: 7.0, min: 0, max: 200 },
    prot_il6_pg_per_mL: { mean: 12.0, sd: 4.5, min: 0, max: 200 },
    prot_hba1c_pct: { mean: 7.8, sd: 1.0, min: 5.5, max: 14.0 },
    clin_age_band: { mean: 1.4, sd: 1.0, min: 0, max: 4, integer: true },
    clin_t1d_duration_years: { mean: 0.5, sd: 0.25, min: 0.05, max: 1.0 },
    clin_autoantibody_count: { mean: 3.0, sd: 0.8, min: 1, max: 4, integer: true },
  },
  LONG_DURATION: {
    histo_insulitis_grade: { mean: 0.6, sd: 0.6, min: 0, max: 4, integer: true },
    histo_beta_cell_mass_pct: { mean: 8, sd: 4, min: 0, max: 25 },
    histo_islet_count: { mean: 380, sd: 110, min: 30, max: 1000, integer: true },
    scrna_alpha_pct: { mean: 0.55, sd: 0.06, min: 0.1, max: 0.85 },
    scrna_beta_pct: { mean: 0.05, sd: 0.03, min: 0.0, max: 0.3 },
    scrna_delta_pct: { mean: 0.07, sd: 0.02, min: 0.01, max: 0.15 },
    scrna_immune_pct: { mean: 0.04, sd: 0.02, min: 0.005, max: 0.25 },
    scrna_exocrine_pct: { mean: 0.12, sd: 0.03, min: 0.0, max: 0.3 },
    prot_c_peptide_pmol_per_mL: { mean: 0.10, sd: 0.07, min: 0.0, max: 0.6 },
    prot_gad65_titer: { mean: 28, sd: 16, min: 0, max: 300 },
    prot_ia2_titer: { mean: 18, sd: 12, min: 0, max: 300 },
    prot_znt8_titer: { mean: 12, sd: 9, min: 0, max: 300 },
    prot_ifn_gamma_pg_per_mL: { mean: 6.5, sd: 2.5, min: 0, max: 100 },
    prot_il6_pg_per_mL: { mean: 4.0, sd: 1.6, min: 0, max: 100 },
    prot_hba1c_pct: { mean: 7.2, sd: 0.9, min: 5.5, max: 12.0 },
    clin_age_band: { mean: 3.0, sd: 1.0, min: 0, max: 4, integer: true },
    clin_t1d_duration_years: { mean: 22, sd: 10, min: 10, max: 60 },
    clin_autoantibody_count: { mean: 1.8, sd: 1.0, min: 0, max: 4, integer: true },
  },
};

// ─── Sampling ────────────────────────────────────────────────────────

/**
 * Linear congruential generator — deterministic on the seed so the
 * fixture is reproducible. Returns U(-1, 1).
 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

/** Box-Muller using a U(-1,1) source: returns a single N(0,1) sample. */
function gaussFrom(rand: () => number): () => number {
  let cached: number | null = null;
  return () => {
    if (cached !== null) {
      const v = cached;
      cached = null;
      return v;
    }
    let u: number;
    let v: number;
    let s = 0;
    do {
      u = rand();
      v = rand();
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    cached = v * factor;
    return u * factor;
  };
}

function sampleFeature(d: FeatureDist, gauss: () => number): number {
  let v = d.mean + d.sd * gauss();
  if (typeof d.min === "number") v = Math.max(d.min, v);
  if (typeof d.max === "number") v = Math.min(d.max, v);
  if (d.integer) v = Math.round(v);
  return v;
}

/**
 * scRNA proportions must sum to 1 per donor. Sample each independently
 * then renormalize across the five cell-type variables.
 */
const SCRNA_VARS = [
  "scrna_alpha_pct",
  "scrna_beta_pct",
  "scrna_delta_pct",
  "scrna_immune_pct",
  "scrna_exocrine_pct",
];

function sampleSubject(
  stratum: NpodStratum,
  index: number,
  gauss: () => number,
): Subject {
  const dist = DISTS[stratum];
  const measurements: { variableId: string; t: number; value: number }[] = [];
  const scrnaRaw: Record<string, number> = {};

  for (const v of NPOD_VARIABLES) {
    const d = dist[v.id];
    if (!d) continue;
    const sampled = sampleFeature(d, gauss);
    if (SCRNA_VARS.includes(v.id)) {
      scrnaRaw[v.id] = Math.max(0, sampled); // hold for renormalisation
    } else {
      measurements.push({ variableId: v.id, t: 0, value: sampled });
    }
  }

  // Renormalise scRNA proportions to sum to 1.
  const scrnaSum = Object.values(scrnaRaw).reduce((a, b) => a + b, 0);
  for (const id of SCRNA_VARS) {
    const v = scrnaSum > 0 ? scrnaRaw[id] / scrnaSum : 0;
    measurements.push({ variableId: id, t: 0, value: v });
  }

  // Synthetic donor id — opaque, deterministic on (stratum, index).
  const donorId = `npod-syn-${stratum.toLowerCase().replace(/[^a-z]/g, "")}-${String(index).padStart(3, "0")}`;

  return {
    id: donorId,
    demographics: {
      stratum,
      stratum_label: STRATUM_LABELS[stratum],
    },
    measurements,
  };
}

// ─── Public entry point ──────────────────────────────────────────────

export interface NpodCohortOptions {
  /** Donors per stratum. Default 30 → 120 total. */
  donorsPerStratum?: number;
  /** Deterministic seed. Default 0xN1POD. */
  seed?: number;
  /** Override cohort id. */
  cohortId?: string;
  /** Override ingestedAt timestamp. */
  ingestedAt?: string;
}

/**
 * Build the synthetic nPOD-shaped cohort. Returns a Cohort whose shape
 * is identical to anything an ingester would produce, so the algorithm
 * + UI layers see no difference between this fixture and a real
 * ingested dataset.
 */
export function buildNpodSyntheticCohort(
  options: NpodCohortOptions = {},
): Cohort {
  const donorsPerStratum = options.donorsPerStratum ?? 30;
  const seed = options.seed ?? DEFAULT_SEED;
  const rand = lcg(seed);
  const gauss = gaussFrom(rand);

  const subjects: Subject[] = [];
  let counter = 0;
  for (const stratum of STRATA) {
    for (let i = 0; i < donorsPerStratum; i++) {
      subjects.push(sampleSubject(stratum, counter++, gauss));
    }
  }

  return {
    id: options.cohortId ?? "npod-synthetic-2026-05",
    label:
      "Synthetic nPOD-shaped cohort — 4 disease-stage strata, multi-modal features",
    source: {
      adapter: "npod-synthetic-fixture",
      adapterVersion: "0.1.0",
      ingestedAt: options.ingestedAt ?? "2026-05-02T00:00:00Z",
      containsPHI: false,
    },
    variables: NPOD_VARIABLES,
    subjects,
    timeAxis: {
      zeroConvention: "donor-cross-section",
      displayUnit: "seconds",
    },
    metadata: {
      description:
        "Deterministic synthetic cohort for the Manifold scientist-mode " +
        "Tissue Cohort view. Stratum structure and feature distributions " +
        "are modelled on the canonical nPOD donor categories so the " +
        "scientist-mode UI has something realistic to render before any " +
        "real DAC-approved nPOD partnership lands. NOT REAL DATA — see " +
        "the SYNTHETIC banner in the rendering view.",
      accessTier: "public",
    },
  };
}

// ─── Stable default seed (avoids magic-number drift across call sites) ──

const DEFAULT_SEED = 314159;
