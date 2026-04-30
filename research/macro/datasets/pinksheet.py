"""World Bank "Pink Sheet" monthly commodity prices.

Source: World Bank Commodity Markets, Monthly Prices spreadsheet:
https://www.worldbank.org/en/research/commodity-markets

The file is a single xlsx with all commodities side-by-side. We parse it
into a clean wide DataFrame indexed by month-end timestamp with columns
named by the slug of the source column header.
"""
from __future__ import annotations

import re
import warnings
from pathlib import Path

import pandas as pd
import requests

warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

PINKSHEET_URL = (
    "https://thedocs.worldbank.org/en/doc/"
    "5d903e848db1d1b83e0ec8f744e55570-0350012021/related/"
    "CMO-Historical-Data-Monthly.xlsx"
)

CACHE_DIR = Path(__file__).resolve().parent / "_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return s


def _fetch(refresh: bool = False) -> Path:
    cache = CACHE_DIR / "pinksheet.xlsx"
    if cache.exists() and not refresh:
        return cache
    r = requests.get(PINKSHEET_URL, timeout=60)
    r.raise_for_status()
    cache.write_bytes(r.content)
    return cache


def load(refresh: bool = False) -> pd.DataFrame:
    """Return wide monthly DataFrame indexed by month-end Timestamp.

    Column names are slugged from the source header (e.g., "Crude oil,
    Brent" -> "crude_oil_brent", "DAP" -> "dap", "Urea " -> "urea").
    """
    path = _fetch(refresh=refresh)
    raw = pd.read_excel(path, sheet_name="Monthly Prices", header=None)

    headers = raw.iloc[4].astype(str).str.strip()
    units = raw.iloc[5].astype(str).str.strip()

    # First column is the YYYYMmm period label, no header. Rest are commodities.
    cols: list[str] = []
    for i, h in enumerate(headers):
        if i == 0:
            cols.append("period")
        elif h in ("nan", ""):
            cols.append(f"_drop_{i}")
        else:
            cols.append(_slug(h))

    body = raw.iloc[6:].copy()
    body.columns = cols
    body = body.loc[:, ~body.columns.str.startswith("_drop_")]
    body = body[body["period"].astype(str).str.match(r"^\d{4}M\d{2}$")]

    body["date"] = pd.to_datetime(body["period"].str.replace("M", "-"), format="%Y-%m") \
        + pd.offsets.MonthEnd(0)
    body = body.set_index("date").drop(columns=["period"])

    # coerce all to numeric (some early rows have "..." sentinels)
    for c in body.columns:
        body[c] = pd.to_numeric(body[c], errors="coerce")

    body = body.sort_index()
    body.attrs["units"] = {
        cols[i]: units.iloc[i] for i in range(len(cols)) if not cols[i].startswith("_drop_")
    }
    return body


if __name__ == "__main__":
    df = load()
    print(f"shape: {df.shape}")
    print(f"range: {df.index.min().date()} -> {df.index.max().date()}")
    cols = ["crude_oil_brent", "natural_gas_us", "urea", "dap", "phosphate_rock",
            "wheat_us_srw", "maize", "rice_thai_5"]
    print(df[[c for c in cols if c in df.columns]].tail(6))
