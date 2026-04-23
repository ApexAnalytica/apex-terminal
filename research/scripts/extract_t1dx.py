"""Extract T1D Exchange Registry HbA1c trajectory over calendar years by age band.

T1DX Registry has four cross-sectional waves (2010-12, 2015-16, 2016-17, 2017-18)
plus a longitudinal companion. Each wave has its own HbA1c and Subjects tables.
We attribute each wave's HbA1c readings to the wave midpoint calendar year,
stratify by age band at consent, and emit mean/median per (year, age-band).

This is the canonical "T1D Exchange HbA1c-by-age-by-year" view that underlies
the Foster/Miller 2019 and Miller 2023 DRCP papers.

Output shape follows public/datasets/claire/t1d_timeseries.json. Source key:
`t1dx_registry_hba1c`.

Small-cell suppression: n<20 per (year, age-band) is dropped (tighter than C-PEP
since this cohort is larger and group-level disclosure risk is higher).

Run from repo root:
    python research/scripts/extract_t1dx.py
"""
from __future__ import annotations

import glob
import json
import os
import zipfile
from typing import Any

import numpy as np
import pandas as pd


CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "_cache", "jaeb")
OUT = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "public", "datasets", "claire", "t1dx_registry.json",
)

SOURCE_URL = "https://public.jaeb.org/t1dx/stdy"
SOURCE_NOTE = (
    "T1D Exchange Registry: cross-sectional HbA1c by age band, four waves "
    "(2010-12, 2015-16, 2016-17, 2017-18); wave-midpoint calendar year"
)

MIN_N = 20  # tighter than C-PEP; large cohort means group-disclosure risk matters

# Age bands (at wave consent)
AGE_BANDS: list[tuple[float, float, str]] = [
    (0.0, 13.0, "<13"),
    (13.0, 18.0, "13-17"),
    (18.0, 26.0, "18-25"),
    (26.0, 50.0, "26-49"),
    (50.0, float("inf"), "50+"),
]

# Four waves: (hba1c_member, subjects_member, age_col, year_iso_mid)
# Each subject table names the age-at-consent column differently.
WAVES: list[dict[str, str]] = [
    {
        "label": "2010-2012",
        "hba1c": "Registry - Initial Enrollment (2010-2012)/Data Tables/HbA1c.txt",
        "subjects": "Registry - Initial Enrollment (2010-2012)/Data Tables/Subjects.txt",
        "age_col": "AgeAtConsent",
        "year_iso": "2011-07-01",
    },
    {
        "label": "2015-2016",
        "hba1c": "Registry - 2015-2016/Data Tables/HbA1c15-16.txt",
        "subjects": "Registry - 2015-2016/Data Tables/Subjects15-16.txt",
        "age_col": "ageConsent",
        "year_iso": "2016-01-01",
    },
    {
        "label": "2016-2017",
        "hba1c": "Registry - 2016-2017/Data Tables/HbA1c16-17.txt",
        "subjects": "Registry - 2016-2017/Data Tables/Subject16-17.txt",
        "age_col": "ageConsent",
        "year_iso": "2017-01-01",
    },
    {
        "label": "2017-2018",
        "hba1c": "Registry - 2017-2018/Data Tables/HbA1c17-18.txt",
        "subjects": "Registry - 2017-2018/Data Tables/Subject17-18.txt",
        "age_col": "ageConsent",
        "year_iso": "2018-01-01",
    },
]


def _find_t1dx_zip() -> str:
    matches = glob.glob(os.path.join(CACHE_DIR, "T1DXRegistry_*.zip"))
    if not matches:
        raise FileNotFoundError(f"No T1DXRegistry zip in {CACHE_DIR}")
    return matches[0]


def _assign_band(age: float) -> str | None:
    if age is None or pd.isna(age):
        return None
    for lo, hi, label in AGE_BANDS:
        if lo <= age < hi:
            return label
    return None


def _aggregate_wave(
    zf: zipfile.ZipFile,
    wave: dict[str, str],
) -> list[dict[str, Any]]:
    with zf.open(wave["hba1c"]) as f:
        hba1c = pd.read_csv(f, sep="|", encoding="latin-1")
    with zf.open(wave["subjects"]) as f:
        subjects = pd.read_csv(
            f, sep="|", encoding="latin-1",
            usecols=["PtID", wave["age_col"]], low_memory=False,
        )

    # Coerce numeric — some waves have string artefacts (e.g. "<5.5")
    hba1c["HbA1c"] = pd.to_numeric(hba1c["HbA1c"], errors="coerce")
    subjects[wave["age_col"]] = pd.to_numeric(subjects[wave["age_col"]], errors="coerce")
    # Clean HbA1c — drop nulls, enforce plausible range 4–20 (%)
    hba1c = hba1c.dropna(subset=["HbA1c"])
    hba1c = hba1c[(hba1c["HbA1c"] >= 4.0) & (hba1c["HbA1c"] <= 20.0)]

    # For waves with months-from-consent, restrict to in-registry readings
    # (within ±12 months of consent) so we attribute to the correct wave year.
    if "HbA1cMonthsFromConsent" in hba1c.columns:
        hba1c = hba1c[hba1c["HbA1cMonthsFromConsent"].between(-12, 12)]
    elif "HbA1cImputeDtMnC" in hba1c.columns:
        hba1c = hba1c[hba1c["HbA1cImputeDtMnC"].between(-12, 12)]

    merged = hba1c.merge(subjects, on="PtID", how="inner")
    merged["age_band"] = merged[wave["age_col"]].apply(_assign_band)
    merged = merged.dropna(subset=["age_band"])

    records: list[dict[str, Any]] = []
    for band, grp in merged.groupby("age_band", sort=False):
        n = len(grp)
        if n < MIN_N:
            continue
        mean = float(grp["HbA1c"].mean())
        median = float(grp["HbA1c"].median())
        q25 = float(grp["HbA1c"].quantile(0.25))
        q75 = float(grp["HbA1c"].quantile(0.75))
        base = {
            "cohort": "T1D Exchange Registry",
            "sponsor": "JAEB / T1D Exchange",
            "therapy": "standard of care",
            "date": wave["year_iso"],
            "unit": "%",
            "cohort_size": int(n),
            "age_band_years": band,
            "wave": wave["label"],
            "source": SOURCE_URL,
            "notes": SOURCE_NOTE,
        }
        for metric_name, value in [
            ("hba1c_mean_pct", round(mean, 3)),
            ("hba1c_median_pct", round(median, 3)),
            ("hba1c_q25_pct", round(q25, 3)),
            ("hba1c_q75_pct", round(q75, 3)),
        ]:
            records.append({**base, "metric_name": metric_name, "metric_value": value})
    return records


def main() -> int:
    zip_path = _find_t1dx_zip()
    print(f"[t1dx] reading {os.path.basename(zip_path)}")
    all_records: list[dict[str, Any]] = []
    with zipfile.ZipFile(zip_path) as zf:
        for wave in WAVES:
            try:
                recs = _aggregate_wave(zf, wave)
            except Exception as e:
                print(f"[t1dx] wave {wave['label']} failed: {type(e).__name__}: {e}")
                continue
            bands = sorted({r["age_band_years"] for r in recs})
            print(f"[t1dx] wave {wave['label']}: {len(recs)} records across bands {bands}")
            all_records.extend(recs)

    payload = {
        "source_key": "t1dx_registry_hba1c",
        "source_url": SOURCE_URL,
        "license_note": (
            "JAEB Open Data License: aggregate-only derivatives may be "
            "redistributed; raw patient-level data may not. This file contains "
            "wave-by-age-band means/medians only (n>=20 per cell)."
        ),
        "records": all_records,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"[t1dx] wrote {len(all_records)} aggregate records to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
