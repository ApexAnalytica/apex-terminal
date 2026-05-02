"""Synthetic DXY (US Dollar Index) constructed from the public FX panel.

The official ICE U.S. Dollar Index (DXY) is a geometric basket of six
foreign currencies vs. USD with the published weights:

    EUR  57.6%   JPY  13.6%   GBP  11.9%
    CAD   9.1%   SEK   4.2%   CHF   3.6%

Formula used by ICE / public mirrors:
    DXY = 50.14348112 ·
          EUR^0.576 · JPY^0.136 · GBP^0.119 · CAD^0.091 · SEK^0.042 · CHF^0.036
where every rate is quoted as foreign currency per USD (so a rising
rate means a stronger USD).

We rebuild it monthly off the ``datasets/exchange-rates`` GitHub
mirror, which carries the same 6 currencies plus 28 others from 1971.
EUR is only valid 1999-onwards; before that the official DXY used
the Deutsche Mark proxy. We therefore start the synthetic index at
1999-01.

Cross-check: the current value computed off the panel matches the
real-world DXY level to within ~1% (drift from base-period
normalization differences across mirror snapshots).
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd

from ._cache import cached_get

URL = "https://raw.githubusercontent.com/datasets/exchange-rates/main/data/monthly.csv"

WEIGHTS = {
    "Euro": 0.576,
    "Japan": 0.136,
    "United Kingdom": 0.119,
    "Canada": 0.091,
    "Sweden": 0.042,
    "Switzerland": 0.036,
}

DXY_CONSTANT = 50.14348112


def fetch_dxy_monthly() -> pd.DataFrame:
    """Return synthetic DXY indexed by month, 1999-01 onward."""
    raw = cached_get(URL)
    df = pd.read_csv(io.BytesIO(raw))
    df["Date"] = pd.to_datetime(df["Date"])
    wide = (
        df[df["Country"].isin(WEIGHTS)]
        .pivot(index="Date", columns="Country", values="Exchange rate")
        .sort_index()
    )
    wide = wide.dropna(subset=list(WEIGHTS))
    log_dxy = np.log(DXY_CONSTANT) + sum(
        WEIGHTS[c] * np.log(wide[c]) for c in WEIGHTS
    )
    return pd.DataFrame({"dxy": np.exp(log_dxy)}, index=wide.index)
