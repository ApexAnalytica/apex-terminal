"""FRED (Federal Reserve Economic Data) fetcher with sandbox fallback.

Pulls US-specific monthly macro series — the high-fidelity targets that
the IMF Pink Sheet proxies stand in for in the existing fits. When run
in an environment that can reach FRED, this lets us tighten the
empirical channel weights in PRs #129/#134/#190 without changing graph
topology.

Three reachability paths, tried in order:

  1. FRED API with key (env var FRED_API_KEY, free at
     https://fred.stlouisfed.org/docs/api/api_key.html)
       → https://api.stlouisfed.org/fred/series/observations?...
       Best: paginated, full series, machine-friendly JSON.

  2. FRED public CSV (no key)
       → https://fred.stlouisfed.org/graph/fredgraph.csv?id=X
       Works in most environments. Blocked from this Claude sandbox.

  3. Caller-supplied fallback (e.g., the existing IMF-mirror loaders)
       → handled by the caller, not this module.

The returned series is monthly, indexed by month-end (matching the
existing fetchers' convention), with column name = the FRED series id.

Series shortcuts for the macro graph (mapping FRED → graph target):

  CPI family
    CPIAUCSL  → ip_cpi_headline_yoy   (level; YoY computed downstream)
    CPILFESL  → ip_core_cpi_yoy
    CPIENGSL  → ip_cpi_energy
    CPIUFDSL  → ip_cpi_food
    CUSR0000SAS2RS → CPI Shelter (ip_cpi_shelter)
    CUSR0000SEHC   → OER (ip_cpi_oer)

  PPI family
    PPIACO    → ip_ppi_all_commodities
    PPIFIS    → ip_ppi_final_demand
    PPIIDC    → core PPI

  PCE
    PCEPILFE  → ip_core_pce_yoy

  Rates
    DFF       → ip_fed_funds_effective
    DGS10     → us10y_nominal (already in our reachable set)
    DFII10    → 10y TIPS yield (real rate!)
    T10YIE    → 10y breakeven (inflation expectations)
    SOFR      → ip_sofr

  Labor / growth
    PAYEMS    → mi_nonfarm_payroll_level
    UNRATE    → mi_unemployment_rate_u3
    INDPRO    → mi_industrial_production
    GDP       → US GDP level (quarterly; not monthly)

Run with key:
    export FRED_API_KEY="your_free_key_here"
    python -c "from research.macro.datasets.fred import fetch_fred_series; \\
               print(fetch_fred_series('CPIENGSL').tail())"
"""
from __future__ import annotations

import io
import json
import os
import warnings
from typing import Optional

import pandas as pd
import requests

from ._cache import CACHE_DIR

# Common series shortcuts for the macro graph (see module docstring).
GRAPH_SERIES = {
    # CPI components
    "ip_cpi_headline_yoy": "CPIAUCSL",
    "ip_core_cpi_yoy": "CPILFESL",
    "ip_cpi_energy": "CPIENGSL",
    "ip_cpi_food": "CPIUFDSL",
    "ip_cpi_shelter": "CUSR0000SAS2RS",
    "ip_cpi_oer": "CUSR0000SEHC",
    # PPI
    "ip_ppi_all_commodities": "PPIACO",
    "ip_ppi_final_demand": "PPIFIS",
    # PCE
    "ip_core_pce_yoy": "PCEPILFE",
    # Rates
    "ip_fed_funds_effective": "DFF",
    "us10y_nominal": "DGS10",
    "real_rate_10y_tips": "DFII10",
    "breakeven_10y": "T10YIE",
    "ip_sofr": "SOFR",
    # Labor / growth
    "mi_nonfarm_payroll_level": "PAYEMS",
    "mi_unemployment_rate_u3": "UNRATE",
    "mi_industrial_production": "INDPRO",
    # Shipping / freight  (closes the P3 confidence cap once FRED reachable)
    # The graph nodes are sc_shipping_cost_index and ic_red_sea_exposure;
    # both are best matched by the Cass Freight Index (CASSFI), with
    # WPSDH (Deep Sea Freight PPI) and TRUCKD11 (Truck Tonnage) as cross-
    # checks for mode-specific stress. Real Baltic Dry isn't on FRED but
    # CASSFI has good correlation with BDI in published comparisons (~0.7
    # over 2000-2020 monthly).
    "sc_shipping_cost_index": "CASSFI",
    "ic_red_sea_exposure": "WPSDH",
    "truck_tonnage": "TRUCKD11",
}


class FREDUnreachableError(RuntimeError):
    """Raised when neither FRED API nor public CSV is reachable.

    Catch this in callers that have a fallback (e.g. IMF Pink Sheet
    proxy) — the existing fitters do exactly that.
    """


def _api_url(series_id: str, api_key: str) -> str:
    return (
        "https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={api_key}&file_type=json"
    )


def _csv_url(series_id: str) -> str:
    return f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"


def _cache_path(series_id: str, suffix: str) -> "os.PathLike":
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"fred_{series_id}{suffix}"


def _from_api_json(text: str, series_id: str) -> pd.DataFrame:
    obj = json.loads(text)
    rows = obj.get("observations", [])
    if not rows:
        raise FREDUnreachableError(f"FRED API returned no observations for {series_id}")
    df = pd.DataFrame(rows)[["date", "value"]]
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna()
    df = df.set_index("date").sort_index()
    df.index = df.index.to_period("M").to_timestamp("M")
    df = df[~df.index.duplicated(keep="last")]
    return df.rename(columns={"value": series_id})[[series_id]]


def _from_csv(text: str, series_id: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text))
    # FRED CSV format: DATE,<series_id>  (column name varies)
    date_col = df.columns[0]
    val_col = [c for c in df.columns if c != date_col][0]
    df[date_col] = pd.to_datetime(df[date_col])
    df[val_col] = pd.to_numeric(df[val_col], errors="coerce")
    df = df.dropna().set_index(date_col).sort_index()
    df.index = df.index.to_period("M").to_timestamp("M")
    df = df[~df.index.duplicated(keep="last")]
    return df.rename(columns={val_col: series_id})[[series_id]]


def fetch_fred_series(
    series_id: str,
    *,
    api_key: Optional[str] = None,
    timeout: int = 20,
    force: bool = False,
) -> pd.DataFrame:
    """Fetch a FRED monthly series. See module docstring for path order."""
    api_key = api_key or os.environ.get("FRED_API_KEY")

    # Cache hit short-circuits everything.
    cache_json = _cache_path(series_id, ".json")
    cache_csv = _cache_path(series_id, ".csv")
    if not force:
        if cache_json.exists():
            return _from_api_json(cache_json.read_text(), series_id)
        if cache_csv.exists():
            return _from_csv(cache_csv.read_text(), series_id)

    errors: list[str] = []

    # Path 1: FRED API with key.
    if api_key:
        try:
            resp = requests.get(_api_url(series_id, api_key), timeout=timeout)
            resp.raise_for_status()
            cache_json.write_text(resp.text)
            return _from_api_json(resp.text, series_id)
        except Exception as exc:
            errors.append(f"FRED API: {exc}")

    # Path 2: FRED public CSV.
    try:
        resp = requests.get(_csv_url(series_id), timeout=timeout)
        resp.raise_for_status()
        cache_csv.write_text(resp.text)
        return _from_csv(resp.text, series_id)
    except Exception as exc:
        errors.append(f"FRED CSV: {exc}")

    raise FREDUnreachableError(
        f"All FRED reachability paths failed for {series_id!r}: " + " | ".join(errors)
    )


def fetch_for_graph_node(node_id: str, **kwargs) -> pd.DataFrame:
    """Convenience: fetch the FRED series mapped to a graph node id."""
    series_id = GRAPH_SERIES.get(node_id)
    if not series_id:
        raise KeyError(f"no FRED series mapped to graph node {node_id!r}")
    return fetch_fred_series(series_id, **kwargs)


def with_fred_or_fallback(
    *,
    series_id: str,
    fallback,
    fallback_label: str = "fallback",
):
    """Wrap a FRED fetch with a fallback callable.

    Usage in a fitter:
        target = with_fred_or_fallback(
            series_id="CPIENGSL",
            fallback=lambda: imf_pink_sheet["Fuel Energy Index"],
            fallback_label="IMF Fuel Energy Index",
        )

    Returns ``(series, source_label)`` so the fit record can disclose
    which data path was actually used.
    """
    try:
        df = fetch_fred_series(series_id)
        return df.iloc[:, 0], f"FRED {series_id}"
    except FREDUnreachableError as exc:
        warnings.warn(
            f"FRED unreachable for {series_id} ({exc}); falling back to {fallback_label}",
            stacklevel=2,
        )
        return fallback(), fallback_label
