"""Penn World Tables sovereign data — annual GDP / employment / capital.

Sourced from the analyst workbook already shipped under
``public/datasets/claire/timeseries.json`` (key: ``pwt_sovereign``).
Currently covers China and Brazil 1979-onwards.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

PATH = Path(__file__).resolve().parents[3] / "public" / "datasets" / "claire" / "timeseries.json"


def load_pwt_sovereign() -> pd.DataFrame:
    with open(PATH) as f:
        data = json.load(f)
    recs = data.get("pwt_sovereign", [])
    df = pd.DataFrame(recs)
    if df.empty:
        return df
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    return df.sort_values(["country", "year"]).reset_index(drop=True)
