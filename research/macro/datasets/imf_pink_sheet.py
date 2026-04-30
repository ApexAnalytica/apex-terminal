"""IMF Primary Commodity Prices (a.k.a. Pink Sheet) — monthly.

The canonical source is the IMF data portal at
https://www.imf.org/en/Research/commodity-prices but that domain is
blocked from many CI environments. We pull the GitHub-mirrored copy at
``datasets/commodity-prices`` which republishes the same series.

Coverage: 1980-02 through 2017-06 (449 monthly observations).
Columns: 64 series — All Commodity Index, Food Price Index, Fuel Energy
Index, Brent/WTI/Dubai crude, Henry Hub / Russian / Indonesian natural
gas, Wheat, Maize, Iron Ore, Industrial Inputs, etc.

For series past 2017 use the dedicated EIA-mirrored loaders in
``commodities.py`` which pull through current.
"""
from __future__ import annotations

import io

import pandas as pd

from ._cache import cached_get

URL = "https://raw.githubusercontent.com/datasets/commodity-prices/main/data/commodity-prices.csv"


def fetch_imf_pink_sheet() -> pd.DataFrame:
    """Return the full monthly IMF Pink Sheet panel indexed by date."""
    raw = cached_get(URL)
    df = pd.read_csv(io.BytesIO(raw))
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.set_index("Date").sort_index()
    df = df.apply(pd.to_numeric, errors="coerce")
    return df
