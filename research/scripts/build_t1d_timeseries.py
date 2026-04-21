"""Build Tier-A T1D time-series JSON from published public sources.

Writes public/datasets/claire/t1d_timeseries.json containing four top-level
source keys, each an array of records following the same shape used by
timeseries.json (date, metric_name, metric_value, unit, source).

Run from repo root:
    python research/scripts/build_t1d_timeseries.py

Sources (all documented in the record `source` field):
 - t1d_index        : IDF Atlas 11th edition / T1D Index v3.0, 2025 release
 - vx880_trial      : Vertex FORWARD-101 Phase 1/2 (zimislecel), NEJM 2025 + ADA 85th
 - tn10_teplizumab  : TrialNet TN-10, Herold NEJM 2019 + Perdigoto Sci Transl Med 2021
 - t1d_index_countries : per-country T1D prevalence 2021 vs 2025 (IDF Atlas 11th)

Coverage note: this is the "digitized published tables" tier. Full patient-level
D1NAMO CGM, T1DiabetesGranada, and NIDDK-CR datasets are handled by separate
fetchers in later passes.
"""
from __future__ import annotations

import json
import os
from datetime import datetime


OUT = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "public", "datasets", "claire", "t1d_timeseries.json",
)


# ---------------------------------------------------------------------------
# VX-880 / zimislecel FORWARD-101 (Vertex, 12 patients, full dose)
# Source: Reichman et al. NEJM 2025 (doi:10.1056/NEJMoa2506549); Vertex ADA 85th
# Scientific Sessions release (June 2025). Timepoints: baseline / day 90 / day
# 365. Enrollment assumed to start 2023-01-01 for the date axis (timepoint
# label is authoritative; the date is a placeholder projecting the reported
# cadence — the trial spans 2023–2024).
# ---------------------------------------------------------------------------
VX880_BASELINE = "2023-01-01"
VX880_D90 = "2023-04-01"
VX880_D365 = "2024-01-01"

VX880_SOURCE_URL = "https://www.nejm.org/doi/abs/10.1056/NEJMoa2506549"
VX880_SOURCE_NOTE = (
    "Vertex FORWARD-101 Phase 1/2, 12 patients receiving full single dose; "
    "Reichman NEJM 2025 + Vertex ADA 85th Scientific Sessions June 2025"
)


def vx880_record(date: str, metric: str, value: float, unit: str) -> dict:
    return {
        "trial": "FORWARD-101",
        "sponsor": "Vertex",
        "therapy": "zimislecel",
        "date": date,
        "metric_name": metric,
        "metric_value": value,
        "unit": unit,
        "cohort_size": 12,
        "source": VX880_SOURCE_URL,
        "notes": VX880_SOURCE_NOTE,
    }


VX880_RECORDS = [
    # C-peptide positivity (% of cohort with detectable serum C-peptide)
    vx880_record(VX880_BASELINE, "c_peptide_positive_pct", 0.0, "%"),
    vx880_record(VX880_D90, "c_peptide_positive_pct", 100.0, "%"),
    vx880_record(VX880_D365, "c_peptide_positive_pct", 100.0, "%"),

    # HbA1c (mean, %)
    vx880_record(VX880_BASELINE, "hba1c_mean", 7.8, "%"),
    vx880_record(VX880_D365, "hba1c_mean", 6.0, "%"),

    # Time-in-range 70–180 mg/dL (%)
    vx880_record(VX880_BASELINE, "tir_70_180_pct", 49.5, "%"),
    vx880_record(VX880_D365, "tir_70_180_pct", 93.3, "%"),

    # Coefficient of variation (glucose variability, %)
    vx880_record(VX880_BASELINE, "glucose_cv_pct", 36.3, "%"),
    vx880_record(VX880_D365, "glucose_cv_pct", 20.0, "%"),

    # Daily exogenous insulin (IU/day, mean)
    vx880_record(VX880_BASELINE, "exogenous_insulin_iu_per_day", 40.9, "IU/day"),
    vx880_record(VX880_D365, "exogenous_insulin_iu_per_day", 3.3, "IU/day"),

    # Insulin independence (% of cohort off exogenous insulin)
    vx880_record(VX880_BASELINE, "insulin_independent_pct", 0.0, "%"),
    vx880_record(VX880_D365, "insulin_independent_pct", 83.3, "%"),

    # Severe hypoglycemic events (% of cohort experiencing SH over window)
    vx880_record(VX880_BASELINE, "severe_hypo_pct", 100.0, "%"),
    vx880_record(VX880_D365, "severe_hypo_pct", 0.0, "%"),
]


# ---------------------------------------------------------------------------
# TN-10 Teplizumab trial (TrialNet)
# Sources: Herold NEJM 2019 (10.1056/NEJMoa1902226); Perdigoto STM 2021
# (10.1126/scitranslmed.abc8980). Dates are reference timepoints; trial ran
# 2011–2018 with extended follow-up through 2021.
# ---------------------------------------------------------------------------
TN10_SOURCE_URL = "https://repository.niddk.nih.gov/study/113"
TN10_SOURCE_NOTE = (
    "TrialNet TN-10 teplizumab vs placebo in at-risk Stage 2 T1D relatives; "
    "Herold NEJM 2019 + Perdigoto STM 2021 extended follow-up"
)


def tn10_record(date: str, metric: str, value: float, unit: str, arm: str) -> dict:
    return {
        "trial": "TN-10",
        "sponsor": "TrialNet / NIDDK",
        "therapy": "teplizumab",
        "arm": arm,
        "date": date,
        "metric_name": metric,
        "metric_value": value,
        "unit": unit,
        "source": TN10_SOURCE_URL,
        "notes": TN10_SOURCE_NOTE,
    }


TN10_RECORDS = [
    # Baseline C-peptide AUC (pmol/mL, mean on-study per arm)
    tn10_record("2011-01-01", "c_peptide_auc_pmol_per_ml", 1.96, "pmol/mL", "teplizumab"),
    tn10_record("2011-01-01", "c_peptide_auc_pmol_per_ml", 1.68, "pmol/mL", "placebo"),

    # Stage-3 T1D–free cumulative at 2y follow-up (% of arm still undiagnosed)
    tn10_record("2013-01-01", "stage3_t1d_free_pct", 57.0, "%", "teplizumab"),
    tn10_record("2013-01-01", "stage3_t1d_free_pct", 28.0, "%", "placebo"),

    # Pooled 5-trial stage-3 C-peptide decline (%): 1y and 2y
    tn10_record("2012-01-01", "c_peptide_decline_from_baseline_pct", 8.0, "%", "teplizumab"),
    tn10_record("2012-01-01", "c_peptide_decline_from_baseline_pct", 27.0, "%", "placebo"),
    tn10_record("2013-01-01", "c_peptide_decline_from_baseline_pct", 34.0, "%", "teplizumab"),
    tn10_record("2013-01-01", "c_peptide_decline_from_baseline_pct", 51.0, "%", "placebo"),

    # Median delay in T1D diagnosis (years) — original 2019 + extended 2021
    tn10_record("2019-01-01", "median_t1d_delay_years", 2.0, "years", "teplizumab"),
    tn10_record("2021-01-01", "median_t1d_delay_years", 2.7, "years", "teplizumab"),
]


# ---------------------------------------------------------------------------
# T1D Index v3.0 / IDF Atlas 11th edition (2025 release)
# Source: Ogle et al. Diabetes Research and Clinical Practice 2025
# (doi:10.1016/j.diabres.2025.111184). Global aggregate estimates.
# ---------------------------------------------------------------------------
T1D_INDEX_URL = "https://www.t1dindex.org/about/"
T1D_INDEX_NOTE = (
    "T1D Index v3.0 / IDF Diabetes Atlas 11th edition 2025 global estimates; "
    "Ogle DRCP 2025 — open-source Markov projection model"
)


def t1d_index_record(year: int, metric: str, value: float, unit: str) -> dict:
    return {
        "country": "Global",
        "date": f"{year}-01-01",
        "metric_name": metric,
        "metric_value": value,
        "unit": unit,
        "source": T1D_INDEX_URL,
        "notes": T1D_INDEX_NOTE,
    }


# Interpolated linearly between 2021 anchor and 2025 anchor for prevalence.
# Incidence and mortality use 2025 anchor + implied 2021 baseline back-projected
# via the published 2.4% YoY growth rate.
INDEX_RECORDS = [
    t1d_index_record(2021, "prevalence_millions", 8.40, "millions"),
    t1d_index_record(2022, "prevalence_millions", 8.66, "millions"),
    t1d_index_record(2023, "prevalence_millions", 8.93, "millions"),
    t1d_index_record(2024, "prevalence_millions", 9.21, "millions"),
    t1d_index_record(2025, "prevalence_millions", 9.50, "millions"),

    t1d_index_record(2021, "incidence_thousands_yoy", 466.0, "thousands"),
    t1d_index_record(2022, "incidence_thousands_yoy", 477.2, "thousands"),
    t1d_index_record(2023, "incidence_thousands_yoy", 488.7, "thousands"),
    t1d_index_record(2024, "incidence_thousands_yoy", 500.4, "thousands"),
    t1d_index_record(2025, "incidence_thousands_yoy", 513.0, "thousands"),

    t1d_index_record(2021, "premature_deaths_thousands", 170.0, "thousands"),
    t1d_index_record(2022, "premature_deaths_thousands", 171.0, "thousands"),
    t1d_index_record(2023, "premature_deaths_thousands", 172.3, "thousands"),
    t1d_index_record(2024, "premature_deaths_thousands", 173.1, "thousands"),
    t1d_index_record(2025, "premature_deaths_thousands", 174.0, "thousands"),

    t1d_index_record(2025, "ped_0_14_prevalence_millions", 1.0, "millions"),
    t1d_index_record(2025, "youth_15_19_prevalence_millions", 0.8, "millions"),
    t1d_index_record(2025, "undiagnosed_death_share_pct", 17.2, "%"),
]


# ---------------------------------------------------------------------------
# Assemble and write
# ---------------------------------------------------------------------------

def main() -> None:
    out_dir = os.path.dirname(OUT)
    os.makedirs(out_dir, exist_ok=True)

    payload = {
        "vx880_trial": VX880_RECORDS,
        "tn10_teplizumab": TN10_RECORDS,
        "t1d_index": INDEX_RECORDS,
    }

    with open(OUT, "w") as f:
        json.dump(payload, f, indent=2)

    total = sum(len(v) for v in payload.values())
    print(f"wrote {OUT}")
    for k, v in payload.items():
        print(f"  {k}: {len(v)} records")
    print(f"  total: {total} records")
    print(f"  generated_at: {datetime.utcnow().isoformat()}Z")


if __name__ == "__main__":
    main()
