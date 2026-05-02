"""US quarterly macro panel from ``statsmodels.datasets.macrodata``.

1959Q1–2009Q3, 203 observations. Carries CPI, GDP, unemployment,
fed funds (T-bill rate), inflation, M1, real interest rate.
Bundled with the ``statsmodels`` PyPI package — no network needed.
"""
from __future__ import annotations

import pandas as pd
import statsmodels.datasets as ds


def load_us_quarterly() -> pd.DataFrame:
    df = ds.macrodata.load_pandas().data.copy()
    # Build a proper quarter-end index (CPI / inflation are end-of-period observations).
    quarter_to_month = {1: 3, 2: 6, 3: 9, 4: 12}
    df["date"] = pd.to_datetime(
        df["year"].astype(int).astype(str)
        + "-"
        + df["quarter"].astype(int).map(quarter_to_month).astype(str)
        + "-01",
        format="%Y-%m-%d",
    ) + pd.offsets.MonthEnd(0)
    return df.set_index("date").drop(columns=["year", "quarter"])
