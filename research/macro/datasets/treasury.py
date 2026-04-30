"""US 10-year Treasury constant-maturity yield, monthly."""
from __future__ import annotations

import io

import pandas as pd

from ._cache import cached_get

URL = "https://raw.githubusercontent.com/datasets/bond-yields-us-10y/main/data/monthly.csv"


def fetch_us10y_monthly() -> pd.DataFrame:
    raw = cached_get(URL)
    df = pd.read_csv(io.BytesIO(raw))
    df["Date"] = pd.to_datetime(df["Date"])
    return df.set_index("Date").sort_index().rename(columns={"Rate": "us10y_pct"})[["us10y_pct"]]
