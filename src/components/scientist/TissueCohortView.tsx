"use client";

import { useMemo, useState } from "react";
import {
  buildNpodSyntheticCohort,
  STRATA,
  STRATUM_LABELS,
  STRATUM_DESCRIPTIONS,
  type NpodStratum,
} from "@/lib/discovery/fixtures/npod-synthetic-cohort";
import type { Cohort, Subject } from "@/lib/discovery/cohort-types";
import CapabilityBadge from "../CapabilityBadge";

// ─── TissueCohortView ────────────────────────────────────────────────
//
// Scientist-mode-only panel that renders the synthetic nPOD-shaped
// cohort as a stratum-stratified Ω-fragility readout. The demo story
// is visible by switching strata: β-cell reserve drops monotonically
// HC → AAB+ → NEW_ONSET → LONG_DURATION, and the junction pillar
// (immune-metabolic coupling) peaks at NEW_ONSET then COLLAPSES at
// LONG_DURATION because there is no β-mass left to couple to.
//
// HONEST FRAMING — visible in the synthetic banner. The cohort and
// the pillar formulas are *illustrative*. The real deal happens when
// nPOD DAC access lands and the same view consumes a real cohort.

// ─── Pillar derivation (illustrative) ────────────────────────────────
//
// Pillar values are 0-10 fragility scores derived from per-stratum
// summaries of the cohort. Higher = more fragile. Formulas are
// deliberately simple so the visible patterns map cleanly to the
// underlying biology:
//
//   I (Interaction)        autoantibody count + immune signal variance
//   R (Reserve)            inverse of β-cell mass + C-peptide
//   J (Junction)           immune × insulitis coupling intensity
//   C (Cascade)            inflammatory burden (IFN-γ + IL-6)
//   T (Temporal)           hazard of progression / duration

interface PillarSet {
  I: number;
  R: number;
  J: number;
  C: number;
  T: number;
}

function meanOf(
  subjects: readonly Subject[],
  variableId: string,
): number {
  let sum = 0;
  let count = 0;
  for (const subj of subjects) {
    for (const m of subj.measurements) {
      if (m.variableId === variableId && typeof m.value === "number") {
        sum += m.value;
        count += 1;
      }
    }
  }
  return count === 0 ? 0 : sum / count;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(10, x));
}

function pillarsForStratum(
  stratum: NpodStratum,
  donors: readonly Subject[],
): PillarSet {
  const meanAab = meanOf(donors, "clin_autoantibody_count"); // 0-4
  const meanBetaMass = meanOf(donors, "histo_beta_cell_mass_pct"); // 0-100
  const meanCPep = meanOf(donors, "prot_c_peptide_pmol_per_mL"); // ~0-1.5
  const meanImmune = meanOf(donors, "scrna_immune_pct"); // ~0-0.4
  const meanInsulitis = meanOf(donors, "histo_insulitis_grade"); // 0-4
  const meanIfn = meanOf(donors, "prot_ifn_gamma_pg_per_mL"); // ~0-30
  const meanIl6 = meanOf(donors, "prot_il6_pg_per_mL"); // ~0-15
  const meanDuration = meanOf(donors, "clin_t1d_duration_years"); // 0-30+

  // I: autoab burden + tissue-immune signal (0-10).
  const I = clamp01((meanAab / 4) * 7 + meanImmune * 7.5);

  // R: low β-mass + low C-peptide → high fragility.
  const reserveProxy = (meanBetaMass / 70) * 0.6 + (meanCPep / 1.2) * 0.4;
  const R = clamp01((1 - reserveProxy) * 10);

  // J: immune × insulitis coupling, scaled. Naturally collapses at
  // long-duration because immune_pct drops once mass is gone.
  const J = clamp01(meanImmune * meanInsulitis * 8);

  // C: inflammatory cascade burden.
  const C = clamp01((meanIfn / 22) * 6 + (meanIl6 / 12) * 4);

  // T: temporal hazard. For non-T1D strata use a fixed pre-progression
  // hazard reflecting risk; for T1D strata use duration-scaled hazard.
  let T: number;
  if (stratum === "HC") T = 1.0;
  else if (stratum === "AAB+") T = 4.0;
  else if (stratum === "NEW_ONSET") T = 5.5;
  else T = clamp01(2.5 + (meanDuration / 30) * 7); // LONG_DURATION

  return { I, R, J, C, T };
}

const PILLAR_LABELS: Record<keyof PillarSet, string> = {
  I: "Interaction",
  R: "Reserve",
  J: "Junction",
  C: "Cascade",
  T: "Temporal",
};

const PILLAR_DESCRIPTIONS: Record<keyof PillarSet, string> = {
  I:
    "Autoantibody burden combined with tissue-immune signal. Captures the upstream interaction substrate.",
  R:
    "Inverse of β-cell mass plus residual C-peptide. Drops monotonically across disease stage as mass is lost.",
  J:
    "Immune × insulitis coupling intensity. Peaks at recent-onset, COLLAPSES at long-duration once β-mass is gone (no substrate left to couple to).",
  C:
    "Inflammatory cascade burden — IFN-γ and IL-6 proxy. Captures cytokine drive on β-cell stress.",
  T:
    "Temporal hazard. For at-risk strata: progression hazard. For established T1D: time-since-onset.",
};

// ─── Component ───────────────────────────────────────────────────────

export default function TissueCohortView() {
  const [active, setActive] = useState<NpodStratum>("HC");
  const [showFormulas, setShowFormulas] = useState(false);

  const cohort: Cohort = useMemo(() => buildNpodSyntheticCohort(), []);
  const donorsByStratum: Record<NpodStratum, Subject[]> = useMemo(() => {
    const out: Record<NpodStratum, Subject[]> = {
      HC: [],
      "AAB+": [],
      NEW_ONSET: [],
      LONG_DURATION: [],
    };
    for (const subj of cohort.subjects) {
      const s = subj.demographics?.stratum as NpodStratum | undefined;
      if (s && s in out) out[s].push(subj);
    }
    return out;
  }, [cohort]);

  const pillarsByStratum: Record<NpodStratum, PillarSet> = useMemo(() => {
    return {
      HC: pillarsForStratum("HC", donorsByStratum.HC),
      "AAB+": pillarsForStratum("AAB+", donorsByStratum["AAB+"]),
      NEW_ONSET: pillarsForStratum("NEW_ONSET", donorsByStratum.NEW_ONSET),
      LONG_DURATION: pillarsForStratum(
        "LONG_DURATION",
        donorsByStratum.LONG_DURATION,
      ),
    };
  }, [donorsByStratum]);

  const activePillars = pillarsByStratum[active];
  const activeDonors = donorsByStratum[active];

  const summary = useMemo(() => {
    const meanDuration = meanOf(activeDonors, "clin_t1d_duration_years");
    const meanAab = meanOf(activeDonors, "clin_autoantibody_count");
    const meanCPep = meanOf(activeDonors, "prot_c_peptide_pmol_per_mL");
    const meanBetaMass = meanOf(activeDonors, "histo_beta_cell_mass_pct");
    return { meanDuration, meanAab, meanCPep, meanBetaMass };
  }, [activeDonors]);

  return (
    <div className="p-4 space-y-3">
      {/* Synthetic banner — load-bearing honesty */}
      <div className="text-[8px] font-mono text-accent-amber/80 leading-relaxed border border-accent-amber/30 bg-accent-amber/5 rounded px-2 py-1.5">
        <strong>SYNTHETIC nPOD-SHAPED DEMO COHORT.</strong>{" "}
        {cohort.subjects.length} donors across 4 disease-stage strata.
        Distributions modelled on canonical nPOD donor categories. No
        real PHI — schema-identical to what a DAC-approved nPOD
        ingester will produce when access lands.
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
            TISSUE COHORT — DISEASE-STAGE STRATA
          </span>
          <CapabilityBadge capability="live-synthetic" />
        </div>
        <button
          type="button"
          onClick={() => setShowFormulas((v) => !v)}
          className="text-[7px] font-mono text-text-muted hover:text-foreground transition-colors"
        >
          {showFormulas ? "hide formulas" : "show formulas"}
        </button>
      </div>

      {/* Stratum selector */}
      <div className="grid grid-cols-2 gap-1.5">
        {STRATA.map((s) => {
          const n = donorsByStratum[s].length;
          const isActive = s === active;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActive(s)}
              className={`text-left text-[8px] font-[family-name:var(--font-michroma)] tracking-wider rounded px-2 py-1 border transition-colors leading-tight ${
                isActive
                  ? "text-[#40c4ff] border-[#40c4ff]/60 bg-[#40c4ff]/10"
                  : "text-text-muted border-border bg-surface-elevated hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              {s.replace(/_/g, " ")}
              <span className="block text-[7px] font-mono mt-0.5">
                n={n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stratum metadata */}
      <div className="border border-border/50 rounded bg-surface-elevated p-2 space-y-1">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
          {STRATUM_LABELS[active]}
        </div>
        <div className="text-[7px] font-mono text-text-muted leading-relaxed">
          {STRATUM_DESCRIPTIONS[active]}
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          <Stat
            label="N DONORS"
            value={String(activeDonors.length)}
          />
          <Stat
            label="MEAN AAB"
            value={summary.meanAab.toFixed(1)}
          />
          <Stat
            label="C-PEP (pmol/mL)"
            value={summary.meanCPep.toFixed(2)}
          />
          <Stat
            label="β-MASS %"
            value={summary.meanBetaMass.toFixed(0)}
          />
        </div>
      </div>

      {/* ΩF pillar bars */}
      <div className="space-y-1.5">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
          Ω-FRAGILITY PILLAR READING
        </div>
        <ul className="space-y-1">
          {(Object.keys(activePillars) as Array<keyof PillarSet>).map(
            (key) => {
              const v = activePillars[key];
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 text-[8px] font-mono"
                  title={PILLAR_DESCRIPTIONS[key]}
                >
                  <span className="w-3 text-foreground">{key}</span>
                  <span className="w-16 text-text-muted truncate">
                    {PILLAR_LABELS[key]}
                  </span>
                  <div className="flex-1 relative h-3 bg-surface-elevated rounded">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-accent-cyan/50 rounded"
                      style={{
                        width: `${(v / 10) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-text-muted text-right">
                    {v.toFixed(1)}
                  </span>
                </li>
              );
            },
          )}
        </ul>
      </div>

      {/* Cross-stratum reserve / junction trajectory — the demo story */}
      <div className="border border-border/50 rounded bg-surface-elevated p-2 space-y-1.5">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
          CROSS-STRATUM TRAJECTORY (R + J)
        </div>
        <div className="text-[7px] font-mono text-text-muted leading-relaxed">
          The two pillars that tell the disease-stage story. R rises
          monotonically (reserve fragility increases as β-mass is lost).
          J peaks at recent-onset and COLLAPSES at long-duration —
          there is no β-mass left for the immune system to couple to.
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {STRATA.map((s) => {
            const p = pillarsByStratum[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActive(s)}
                className={`p-1.5 rounded border bg-surface text-left transition-colors ${
                  s === active
                    ? "border-[#40c4ff]/60"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <div className="text-[7px] font-mono text-text-muted truncate">
                  {s.replace(/_/g, " ")}
                </div>
                <div className="text-[7px] font-mono text-foreground pt-0.5">
                  R={p.R.toFixed(1)}
                </div>
                <div className="text-[7px] font-mono text-foreground">
                  J={p.J.toFixed(1)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional formula reveal */}
      {showFormulas && (
        <div className="border border-accent-amber/20 bg-accent-amber/5 rounded px-2 py-1.5 space-y-0.5">
          <div className="text-[7px] font-mono text-accent-amber/80">
            <strong>Pillar formulas (illustrative).</strong> Real-data deployment
            would replace these with cohort-fit relevance scores per the
            calibration methodology in the Joslin / nPOD briefs.
          </div>
          {(Object.keys(activePillars) as Array<keyof PillarSet>).map(
            (key) => (
              <div
                key={key}
                className="text-[7px] font-mono text-text-muted leading-relaxed"
              >
                <span className="text-foreground">{key}:</span>{" "}
                {PILLAR_DESCRIPTIONS[key]}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-1.5 rounded border border-border bg-surface text-center">
      <div className="text-[7px] font-mono text-text-muted">{label}</div>
      <div className="text-[9px] font-mono text-foreground truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
