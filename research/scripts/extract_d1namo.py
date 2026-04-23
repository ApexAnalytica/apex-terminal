"""Extract D1NAMO T1D subset CGM aggregates.

D1NAMO (Dubosson 2018) provides 4 days of continuous glucose + insulin + meal +
wearable data on 9 T1D subjects. We compute standard glycemic-control metrics
(TIR / TBR / TAR / mean glucose / CV) per subject, then aggregate across the
cohort (median, q25, q75) as a cohort-level snapshot. We also emit a
postprandial-excursion signal: mean glucose change 2 h after each logged meal.

Output: public/datasets/claire/d1namo_cgm.json, shape compatible with
public/datasets/claire/t1d_timeseries.json record schema.

License: D1NAMO is CC-BY-SA-4.0. Derivatives (this sidecar) inherit the same
license — noted in license_note below and attributed per the citation field.

Run from repo root:
    python research/scripts/extract_d1namo.py
"""
from __future__ import annotations

import io
import json
import os
import zipfile
from typing import Any

import numpy as np
import pandas as pd


CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "_cache", "d1namo")
OUT = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "public", "datasets", "claire", "d1namo_cgm.json",
)

SOURCE_URL = "https://zenodo.org/records/5651217"
SOURCE_CITATION = (
    "Dubosson et al. 2018 — The open D1NAMO dataset: a multi-modal dataset for "
    "research on non-invasive type 1 diabetes management; Informatics in "
    "Medicine Unlocked, doi:10.1016/j.imu.2018.09.003"
)
SOURCE_NOTE = (
    "D1NAMO T1D subset (9 subjects, 4 days each, Zephyr BioHarness + Dexcom G4 "
    "CGM + meal/insulin logs). Cohort aggregates; no per-subject disclosure."
)

PICS_ZIP = "diabetes_subset_pictures-glucose-food-insulin.zip"
PICS_ROOT = "diabetes_subset_pictures-glucose-food-insulin"

# TIR / TBR / TAR thresholds in mmol/L (ADA 2019 consensus)
TIR_LO_MMOL = 3.9   # 70 mg/dL
TIR_HI_MMOL = 10.0  # 180 mg/dL

MMOL_TO_MGDL = 18.018

SUBJECTS = [f"{i:03d}" for i in range(1, 10)]  # 001..009


def _read_zip_csv(zf: zipfile.ZipFile, member: str) -> pd.DataFrame:
    with zf.open(member) as f:
        return pd.read_csv(io.BytesIO(f.read()))


def _subject_glucose(zf: zipfile.ZipFile, subject: str) -> pd.DataFrame:
    df = _read_zip_csv(zf, f"{PICS_ROOT}/{subject}/glucose.csv")
    # Keep CGM readings only (drop user-logged manual fingersticks to avoid
    # sampling bias — they skew toward pre-meal / hypo correction checks).
    df = df[df["type"].astype(str).str.lower() == "cgm"].copy()
    df["glucose"] = pd.to_numeric(df["glucose"], errors="coerce")
    df = df.dropna(subset=["glucose", "date", "time"])
    df["datetime"] = pd.to_datetime(
        df["date"].astype(str) + " " + df["time"].astype(str),
        errors="coerce",
    )
    df = df.dropna(subset=["datetime"]).sort_values("datetime")
    return df[["datetime", "glucose"]]


def _subject_food(zf: zipfile.ZipFile, subject: str) -> pd.DataFrame:
    df = _read_zip_csv(zf, f"{PICS_ROOT}/{subject}/food.csv")
    # food.csv uses "YYYY:MM:DD HH:MM:SS" datetime
    df["datetime"] = pd.to_datetime(
        df["datetime"].astype(str).str.replace(":", "-", 2),
        errors="coerce",
    )
    return df.dropna(subset=["datetime"]).sort_values("datetime")


def _compute_subject_metrics(glucose: pd.DataFrame) -> dict[str, float]:
    if glucose.empty:
        return {}
    g = glucose["glucose"].to_numpy()
    tir = float((g >= TIR_LO_MMOL) & (g <= TIR_HI_MMOL)).mean() if False else \
        float(((g >= TIR_LO_MMOL) & (g <= TIR_HI_MMOL)).mean())
    tbr = float((g < TIR_LO_MMOL).mean())
    tar = float((g > TIR_HI_MMOL).mean())
    mean_mmol = float(g.mean())
    cv = float(g.std(ddof=1) / g.mean()) if g.mean() > 0 else 0.0
    # Recording hours (datetime span of CGM readings)
    span = (glucose["datetime"].max() - glucose["datetime"].min()).total_seconds() / 3600
    return {
        "tir_70_180_pct": tir * 100,
        "tbr_lt_70_pct": tbr * 100,
        "tar_gt_180_pct": tar * 100,
        "mean_glucose_mgdl": mean_mmol * MMOL_TO_MGDL,
        "mean_glucose_mmol": mean_mmol,
        "glucose_cv_pct": cv * 100,
        "cgm_hours": span,
        "n_cgm_readings": int(len(glucose)),
    }


def _postprandial_excursions(
    glucose: pd.DataFrame, food: pd.DataFrame,
) -> list[float]:
    """For each meal, compute Δglucose (mmol/L) from meal time → 2 h after."""
    excursions: list[float] = []
    if glucose.empty or food.empty:
        return excursions
    # Pre-index for nearest lookup
    glu_idx = glucose.set_index("datetime").sort_index()
    for meal_ts in food["datetime"]:
        try:
            pre_ts = meal_ts - pd.Timedelta(minutes=10)
            post_ts = meal_ts + pd.Timedelta(hours=2)
            pre = glu_idx.iloc[glu_idx.index.get_indexer([pre_ts], method="nearest")]
            post = glu_idx.iloc[glu_idx.index.get_indexer([post_ts], method="nearest")]
            # Require the nearest reading is within a reasonable window
            if abs((pre.index[0] - pre_ts).total_seconds()) > 1800:
                continue
            if abs((post.index[0] - post_ts).total_seconds()) > 1800:
                continue
            delta = float(post["glucose"].iloc[0] - pre["glucose"].iloc[0])
            excursions.append(delta)
        except Exception:
            continue
    return excursions


def _cohort_record(
    metric: str, value: float, unit: str, n: int,
) -> dict[str, Any]:
    return {
        "cohort": "D1NAMO T1D subset",
        "sponsor": "EPFL / HES-SO",
        "therapy": "standard of care (pumps + MDI mix)",
        "date": "2014-10-01",  # D1NAMO recording window centre
        "metric_name": metric,
        "metric_value": round(value, 3),
        "unit": unit,
        "cohort_size": n,
        "source": SOURCE_URL,
        "notes": SOURCE_NOTE,
    }


def main() -> int:
    pics_path = os.path.join(CACHE_DIR, PICS_ZIP)
    if not os.path.exists(pics_path):
        print(f"[d1namo] missing zip: {pics_path}")
        return 1

    subject_metrics: dict[str, dict[str, float]] = {}
    subject_excursions: dict[str, list[float]] = {}

    with zipfile.ZipFile(pics_path) as zf:
        for subj in SUBJECTS:
            try:
                glu = _subject_glucose(zf, subj)
                food = _subject_food(zf, subj)
            except KeyError:
                print(f"[d1namo] subject {subj} missing — skipping")
                continue
            metrics = _compute_subject_metrics(glu)
            if not metrics:
                continue
            subject_metrics[subj] = metrics
            subject_excursions[subj] = _postprandial_excursions(glu, food)
            print(
                f"[d1namo] subj {subj}: {metrics['n_cgm_readings']:>4} CGM pts, "
                f"TIR {metrics['tir_70_180_pct']:.1f}% "
                f"({metrics['cgm_hours']:.1f}h), "
                f"{len(subject_excursions[subj])} meals"
            )

    n_subjects = len(subject_metrics)
    if n_subjects == 0:
        print("[d1namo] no subject data loaded")
        return 1

    # Cohort aggregates: take median / q25 / q75 across subjects
    cohort_records: list[dict[str, Any]] = []
    metric_keys_units = [
        ("tir_70_180_pct", "%"),
        ("tbr_lt_70_pct", "%"),
        ("tar_gt_180_pct", "%"),
        ("mean_glucose_mgdl", "mg/dL"),
        ("mean_glucose_mmol", "mmol/L"),
        ("glucose_cv_pct", "%"),
    ]
    for key, unit in metric_keys_units:
        values = [m[key] for m in subject_metrics.values()]
        cohort_records.append(
            _cohort_record(f"{key}_cohort_median", float(np.median(values)), unit, n_subjects)
        )
        cohort_records.append(
            _cohort_record(f"{key}_cohort_q25", float(np.quantile(values, 0.25)), unit, n_subjects)
        )
        cohort_records.append(
            _cohort_record(f"{key}_cohort_q75", float(np.quantile(values, 0.75)), unit, n_subjects)
        )

    # Postprandial excursion aggregate — pool across meals (per-subject medians
    # first so a high-meal-log subject doesn't dominate)
    per_subj_medians = [
        float(np.median(ex)) for ex in subject_excursions.values() if len(ex) >= 3
    ]
    if per_subj_medians:
        cohort_records.append(
            _cohort_record(
                "postprandial_2h_excursion_median",
                float(np.median(per_subj_medians)),
                "mmol/L",
                len(per_subj_medians),
            )
        )
        cohort_records.append(
            _cohort_record(
                "postprandial_2h_excursion_q25",
                float(np.quantile(per_subj_medians, 0.25)),
                "mmol/L",
                len(per_subj_medians),
            )
        )
        cohort_records.append(
            _cohort_record(
                "postprandial_2h_excursion_q75",
                float(np.quantile(per_subj_medians, 0.75)),
                "mmol/L",
                len(per_subj_medians),
            )
        )

    payload = {
        "source_key": "d1namo_cgm",
        "source_url": SOURCE_URL,
        "citation": SOURCE_CITATION,
        "license_note": (
            "D1NAMO is CC-BY-SA-4.0. These derivative cohort aggregates "
            "(n=9 T1D subjects, median / q25 / q75 only) inherit CC-BY-SA-4.0 "
            "and must be redistributed under the same license with attribution."
        ),
        "n_subjects": n_subjects,
        "records": cohort_records,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"[d1namo] wrote {len(cohort_records)} aggregate records to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
