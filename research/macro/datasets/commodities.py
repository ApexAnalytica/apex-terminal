"""Brent/WTI crude monthly + Henry Hub natural gas monthly.

These cover the post-2017 gap left by the IMF Pink Sheet snapshot and
go through current. Sources are EIA-derived CSVs republished by the
``datasets/`` GitHub org.
"""
from __future__ import annotations

import io

import pandas as pd

from ._cache import cached_get

BRENT_URL = "https://raw.githubusercontent.com/datasets/oil-prices/main/data/brent-monthly.csv"
WTI_URL = "https://raw.githubusercontent.com/datasets/oil-prices/main/data/wti-monthly.csv"
NATGAS_URL = "https://raw.githubusercontent.com/datasets/natural-gas/main/data/monthly.csv"


def _load_dated(url: str, date_col: str, value_col: str, name: str) -> pd.DataFrame:
    raw = cached_get(url)
    df = pd.read_csv(io.BytesIO(raw))
    df[date_col] = pd.to_datetime(df[date_col])
    df = df.set_index(date_col).sort_index()
    return df.rename(columns={value_col: name})[[name]]


def fetch_brent_monthly() -> pd.DataFrame:
    return _load_dated(BRENT_URL, "Date", "Price", "brent_usd_bbl")


def fetch_wti_monthly() -> pd.DataFrame:
    return _load_dated(WTI_URL, "Date", "Price", "wti_usd_bbl")


def fetch_natgas_monthly() -> pd.DataFrame:
    raw = cached_get(NATGAS_URL)
    df = pd.read_csv(io.BytesIO(raw))
    df["Month"] = pd.to_datetime(df["Month"])
    df = df.set_index("Month").sort_index()
    return df.rename(columns={"Price": "natgas_henryhub_usd_mmbtu"})[["natgas_henryhub_usd_mmbtu"]]
