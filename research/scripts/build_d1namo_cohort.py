"""Build a D1NAMO Cohort JSON for the TS discovery pipeline.

Reads the D1NAMO `diabetes_subset_pictures-glucose-food-insulin.zip`
archive from `research/datasets/_cache/d1namo/` and emits a JSON file
matching the TS `Cohort` schema in `src/lib/discovery/cohort-types.ts`.
The TS-side ingester (`src/lib/discovery/ingesters/d1namo.ts`) reads this
JSON; nothing in the TS app touches the raw zip.

Why split it this way:
  - Zip parsing + tabular reshaping is more natural in Python.
  - The Python ETL stays in `research/`, gitignored.
  - The TS ingester stays small and pure (JSON in → Cohort out).
  - This is also how an enterprise pipeline works: heavy ETL in batch,
    discovery layer consumes structured outputs.

Output: `research/datasets/d1namo/cohort.json` (gitignored).

Run from repo root after fetching the zip:
    python research/scripts/build_d1namo_cohort.py
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from typing import Any

import pandas as pd

# ─── Paths ────────────────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
ZIP_PATH = os.path.join(
    REPO, "research", "datasets", "_cache", "d1namo",
    "diabetes_subset_pictures-glucose-food-insulin.zip",
)
OUT_DIR = os.path.join(REPO, "research", "datasets", "d1namo")
OUT_PATH = os.path.join(OUT_DIR, "cohort.json")

# ─── Schema constants ─────────────────────────────────────────────────
PICS_ROOT = "diabetes_subset_pictures-glucose-food-insulin"
SUBJECTS = [f"{i:03d}" for i in range(1, 10)]  # 001..009
MMOL_TO_MGDL = 18.018
ADAPTER_ID = "d1namo"
ADAPTER_VERSION = "0.1.0"

# Variables we materialize. CGM is dense (~5min cadence). Insulin and
# meals are sparse events. Carb intake is a continuous-valued event.
VARIABLES = [
    {
        "id": "cgm_glucose_mgdl",
        "label": "CGM glucose",
        "conceptCode": {"system": "LOINC", "code": "2345-7"},
        "unit": "mg/dL",
        "kind": "continuous",
        "cadenceSeconds": 300,
    },
    {
        "id": "meal_event",
        "label": "Meal logged",
        "kind": "event",
        "unit": "boolean",
    },
    {
        "id": "insulin_fast_units",
        "label": "Fast-acting insulin (bolus)",
        "conceptCode": {"system": "LOINC", "code": "11000-4"},
        "unit": "U",
        "kind": "continuous",
    },
    {
        "id": "insulin_slow_units",
        "label": "Long-acting insulin (basal)",
        "unit": "U",
        "kind": "continuous",
    },
]


def _sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_csv(zf: zipfile.ZipFile, member: str) -> pd.DataFrame | None:
    try:
        with zf.open(member) as f:
            return pd.read_csv(io.BytesIO(f.read()))
    except KeyError:
        return None


def _parse_glucose(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df["type"].astype(str).str.lower() == "cgm"].copy()
    df["glucose"] = pd.to_numeric(df["glucose"], errors="coerce")
    df = df.dropna(subset=["glucose", "date", "time"])
    df["datetime"] = pd.to_datetime(
        df["date"].astype(str) + " " + df["time"].astype(str),
        errors="coerce",
    )
    return df.dropna(subset=["datetime"]).sort_values("datetime")


def _parse_event_csv(df: pd.DataFrame, dt_col: str = "datetime") -> pd.DataFrame:
    if dt_col not in df.columns:
        return pd.DataFrame(columns=[dt_col])
    df = df.copy()
    s = df[dt_col].astype(str)
    # D1NAMO uses "YYYY:MM:DD HH:MM:SS" — replace first two ':' so pandas parses.
    s = s.str.replace(":", "-", 2)
    df[dt_col] = pd.to_datetime(s, errors="coerce")
    return df.dropna(subset=[dt_col]).sort_values(dt_col)


def _build_subject(zf: zipfile.ZipFile, subject: str) -> dict[str, Any] | None:
    glu = _read_csv(zf, f"{PICS_ROOT}/{subject}/glucose.csv")
    food = _read_csv(zf, f"{PICS_ROOT}/{subject}/food.csv")
    insulin = _read_csv(zf, f"{PICS_ROOT}/{subject}/insulin.csv")
    if glu is None:
        return None

    glu = _parse_glucose(glu)
    if glu.empty:
        return None

    # Per-subject t=0 is the first CGM reading.
    t0 = glu["datetime"].iloc[0]

    measurements: list[dict[str, Any]] = []

    # CGM: convert mmol/L → mg/dL so the variable stays in clinical units.
    for ts, val in zip(glu["datetime"], glu["glucose"]):
        t = (ts - t0).total_seconds()
        measurements.append({
            "variableId": "cgm_glucose_mgdl",
            "t": float(t),
            "value": float(val * MMOL_TO_MGDL),
        })

    # Meals: each logged meal is a unit event (value=1). Carb amount is
    # not always present; if a `carbs` or `total_carbs` column exists,
    # surface it as the event magnitude.
    if food is not None:
        food = _parse_event_csv(food, "datetime")
        carb_col = next(
            (c for c in ("calories", "carbs", "total_carbs") if c in food.columns),
            None,
        )
        for _, row in food.iterrows():
            t = (row["datetime"] - t0).total_seconds()
            value: float = 1.0
            if carb_col is not None:
                try:
                    v = float(row[carb_col])
                    if pd.notna(v):
                        value = v
                except Exception:
                    pass
            measurements.append({
                "variableId": "meal_event",
                "t": float(t),
                "value": float(value),
            })

    # Insulin: D1NAMO splits into fast and slow boluses with units.
    # CSV has date + time columns (separate); recombine into a datetime.
    if insulin is not None and "date" in insulin.columns and "time" in insulin.columns:
        insulin = insulin.copy()
        insulin["datetime"] = pd.to_datetime(
            insulin["date"].astype(str) + " " + insulin["time"].astype(str),
            errors="coerce",
        )
        insulin = insulin.dropna(subset=["datetime"]).sort_values("datetime")
        for _, row in insulin.iterrows():
            t = (row["datetime"] - t0).total_seconds()
            for col, varname in (
                ("fast_insulin", "insulin_fast_units"),
                ("slow_insulin", "insulin_slow_units"),
            ):
                if col not in insulin.columns:
                    continue
                try:
                    v = float(row[col])
                except Exception:
                    continue
                if not pd.notna(v) or v == 0:
                    continue
                measurements.append({
                    "variableId": varname,
                    "t": float(t),
                    "value": float(v),
                })

    measurements.sort(key=lambda m: (m["t"], m["variableId"]))
    return {
        "id": f"d1namo-{subject}",
        "demographics": {"d1namo_subject_index": subject},
        "measurements": measurements,
    }


def main() -> int:
    if not os.path.exists(ZIP_PATH):
        print(f"[d1namo] missing zip: {ZIP_PATH}", file=sys.stderr)
        print(
            "    Download from https://zenodo.org/records/5651217 "
            "(diabetes_subset_pictures-glucose-food-insulin.zip)",
            file=sys.stderr,
        )
        return 1

    source_hash = _sha256_of_file(ZIP_PATH)
    subjects: list[dict[str, Any]] = []
    with zipfile.ZipFile(ZIP_PATH) as zf:
        for sid in SUBJECTS:
            sub = _build_subject(zf, sid)
            if sub is None:
                print(f"[d1namo] subject {sid}: skipped (no data)", file=sys.stderr)
                continue
            subjects.append(sub)
            print(
                f"[d1namo] subject {sid}: {len(sub['measurements'])} measurements"
            )

    cohort = {
        "id": "d1namo-2018",
        "label": "D1NAMO — 9 T1D subjects, 4 days, CGM + insulin + meals (Dubosson 2018)",
        "source": {
            "adapter": ADAPTER_ID,
            "adapterVersion": ADAPTER_VERSION,
            "sourceHash": source_hash,
            "ingestedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "containsPHI": False,
        },
        "variables": VARIABLES,
        "subjects": subjects,
        "timeAxis": {
            "zeroConvention": "subject-session-start",
            "displayUnit": "seconds",
        },
        "metadata": {
            "description": (
                "D1NAMO T1D subset (Dubosson et al. 2018, Informatics in Medicine "
                "Unlocked). 9 subjects, 4 days each, Dexcom G4 CGM + insulin doses + "
                "logged meals. Per-subject session start is t=0; cohort discovery "
                "runs over within-subject lagged structure."
            ),
            "citation": (
                "Dubosson et al. 2018, doi:10.1016/j.imu.2018.09.003"
            ),
            "irbStatement": (
                "EPFL ethics-committee approved; subjects gave informed consent. "
                "Dataset distributed under CC-BY-SA-4.0 on Zenodo."
            ),
            "accessTier": "public",
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(cohort, f, indent=2)

    total_meas = sum(len(s["measurements"]) for s in subjects)
    print(
        f"[d1namo] wrote {OUT_PATH}: "
        f"{len(subjects)} subjects, {total_meas:,} measurements, "
        f"sourceHash={source_hash[:12]}..."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
