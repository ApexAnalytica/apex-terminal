"""Fit empirical weights for the 16 cross-domain edges shipped in PR #115.

Each edge maps a source-domain time series to a target-domain time series
through the closest available reachable proxy. Where a reachable proxy
does not exist (e.g., US monthly CPI subcomponents), we use the IMF's
global counterpart and disclose the proxy in the result row.

Output: ``research/macro/output/edge_fits.json`` — a list of fit
records that the TS port reads directly into ``graph-data.ts``.

Usage:
    python -m research.macro.fits.edge_fits

All data is fetched on first call and cached under ``output/_cache/``.
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

# Allow running as a script *or* a module.
if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets import (  # noqa: E402
    fetch_brent_monthly,
    fetch_imf_pink_sheet,
    fetch_natgas_monthly,
    fetch_us10y_monthly,
    fetch_wti_monthly,
    load_pwt_sovereign,
    load_us_quarterly,
)
from research.macro.datasets.disruption_events import load_disruption_events  # noqa: E402
from research.macro.estimators import ardl_fit, event_study  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "output" / "edge_fits.json"


def _to_weight(long_run_multiplier: float, *, share: float, cap: float = 0.95) -> float:
    """Map an ARDL long-run elasticity to a 0–1 graph edge weight.

    Graph weights are unsigned magnitudes 0–1 representing transmission
    strength. We apply ``share × long_run_multiplier`` (share = the
    source's portion of the global aggregate) and clip to ``cap``.
    """
    return float(np.clip(abs(long_run_multiplier) * share, 0.0, cap))


def _weight_from_event(abs_pct_per_pct_disruption: float, *, share: float, cap: float = 0.95) -> float:
    """Map an event-study response to a 0–1 weight.

    abs_pct_per_pct_disruption is the |abnormal % change in target| per
    1% peak source disruption, observed in the event window.
    """
    return float(np.clip(abs_pct_per_pct_disruption * share, 0.0, cap))


def _round(x: float, n: int = 3) -> float:
    return float(round(x, n))


def fit_all() -> list[dict]:
    """Run every fit and return a list of result records."""
    print("Loading data sources...")
    imf = fetch_imf_pink_sheet()
    brent = fetch_brent_monthly()
    wti = fetch_wti_monthly()
    natgas = fetch_natgas_monthly()
    us10y = fetch_us10y_monthly()
    pwt = load_pwt_sovereign()
    us_q = load_us_quarterly()
    events = load_disruption_events()

    # Common monthly frame — extend IMF series with current Brent/WTI/natgas
    # past 2017-06 by stitching where they overlap.
    def _stitch(imf_col: str, ext: pd.DataFrame, ext_col: str) -> pd.Series:
        ext = ext[ext_col].rename(imf_col)
        if imf_col not in imf:
            return ext
        old = imf[imf_col].dropna()
        # Use IMF up to its last date, EIA from the next month onward
        cutoff = old.index.max()
        new = ext[ext.index > cutoff]
        return pd.concat([old, new]).sort_index()

    brent_full = _stitch("Crude Oil - petroleum - Dated Brent light blend", brent, "brent_usd_bbl")
    wti_full = _stitch("Crude Oil petroleum - West Texas Intermediate 40 API", wti, "wti_usd_bbl")
    ng_full = _stitch(
        "Natural Gas - Spot price at the Henry Hub terminal in Louisiana",
        natgas,
        "natgas_henryhub_usd_mmbtu",
    )

    fuel_idx = imf["Fuel Energy Index"]
    food_idx = imf["Food Price Index"]
    all_comm = imf["All Commodity Price Index"]
    indust_inputs = imf["Industrial Inputs Price Index"]
    wheat = imf["Wheat"]
    iron_ore_china = imf["China import Iron Ore Fines 62% FE spot"]

    results: list[dict] = []

    # ─── P1: Energy → Inflation ──────────────────────────────────
    # The five P1 edges all run through one underlying channel:
    # an oil supply shock at the source raises global crude prices
    # which transmit to the IMF Fuel Energy Index (proxy for CPI energy).
    # We fit the channel once on Brent → Fuel Energy Index, then scale
    # by each source's documented share of global supply / chokepoint
    # transit volume.

    print("Fitting P1: Brent → IMF Fuel Energy Index ...")
    p1_channel = ardl_fit(
        edge="_channel_brent_to_fuel_energy",
        source=brent_full,
        target=fuel_idx,
        source_label="Brent crude (USD/bbl)",
        target_label="IMF Fuel Energy Index (proxy for ip_cpi_energy)",
        note="Brent → IMF Fuel Energy long-run multiplier; scaled by source share for each P1 edge.",
    )
    print(f"  long-run multiplier = {p1_channel.long_run_multiplier:.3f} "
          f"(95% CI [{p1_channel.ci_lower:.3f}, {p1_channel.ci_upper:.3f}], "
          f"n={p1_channel.n_obs}, AIC-lags p={p1_channel.p_lags} q={p1_channel.q_lags})")

    # Source-specific shares (documented):
    #  - Saudi Arabia ≈ 12% of global crude (sa_ras_tanura, sa_abqaiq each handle a major slice)
    #  - Strait of Hormuz ≈ 20% of global oil transit
    #  - Qatar ≈ 25% of global LNG (qe_north_field_gas_field, qe_ras_laffan_port)
    P1_SHARES = {
        "sa_ras_tanura_terminal__ip_cpi_energy": 0.07,   # Ras Tanura is ~6.5 Mbbl/d ≈ 6-7% of global crude
        "sa_abqaiq_plants__ip_cpi_energy": 0.07,         # Abqaiq processes ~7 Mbbl/d
        "qf_strait_of_hormuz__ip_cpi_energy": 0.20,      # Hormuz ~20% global crude transit
        "qe_north_field_gas_field__ip_cpi_energy": 0.10, # North Field ≈ 25% of LNG; CPI energy is mostly oil so partial
        "qe_ras_laffan_port__ip_ppi_energy": 0.10,       # Loading volume from same field
    }

    for edge_id, share in P1_SHARES.items():
        # qe_ras_laffan_port targets ip_ppi_energy not ip_cpi_energy — refit channel
        if edge_id.endswith("ip_ppi_energy"):
            ch = ardl_fit(
                edge=f"_channel_natgas_to_fuel_energy",
                source=ng_full,
                target=fuel_idx,
                source_label="Henry Hub natgas",
                target_label="IMF Fuel Energy (proxy for ip_ppi_energy)",
            )
        else:
            ch = p1_channel
        results.append({
            "edge_id": edge_id,
            "priority": "P1",
            "method": "ardl_channel_scaled",
            "source_proxy": ch.source_label,
            "target_proxy": ch.target_label,
            "long_run_multiplier": _round(ch.long_run_multiplier),
            "ci_lower": _round(ch.ci_lower),
            "ci_upper": _round(ch.ci_upper),
            "selected_lag_months": ch.selected_lag_months,
            "n_obs": ch.n_obs,
            "sample_period": f"{ch.sample_start.date()} – {ch.sample_end.date()}",
            "source_share_of_aggregate": share,
            "fitted_weight": _round(_to_weight(ch.long_run_multiplier, share=share)),
            "fitted_lag_months": max(1, ch.selected_lag_months),
            "fitted_confidence": _round(min(0.9, max(0.5, 1.0 - ch.se_long_run / max(abs(ch.long_run_multiplier), 1e-6) * 0.5))),
            "note": ch.note or "Source share scales the long-run elasticity into a transmission weight.",
        })

    # Augment with Abqaiq event study as a calibration cross-check.
    # Use a long window to compensate for monthly-frequency data.
    try:
        abqaiq = events[events["event_id"] == "evt_abqaiq_khurais_2019"].iloc[0]
        es = event_study(
            edge="sa_abqaiq_plants__ip_cpi_energy",
            event_id=abqaiq["event_id"],
            event_date=abqaiq["date_start"],
            target=brent_full,
            pre_window_days=180,
            post_window_days=90,
        )
        print(f"P1 cross-check: Abqaiq 2019 → Brent abnormal return = {es.abnormal_pct:.2f}% "
              f"(t={es.t_stat:.2f}, n={es.n_calendar_obs})")
    except Exception as exc:
        print(f"P1 event-study cross-check skipped: {exc}")

    # ─── P2: Food/Fertilizer → Inflation ─────────────────────────
    print("Fitting P2: Wheat → IMF Food Price Index ...")
    p2_food = ardl_fit(
        edge="_channel_wheat_to_food",
        source=wheat,
        target=food_idx,
        source_label="IMF Wheat price",
        target_label="IMF Food Price Index (proxy for ip_cpi_food)",
    )
    print(f"  long-run = {p2_food.long_run_multiplier:.3f} (n={p2_food.n_obs})")

    print("Fitting P2: Industrial Inputs (fertilizer proxy) → All Commodity Index ...")
    p2_fert = ardl_fit(
        edge="_channel_indust_inputs_to_all_comm",
        source=indust_inputs,
        target=all_comm,
        source_label="IMF Industrial Inputs (proxy for fertilizer)",
        target_label="IMF All Commodity Index (proxy for ip_ppi_all_commodities)",
    )

    # Source share for QAFCO/Ma'aden in global food / fertilizer markets:
    #  - QAFCO ≈ 6-7 Mtpa urea ≈ 4% of global urea
    #  - Ma'aden ≈ 6 Mtpa DAP ≈ 12% of global phosphate
    #  - sc_food_price_inflation IS the food index for MENA — share ≈ 0.5
    P2_FITS = [
        ("qf_global_food_prices__ip_cpi_food", p2_food, 0.10, "Global food prices indirectly driven by Gulf nitrogen supply."),
        ("mn_global_food_price_stress__ip_cpi_food", p2_food, 0.12, "Phosphate-driven food stress; Ma'aden ≈ 12% global DAP."),
        ("sc_food_price_inflation__ip_cpi_food", p2_food, 0.50, "MENA food inflation tracks the same wheat cycle as US CPI food."),
        ("sc_fertilizer_price_index__ip_ppi_all_commodities", p2_fert, 0.15, "Fertilizer is a key agricultural input commodity."),
    ]
    for edge_id, ch, share, note in P2_FITS:
        results.append({
            "edge_id": edge_id,
            "priority": "P2",
            "method": "ardl_channel_scaled",
            "source_proxy": ch.source_label,
            "target_proxy": ch.target_label,
            "long_run_multiplier": _round(ch.long_run_multiplier),
            "ci_lower": _round(ch.ci_lower),
            "ci_upper": _round(ch.ci_upper),
            "selected_lag_months": ch.selected_lag_months,
            "n_obs": ch.n_obs,
            "sample_period": f"{ch.sample_start.date()} – {ch.sample_end.date()}",
            "source_share_of_aggregate": share,
            "fitted_weight": _round(_to_weight(ch.long_run_multiplier, share=share)),
            "fitted_lag_months": max(1, ch.selected_lag_months),
            "fitted_confidence": _round(min(0.9, max(0.5, 1.0 - ch.se_long_run / max(abs(ch.long_run_multiplier), 1e-6) * 0.5))),
            "note": note,
        })

    # ─── P3: Supply Chain → Goods inflation ──────────────────────
    # No reachable monthly Baltic Dry / Drewry index. We use IMF
    # Industrial Inputs as a partial proxy for shipping-cost-driven
    # commodity pressure (correlated via fuel + freight components).
    # Edges marked status="partial_proxy" — flagged in the README.
    print("Fitting P3: Industrial Inputs → All Commodity Index (partial shipping proxy) ...")
    p3_ch = p2_fert  # same channel
    P3_EDGES = [
        ("sc_shipping_cost_index__ip_ppi_all_commodities", 0.30, "Shipping costs proxied via IMF Industrial Inputs co-movement; a Baltic Dry refit is a follow-on."),
        ("sc_shipping_cost_index__ip_cpi_goods", 0.25, "Shipping → goods inflation pass-through proxied by industrial-inputs/all-commodity fit."),
        ("ic_red_sea_exposure__ip_cpi_goods", 0.20, "Red Sea threat vector proxied through commodity volatility channel."),
    ]
    for edge_id, share, note in P3_EDGES:
        results.append({
            "edge_id": edge_id,
            "priority": "P3",
            "method": "ardl_channel_partial_proxy",
            "source_proxy": p3_ch.source_label + " (partial proxy for shipping)",
            "target_proxy": p3_ch.target_label,
            "long_run_multiplier": _round(p3_ch.long_run_multiplier),
            "ci_lower": _round(p3_ch.ci_lower),
            "ci_upper": _round(p3_ch.ci_upper),
            "selected_lag_months": p3_ch.selected_lag_months,
            "n_obs": p3_ch.n_obs,
            "sample_period": f"{p3_ch.sample_start.date()} – {p3_ch.sample_end.date()}",
            "source_share_of_aggregate": share,
            "fitted_weight": _round(_to_weight(p3_ch.long_run_multiplier, share=share)),
            "fitted_lag_months": max(1, p3_ch.selected_lag_months),
            "fitted_confidence": 0.55,  # capped lower — proxy is not direct
            "note": note + " Confidence capped at 0.55 to reflect proxy distance.",
            "status": "partial_proxy",
        })

    # ─── P4: Sovereign → US Macro feedback ───────────────────────
    # China iron-ore monthly is a high-fidelity proxy for China industrial demand.
    # Fit Iron Ore China import → IMF Industrial Inputs Index → use as the
    # "China demand" channel for all three P4 edges.
    print("Fitting P4: China Iron-Ore → Industrial Inputs ...")
    p4_ch = ardl_fit(
        edge="_channel_china_demand_to_indust_inputs",
        source=iron_ore_china,
        target=indust_inputs,
        source_label="IMF China import Iron Ore Fines 62% FE (China demand proxy)",
        target_label="IMF Industrial Inputs (proxy for global manufacturing tone)",
    )
    print(f"  long-run = {p4_ch.long_run_multiplier:.3f} (n={p4_ch.n_obs})")

    P4_EDGES = [
        ("sr_china_gdp__mi_ism_manufacturing", 0.40, "China industrial demand → US manufacturing PMI via export channel."),
        ("sr_china_gdp__mi_industrial_production", 0.35, "China demand → US IP via supply-chain feedback."),
        ("sr_china_gdp__ip_ppi_all_commodities", 0.55, "Direct: China is dominant marginal commodity demand setter."),
    ]
    for edge_id, share, note in P4_EDGES:
        results.append({
            "edge_id": edge_id,
            "priority": "P4",
            "method": "ardl_channel_scaled",
            "source_proxy": p4_ch.source_label,
            "target_proxy": p4_ch.target_label,
            "long_run_multiplier": _round(p4_ch.long_run_multiplier),
            "ci_lower": _round(p4_ch.ci_lower),
            "ci_upper": _round(p4_ch.ci_upper),
            "selected_lag_months": p4_ch.selected_lag_months,
            "n_obs": p4_ch.n_obs,
            "sample_period": f"{p4_ch.sample_start.date()} – {p4_ch.sample_end.date()}",
            "source_share_of_aggregate": share,
            "fitted_weight": _round(_to_weight(p4_ch.long_run_multiplier, share=share)),
            "fitted_lag_months": max(1, p4_ch.selected_lag_months),
            "fitted_confidence": _round(min(0.9, max(0.5, 1.0 - p4_ch.se_long_run / max(abs(p4_ch.long_run_multiplier), 1e-6) * 0.5))),
            "note": note,
        })

    return results


def main() -> None:
    results = fit_all()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nWrote {len(results)} edge fits to {OUT}")
    print("\n=== Summary ===")
    for r in results:
        print(f"  {r['edge_id']:55s}  w={r['fitted_weight']:.3f}  lag={r['fitted_lag_months']}  conf={r['fitted_confidence']:.2f}  ({r['priority']})")


if __name__ == "__main__":
    main()
