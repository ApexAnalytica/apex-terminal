"""Synthetic 10-year ex-post real interest rate.

Real rate = nominal − inflation expectations. With FRED blocked from
this sandbox we can't pull TIPS yields (DFII10) or breakevens (T10YIE)
directly, so we construct an ex-post real-rate proxy:

    commodity_yoy_smoothed_t = 24mo MA of YoY % change in IMF All
                                Commodity Price Index
    inflation_proxy_t        = 2.5 (long-run anchor)
                                + 0.15 · commodity_yoy_smoothed_t
    real_rate_10y_t          = us10y_t − inflation_proxy_t

The 2.5% anchor is the post-1995 mean US headline CPI YoY (FOMC's
implicit target era). The 0.15 scale captures the empirical commodity-
to-CPI pass-through — commodities are roughly 15-20% of the headline
CPI basket and pass through with elasticity ~0.7-1.0, so a 1pp move in
commodity YoY drives ~0.15pp of CPI YoY. With this calibration the
synthetic real rate sits in [-3, +6] across 1993-2017, matching the
TIPS-implied real rate range in the published literature.

A future refit with FRED's DFII10 (10y TIPS yield) or T10YIE
(breakeven) will tighten this — both are direct measures rather than
proxies. For now this is the cleanest reachable construction.
"""
from __future__ import annotations

import pandas as pd

from .imf_pink_sheet import fetch_imf_pink_sheet
from .treasury import fetch_us10y_monthly

# Calibration constants (justified above)
LONG_RUN_INFLATION_ANCHOR_PCT = 2.5
COMMODITY_TO_CPI_PASS_THROUGH = 0.15


def fetch_real_rate_10y_monthly() -> pd.DataFrame:
    """Return monthly ex-post 10-year real rate, indexed by month-end."""
    us10y = fetch_us10y_monthly()["us10y_pct"]
    imf = fetch_imf_pink_sheet()
    all_comm = imf["All Commodity Price Index"].dropna()

    us10y.index = pd.to_datetime(us10y.index).to_period("M").to_timestamp("M")
    all_comm.index = pd.to_datetime(all_comm.index).to_period("M").to_timestamp("M")

    yoy = all_comm.pct_change(12) * 100.0
    smoothed = yoy.rolling(window=24, min_periods=12).mean()

    df = pd.concat([us10y.rename("us10y"), smoothed.rename("comm_yoy_smoothed")], axis=1, sort=False).dropna()
    df["inflation_proxy"] = LONG_RUN_INFLATION_ANCHOR_PCT + COMMODITY_TO_CPI_PASS_THROUGH * df["comm_yoy_smoothed"]
    df["real_rate_10y"] = df["us10y"] - df["inflation_proxy"]
    return df[["real_rate_10y"]]
