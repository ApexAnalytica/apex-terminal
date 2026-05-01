"""Daily commodity price loaders.

Pulls Brent, WTI, and Henry Hub natural gas daily spot prices from the
public `github.com/datasets` mirrors of the underlying EIA series:

  - Brent (EIA RBRTE)         -> datasets/oil-prices  brent-daily.csv
  - WTI Cushing (EIA RWTC)    -> datasets/oil-prices  wti-daily.csv
  - Henry Hub (EIA RNGWHHD)   -> datasets/natural-gas daily.csv

These mirrors are updated weekly from the EIA's public CSVs and require
no API key. Cached locally under research/macro/datasets/_cache/ so that
re-runs are network-free.
"""
from __future__ import annotations

import io
import os
import warnings
from pathlib import Path
from typing import Literal

import pandas as pd
import requests

# urllib3 v2 noise on macOS LibreSSL — harmless for read-only HTTPS GETs.
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

CACHE_DIR = Path(__file__).resolve().parent / "_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "brent":  "https://raw.githubusercontent.com/datasets/oil-prices/master/data/brent-daily.csv",
    "wti":    "https://raw.githubusercontent.com/datasets/oil-prices/master/data/wti-daily.csv",
    "natgas": "https://raw.githubusercontent.com/datasets/natural-gas/master/data/daily.csv",
}

Series = Literal["brent", "wti", "natgas"]


def _fetch(series: Series, refresh: bool = False) -> Path:
    cache = CACHE_DIR / f"{series}.csv"
    if cache.exists() and not refresh:
        return cache
    url = SOURCES[series]
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    cache.write_bytes(r.content)
    return cache


def load(series: Series, refresh: bool = False) -> pd.Series:
    """Return a pandas Series indexed by date with the daily spot price.

    Units: USD/bbl for brent and wti; USD/MMBtu for natgas.
    """
    path = _fetch(series, refresh=refresh)
    df = pd.read_csv(path, parse_dates=["Date"]).sort_values("Date")
    s = df.set_index("Date")["Price"].astype(float)
    s.name = series
    return s


def load_all(refresh: bool = False) -> pd.DataFrame:
    """Return a wide frame indexed by trading day with all three series."""
    return pd.concat([load(s, refresh=refresh) for s in SOURCES], axis=1)


if __name__ == "__main__":
    df = load_all(refresh=False)
    print(df.tail())
    print(f"\ncoverage: {df.index.min().date()} -> {df.index.max().date()}  n={len(df)}")
