"""FRED (Federal Reserve Economic Data) loader.

Pulls monthly macro series from FRED's public CSV endpoint, no API key
required. Source: https://fred.stlouisfed.org/

The series we care about for the macro pass-through edges added in
graph PR #115:

    CPIENGSL    -> ip_cpi_energy
    CPIUFDSL    -> ip_cpi_food
    CUSR0000SAC -> ip_cpi_goods         (CPI: Commodities, SA)
    PPIENG      -> ip_ppi_energy
    PPIACO      -> ip_ppi_all_commodities
    INDPRO      -> mi_industrial_production
    MANEMP      -> mi_ism_manufacturing  (proxy; ISM PMI is licensed)

All series cache to research/macro/datasets/_cache/fred_<id>.csv on
first fetch. Re-runs are network-free.
"""
from __future__ import annotations

import warnings
from pathlib import Path

import pandas as pd
import requests

warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

CACHE_DIR = Path(__file__).resolve().parent / "_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Canonical mapping from graph node IDs to FRED series IDs.
# (mi_ism_manufacturing uses MANEMP as a proxy because the actual ISM
# PMI is published by the Institute for Supply Management under license
# and is not freely redistributable.)
NODE_TO_FRED: dict[str, str] = {
    "ip_cpi_energy": "CPIENGSL",
    "ip_cpi_food": "CPIUFDSL",
    "ip_cpi_goods": "CUSR0000SAC",
    "ip_ppi_energy": "PPIENG",
    "ip_ppi_all_commodities": "PPIACO",
    "mi_industrial_production": "INDPRO",
    "mi_ism_manufacturing": "MANEMP",
}

# Reverse map for diagnostic output
FRED_TO_NODE: dict[str, str] = {v: k for k, v in NODE_TO_FRED.items()}


def _fetch(series_id: str, refresh: bool = False) -> Path:
    cache = CACHE_DIR / f"fred_{series_id}.csv"
    if cache.exists() and not refresh:
        return cache
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    cache.write_bytes(r.content)
    return cache


def load(series_id: str, refresh: bool = False) -> pd.Series:
    """Return a pandas Series indexed by month-end for the given FRED ID.

    FRED CSVs index on the *first* of the month for monthly series; we
    snap to month-end so the index matches the Pink Sheet loader.
    """
    path = _fetch(series_id, refresh=refresh)
    df = pd.read_csv(path, parse_dates=["observation_date"])
    df = df.dropna(subset=[series_id])
    df["date"] = df["observation_date"] + pd.offsets.MonthEnd(0)
    s = df.set_index("date")[series_id].astype(float)
    s.name = series_id
    return s


def load_node(node_id: str, refresh: bool = False) -> pd.Series:
    """Convenience: load by graph node ID rather than FRED series ID."""
    if node_id not in NODE_TO_FRED:
        raise KeyError(f"no FRED mapping for node {node_id!r}")
    s = load(NODE_TO_FRED[node_id], refresh=refresh)
    s.name = node_id
    return s


if __name__ == "__main__":
    for node_id, fred_id in NODE_TO_FRED.items():
        s = load(fred_id)
        print(f"{node_id:<28} {fred_id:<14} n={len(s):>5}  "
              f"range=[{s.index.min().date()} -> {s.index.max().date()}]  "
              f"latest={s.iloc[-1]:.2f}")
