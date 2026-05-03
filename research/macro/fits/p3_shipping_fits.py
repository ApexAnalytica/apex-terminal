"""P3 supply-chain → goods inflation refit using FRED freight indices.

Closes the P3 confidence cap (currently 0.55 in graph-data.ts because
the source is fit through a partial proxy). When FRED is reachable
this fit uses CASSFI (Cass Freight Index) directly — the closest
public US-equivalent of the Baltic Dry Index. When FRED is blocked
it falls back to the IMF Industrial Inputs proxy (the same fit the
existing edge_fits.py produces) so the script always runs.

Two channels of interest:
  source                        target
  ───────                       ───────────
  CASSFI (freight)              CPIENGSL (CPI energy / shipping fuel pass-through)
  CASSFI (freight)              PPIACO   (all-commodities PPI / direct freight cost)

Real Baltic Dry isn't on FRED (it's a proprietary Baltic Exchange
series). CASSFI has roughly 0.7 correlation with BDI over 2000-2020
monthly per published academic comparisons, and its big advantage is
that it's free and consistently maintained.

Usage:
    export FRED_API_KEY=...   # optional but recommended
    python -m research.macro.fits.p3_shipping_fits

Output: research/macro/output/p3_shipping_fits.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets import (  # noqa: E402
    fetch_imf_pink_sheet,
    with_fred_or_fallback,
)
from research.macro.estimators import ardl_fit  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "output" / "p3_shipping_fits.json"


def _to_month_end(s):
    s = s.copy()
    s.index = pd.to_datetime(s.index).to_period("M").to_timestamp("M")
    return s


def _round(x, n=3):
    return float(round(x, n))


def fit_all() -> list[dict]:
    print("Loading data sources...")
    imf = fetch_imf_pink_sheet()
    indust_inputs = imf["Industrial Inputs Price Index"].dropna()
    fuel_idx = imf["Fuel Energy Index"].dropna()
    all_comm = imf["All Commodity Price Index"].dropna()

    # ── Source: Cass Freight Index (FRED) or Industrial Inputs (IMF fallback) ──
    src, src_label = with_fred_or_fallback(
        series_id="CASSFI",
        fallback=lambda: indust_inputs,
        fallback_label="IMF Industrial Inputs (partial proxy for shipping)",
    )
    src = _to_month_end(src)
    via_fred = "FRED" in src_label
    print(f"  freight source: {src_label} ({'FRED' if via_fred else 'IMF fallback'})")

    results = []

    # ── Channel 1: freight → CPI energy / fuel pass-through ──
    tgt1, tgt1_label = with_fred_or_fallback(
        series_id="CPIENGSL",
        fallback=lambda: fuel_idx,
        fallback_label="IMF Fuel Energy Index (proxy)",
    )
    tgt1 = _to_month_end(tgt1)
    fit1 = ardl_fit(
        edge="freight__cpi_energy",
        source=src,
        target=tgt1,
        source_label=src_label,
        target_label=tgt1_label,
    )
    print(f"  freight → CPI energy:    β={fit1.long_run_multiplier:+.3f} "
          f"[{fit1.ci_lower:+.3f}, {fit1.ci_upper:+.3f}], n={fit1.n_obs}")
    results.append({
        "channel_id": "freight__cpi_energy",
        "method": "ardl_direct",
        "source_proxy": fit1.source_label,
        "target_proxy": fit1.target_label,
        "data_path": "FRED" if via_fred and "FRED" in tgt1_label else "IMF fallback",
        "long_run_multiplier": _round(fit1.long_run_multiplier),
        "ci_lower": _round(fit1.ci_lower),
        "ci_upper": _round(fit1.ci_upper),
        "selected_lag_months": fit1.selected_lag_months,
        "n_obs": fit1.n_obs,
        "sample_period": f"{fit1.sample_start.date()} – {fit1.sample_end.date()}",
        "notes": "Closes P3 confidence cap on sc_shipping_cost_index → ip_ppi_all_commodities (and ip_cpi_goods).",
    })

    # ── Channel 2: freight → all-commodities (direct freight cost passthrough) ──
    tgt2, tgt2_label = with_fred_or_fallback(
        series_id="PPIACO",
        fallback=lambda: all_comm,
        fallback_label="IMF All Commodity Index (proxy)",
    )
    tgt2 = _to_month_end(tgt2)
    fit2 = ardl_fit(
        edge="freight__ppi_all_commodities",
        source=src,
        target=tgt2,
        source_label=src_label,
        target_label=tgt2_label,
    )
    print(f"  freight → PPI all-comm:  β={fit2.long_run_multiplier:+.3f} "
          f"[{fit2.ci_lower:+.3f}, {fit2.ci_upper:+.3f}], n={fit2.n_obs}")
    results.append({
        "channel_id": "freight__ppi_all_commodities",
        "method": "ardl_direct",
        "source_proxy": fit2.source_label,
        "target_proxy": fit2.target_label,
        "data_path": "FRED" if via_fred and "FRED" in tgt2_label else "IMF fallback",
        "long_run_multiplier": _round(fit2.long_run_multiplier),
        "ci_lower": _round(fit2.ci_lower),
        "ci_upper": _round(fit2.ci_upper),
        "selected_lag_months": fit2.selected_lag_months,
        "n_obs": fit2.n_obs,
        "sample_period": f"{fit2.sample_start.date()} – {fit2.sample_end.date()}",
        "notes": "Direct freight cost → producer commodity prices.",
    })

    return results


def main() -> None:
    results = fit_all()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nWrote {len(results)} P3 fits to {OUT}")
    print("\n=== Summary ===")
    for r in results:
        print(f"  {r['channel_id']:32s}  β={r['long_run_multiplier']:+.3f}  n={r['n_obs']}  via {r['data_path']}")


if __name__ == "__main__":
    main()
