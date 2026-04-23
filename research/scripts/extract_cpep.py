"""Extract C-peptide MMTT β-cell-function trajectory by disease duration.

JAEB C-PEP public dataset: 4-year MMTT follow-up of T1D patients with variable
years-since-diagnosis at baseline. We compute stimulated C-peptide AUC over
0/30/60/90/120 min per (PtID, Visit), resolve each visit to years-since-Dx,
bin into disease-duration buckets, and emit median/q25/q75/n per bin.

Output shape follows public/datasets/claire/t1d_timeseries.json — a new source
key `jaeb_cpep` containing records with the same
{date, metric_name, metric_value, unit, cohort_size, source, notes} shape used
by the existing vx880_trial / tn10_teplizumab / t1d_index sources.

Synthetic dates: disease-duration bin midpoint (years) → 2020-01-01 + floor
year offset. This lets the existing loader render the series on a chronological
axis without app-layer changes. Years-since-Dx is the real semantic — the date
is just a rendering handle.

Small-cell suppression: bins with n<5 are dropped entirely.

Below-LOD values (`<0.017`) are imputed at LOD/2 = 0.0085 nmol/L (standard for
censored clinical assays).

Run from repo root:
    python research/scripts/extract_cpep.py
"""
from __future__ import annotations

import glob
import json
import os
import re
import zipfile
from typing import Any

import numpy as np
import pandas as pd


CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "_cache", "jaeb")
OUT = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "public", "datasets", "claire", "cpep_cohort.json",
)

SOURCE_URL = "https://public.jaeb.org/dataset/538"
SOURCE_NOTE = (
    "JAEB C-PEP public dataset: 4-year MMTT follow-up of T1D patients; "
    "stimulated C-peptide AUC over 0/30/60/90/120 min, stratified by "
    "years-since-diagnosis at visit"
)

LOD_STRING_RE = re.compile(r"^\s*<\s*([0-9.]+)\s*$")

# Disease-duration bins: [lo, hi) in years
BINS: list[tuple[float, float, str]] = [
    (0.0, 1.0, "0-1y"),
    (1.0, 2.0, "1-2y"),
    (2.0, 3.0, "2-3y"),
    (3.0, 5.0, "3-5y"),
    (5.0, 10.0, "5-10y"),
    (10.0, float("inf"), "10y+"),
]

MIN_N = 5  # small-cell suppression
MMTT_TIMEPOINTS = [0, 30, 60, 90, 120]


def _parse_value(v: Any) -> float | None:
    """Parse C-peptide value; treat `<X` as LOD/2, NaN as None."""
    if pd.isna(v):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    m = LOD_STRING_RE.match(s)
    if m:
        return float(m.group(1)) / 2.0
    try:
        return float(s)
    except ValueError:
        return None


def _auc_trapezoidal(tp_to_val: dict[int, float]) -> float | None:
    """Trapezoidal AUC over 0/30/60/90/120 min. Needs at least 3 of 5 points."""
    pairs = sorted(
        (tp, v) for tp, v in tp_to_val.items() if tp in MMTT_TIMEPOINTS and v is not None
    )
    if len(pairs) < 3:
        return None
    times = [p[0] for p in pairs]
    vals = [p[1] for p in pairs]
    return float(np.trapezoid(vals, times))


def _find_cpep_zip() -> str:
    matches = glob.glob(os.path.join(CACHE_DIR, "C-PEP-*.zip"))
    if not matches:
        raise FileNotFoundError(f"No C-PEP zip in {CACHE_DIR}")
    return matches[0]


def _load_tables(zip_path: str) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    with zipfile.ZipFile(zip_path) as zf:
        for member, key in [
            ("Data Tables/ACPepPtRoster.txt", "roster"),
            ("Data Tables/ACPepSampleResults.txt", "samples"),
            ("Data Tables/ACPepInitMMTT.txt", "init_mmtt"),
            ("Data Tables/ACPepFUMMTT.txt", "fu_mmtt"),
        ]:
            with zf.open(member) as f:
                out[key] = pd.read_csv(f, sep="|")
    return out


def _visit_dates(init: pd.DataFrame, fu: pd.DataFrame) -> pd.DataFrame:
    """Return (PtID, Visit, MMTTTestDtDaysFromConsent) long frame."""
    init_vis = init[["PtID", "MMTTTestDtDaysFromConsent"]].copy()
    init_vis["Visit"] = "Initial MMTT"
    fu_vis = fu[["PtID", "Visit", "MMTTTestDtDaysFromConsent"]].copy()
    combined = pd.concat([init_vis, fu_vis], ignore_index=True)
    # drop rows with no visit date
    return combined.dropna(subset=["MMTTTestDtDaysFromConsent"])


def _compute_visit_aucs(
    samples: pd.DataFrame, visits: pd.DataFrame, roster: pd.DataFrame,
) -> pd.DataFrame:
    """Return long frame: (PtID, Visit, years_since_dx, auc_nmol_min_per_L)."""
    cpep = samples[samples["Analyte"] == "CPEP"].copy()
    cpep["value_num"] = cpep["Value"].apply(_parse_value)
    cpep = cpep.dropna(subset=["value_num", "Timepoint"])
    cpep["Timepoint"] = cpep["Timepoint"].astype(int)

    # Pivot to (PtID, Visit) × Timepoint
    auc_rows: list[dict[str, Any]] = []
    for (pt, visit), grp in cpep.groupby(["PtID", "Visit"]):
        tp_to_val = dict(zip(grp["Timepoint"], grp["value_num"]))
        auc = _auc_trapezoidal(tp_to_val)
        if auc is None:
            continue
        auc_rows.append({"PtID": pt, "Visit": visit, "auc_nmol_min_per_L": auc})
    auc_df = pd.DataFrame(auc_rows)
    if auc_df.empty:
        return auc_df

    # Join visit date
    auc_df = auc_df.merge(visits, on=["PtID", "Visit"], how="inner")
    # Join roster for Dx date
    auc_df = auc_df.merge(
        roster[["PtID", "T1DDiagDtDaysFromConsent"]], on="PtID", how="inner",
    )
    # years_since_dx = (days from Dx to consent) + (days from consent to visit) / 365.25
    # T1DDiagDtDaysFromConsent is negative (Dx before consent)
    auc_df["days_since_dx"] = (
        auc_df["MMTTTestDtDaysFromConsent"] - auc_df["T1DDiagDtDaysFromConsent"]
    )
    auc_df["years_since_dx"] = auc_df["days_since_dx"] / 365.25
    # Guard against nonsensical negatives (shouldn't happen given sign convention)
    auc_df = auc_df[auc_df["years_since_dx"] >= 0]
    return auc_df


def _assign_bin(y: float) -> str | None:
    for lo, hi, label in BINS:
        if lo <= y < hi:
            return label
    return None


def _bin_midpoint_year(label: str) -> int:
    """Map bin label → synthetic year offset for rendering (0=2020)."""
    for i, (_, _, lbl) in enumerate(BINS):
        if lbl == label:
            return i  # 0,1,2,3,4,5 → 2020..2025
    return 0


def _aggregate(auc_df: pd.DataFrame) -> list[dict[str, Any]]:
    """Aggregate by bin, emit cpep_cohort records."""
    auc_df["bin"] = auc_df["years_since_dx"].apply(_assign_bin)
    auc_df = auc_df.dropna(subset=["bin"])

    records: list[dict[str, Any]] = []
    for bin_label, grp in auc_df.groupby("bin", sort=False):
        n = len(grp)
        if n < MIN_N:
            continue
        year_offset = _bin_midpoint_year(bin_label)
        date_iso = f"{2020 + year_offset:04d}-01-01"
        median = float(grp["auc_nmol_min_per_L"].median())
        q25 = float(grp["auc_nmol_min_per_L"].quantile(0.25))
        q75 = float(grp["auc_nmol_min_per_L"].quantile(0.75))
        base = {
            "trial": "JAEB C-PEP",
            "sponsor": "JAEB / T1D Exchange",
            "therapy": "standard of care",
            "date": date_iso,
            "unit": "nmol/L·min",
            "cohort_size": int(n),
            "bin_years_since_dx": bin_label,
            "source": SOURCE_URL,
            "notes": SOURCE_NOTE,
        }
        for metric_name, value in [
            ("cpep_mmtt_auc_median", round(median, 4)),
            ("cpep_mmtt_auc_q25", round(q25, 4)),
            ("cpep_mmtt_auc_q75", round(q75, 4)),
        ]:
            records.append({**base, "metric_name": metric_name, "metric_value": value})
    return records


def main() -> int:
    zip_path = _find_cpep_zip()
    print(f"[cpep] reading {os.path.basename(zip_path)}")
    tables = _load_tables(zip_path)
    visits = _visit_dates(tables["init_mmtt"], tables["fu_mmtt"])
    auc_df = _compute_visit_aucs(tables["samples"], visits, tables["roster"])
    print(f"[cpep] {len(auc_df)} visit-level AUCs after join")
    if auc_df.empty:
        print("[cpep] no rows to aggregate — aborting")
        return 1

    # Distribution summary for sanity
    by_bin = auc_df.assign(bin=auc_df["years_since_dx"].apply(_assign_bin)) \
        .groupby("bin").size().reindex([b[2] for b in BINS], fill_value=0)
    print("[cpep] visit counts per disease-duration bin:")
    for b, n in by_bin.items():
        print(f"    {b:6s}  n={n}")

    records = _aggregate(auc_df)
    payload = {
        "source_key": "jaeb_cpep",
        "source_url": SOURCE_URL,
        "license_note": (
            "JAEB Open Data License: aggregate-only derivatives may be "
            "redistributed; raw patient-level data may not. This file contains "
            "bin-level medians/quantiles only (n>=5 per bin)."
        ),
        "records": records,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"[cpep] wrote {len(records)} aggregate records to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
