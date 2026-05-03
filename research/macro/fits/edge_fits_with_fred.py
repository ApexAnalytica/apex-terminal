"""Refit the P1/P2 channel weights using FRED targets when reachable.

Demonstrates the with_fred_or_fallback pattern: each fit tries the
US-specific FRED series first (e.g. CPIENGSL for ip_cpi_energy) and
silently falls back to the IMF global counterpart (Fuel Energy Index)
if FRED is blocked. The output records which path was used so
``fitted_weight`` is always traceable.

When FRED IS reachable (laptops, CI with network, prod), this run
produces *tighter* edge weights than research/macro/fits/edge_fits.py
because the target is the actual US series the graph node represents
rather than a global proxy.

Usage:
    export FRED_API_KEY=...        # optional but recommended
    python -m research.macro.fits.edge_fits_with_fred

Output: research/macro/output/edge_fits_fred.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets import (  # noqa: E402
    fetch_brent_monthly,
    fetch_imf_pink_sheet,
    with_fred_or_fallback,
)
from research.macro.estimators import ardl_fit  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "output" / "edge_fits_fred.json"


def _to_month_end(s):
    s = s.copy()
    s.index = pd.to_datetime(s.index).to_period("M").to_timestamp("M")
    return s


def _round(x, n=3):
    return float(round(x, n))


def fit_all() -> list[dict]:
    print("Loading data sources...")
    imf = fetch_imf_pink_sheet()
    brent = _to_month_end(fetch_brent_monthly()["brent_usd_bbl"])
    fuel_idx_imf = imf["Fuel Energy Index"].dropna()

    results = []

    # ── P1: Brent → CPI energy (FRED CPIENGSL preferred, IMF Fuel Energy fallback) ──
    target, target_label = with_fred_or_fallback(
        series_id="CPIENGSL",
        fallback=lambda: fuel_idx_imf,
        fallback_label="IMF Fuel Energy Index (proxy)",
    )
    target = _to_month_end(target)
    print(f"  channel target: {target_label}")
    fit = ardl_fit(
        edge="brent__cpi_energy_fred",
        source=brent,
        target=target,
        source_label="Brent crude (USD/bbl)",
        target_label=target_label,
        note="FRED-preferred refit of the P1 channel; falls back to IMF if FRED blocked.",
    )
    print(f"  long-run = {fit.long_run_multiplier:.3f} "
          f"[{fit.ci_lower:.3f}, {fit.ci_upper:.3f}], n={fit.n_obs}")
    results.append({
        "channel_id": "brent__cpi_energy",
        "edges_using_this_channel": [
            "sa_ras_tanura_terminal__ip_cpi_energy",
            "sa_abqaiq_plants__ip_cpi_energy",
            "qf_strait_of_hormuz__ip_cpi_energy",
            "qe_north_field_gas_field__ip_cpi_energy",
        ],
        "method": "ardl_direct",
        "source_proxy": fit.source_label,
        "target_proxy": fit.target_label,
        "data_path": "FRED" if "FRED" in target_label else "IMF fallback",
        "long_run_multiplier": _round(fit.long_run_multiplier),
        "ci_lower": _round(fit.ci_lower),
        "ci_upper": _round(fit.ci_upper),
        "selected_lag_months": fit.selected_lag_months,
        "n_obs": fit.n_obs,
        "sample_period": f"{fit.sample_start.date()} – {fit.sample_end.date()}",
        "note": fit.note,
    })

    return results


def main() -> None:
    results = fit_all()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nWrote {len(results)} channel fits to {OUT}")
    print("\n=== Summary ===")
    for r in results:
        print(f"  {r['channel_id']:30s}  β={r['long_run_multiplier']:+.3f}  n={r['n_obs']}  via {r['data_path']}")


if __name__ == "__main__":
    main()
