"""Empirical fits for the DXY (USD-strength) edges.

Closes the FX feedback loop deferred from PR #115:

    ip_fed_funds_effective ──▶ mi_dxy ──▶ ip_cpi_goods
                                   │
                                   ├─▶ fc_fx_pressure  (EM weakness)
                                   └─▶ fc_em_fx_reserves

Channels we can fit empirically with reachable data:
  - US10y monthly  ──▶  DXY            (rate-differential proxy)
  - DXY            ──▶  IMF All-Comm.   (USD strength → commodity prices,
                                         expected NEGATIVE long-run sign;
                                         proxy for ip_cpi_goods import-
                                         price channel)

Channels left as literature-cited (no reachable EM FX panel from this
sandbox; flagged in research/macro/README.md and the PR description):
  - mi_dxy → fc_fx_pressure
  - mi_dxy → fc_em_fx_reserves

Output: ``output/dxy_fits.json`` — read by the graph-data.ts port.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets import (  # noqa: E402
    fetch_dxy_monthly,
    fetch_imf_pink_sheet,
    fetch_us10y_monthly,
)
from research.macro.estimators import ardl_fit  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "output" / "dxy_fits.json"


def _to_weight(long_run_multiplier: float, *, share: float, cap: float = 0.95) -> float:
    return float(np.clip(abs(long_run_multiplier) * share, 0.0, cap))


def _round(x: float, n: int = 3) -> float:
    return float(round(x, n))


def fit_all() -> list[dict]:
    print("Loading data sources...")
    dxy = fetch_dxy_monthly()["dxy"]
    us10y = fetch_us10y_monthly()["us10y_pct"]
    imf = fetch_imf_pink_sheet()
    all_comm = imf["All Commodity Price Index"]

    results: list[dict] = []

    # ── Edge 1: ip_fed_funds_effective → mi_dxy ──
    # Channel: US 10y monthly → DXY, ARDL on log-returns. US10y is the
    # cleanest reachable proxy for the Fed-funds → long-end → USD-strength
    # transmission. AIC-selected lag, HAC SEs.
    print("Fitting US10y → DXY ...")
    rate_to_dxy = ardl_fit(
        edge="ip_fed_funds_effective__mi_dxy",
        source=us10y,
        target=dxy,
        source_label="US 10y Treasury yield (%)",
        target_label="Synthetic DXY (basket of 6 majors)",
        note="US10y is the closest reachable proxy for fed funds policy stance over the DXY sample (1999+).",
    )
    print(f"  long-run = {rate_to_dxy.long_run_multiplier:.3f} "
          f"[{rate_to_dxy.ci_lower:.3f}, {rate_to_dxy.ci_upper:.3f}], n={rate_to_dxy.n_obs}")
    results.append({
        "edge_id": "ip_fed_funds_effective__mi_dxy",
        "method": "ardl_direct",
        "source_proxy": rate_to_dxy.source_label,
        "target_proxy": rate_to_dxy.target_label,
        "long_run_multiplier": _round(rate_to_dxy.long_run_multiplier),
        "ci_lower": _round(rate_to_dxy.ci_lower),
        "ci_upper": _round(rate_to_dxy.ci_upper),
        "selected_lag_months": rate_to_dxy.selected_lag_months,
        "n_obs": rate_to_dxy.n_obs,
        "sample_period": f"{rate_to_dxy.sample_start.date()} – {rate_to_dxy.sample_end.date()}",
        "fitted_weight": _round(_to_weight(rate_to_dxy.long_run_multiplier, share=1.0)),
        "fitted_lag_months": max(1, rate_to_dxy.selected_lag_months),
        "fitted_confidence": _round(min(0.9, max(0.5, 1.0 - rate_to_dxy.se_long_run / max(abs(rate_to_dxy.long_run_multiplier), 1e-6) * 0.5))),
        "sign": rate_to_dxy.sign,
        "note": rate_to_dxy.note,
    })

    # ── Edge 2: mi_dxy → ip_cpi_goods (NEGATIVE expected) ──
    # Stronger USD → commodity prices fall (commodities priced in USD;
    # foreign holders' purchasing power drops). IMF All Commodity Index
    # is the closest reachable proxy for ip_cpi_goods import-price
    # transmission. Long-run multiplier should be negative.
    print("Fitting DXY → IMF All Commodity Index ...")
    dxy_to_comm = ardl_fit(
        edge="mi_dxy__ip_cpi_goods",
        source=dxy,
        target=all_comm,
        source_label="Synthetic DXY",
        target_label="IMF All Commodity Index (proxy for ip_cpi_goods import-price channel)",
        note="Negative long-run multiplier expected: stronger USD compresses USD-priced commodity inputs to US goods.",
    )
    print(f"  long-run = {dxy_to_comm.long_run_multiplier:.3f} "
          f"[{dxy_to_comm.ci_lower:.3f}, {dxy_to_comm.ci_upper:.3f}], n={dxy_to_comm.n_obs}")
    results.append({
        "edge_id": "mi_dxy__ip_cpi_goods",
        "method": "ardl_direct_negative",
        "source_proxy": dxy_to_comm.source_label,
        "target_proxy": dxy_to_comm.target_label,
        "long_run_multiplier": _round(dxy_to_comm.long_run_multiplier),
        "ci_lower": _round(dxy_to_comm.ci_lower),
        "ci_upper": _round(dxy_to_comm.ci_upper),
        "selected_lag_months": dxy_to_comm.selected_lag_months,
        "n_obs": dxy_to_comm.n_obs,
        "sample_period": f"{dxy_to_comm.sample_start.date()} – {dxy_to_comm.sample_end.date()}",
        # Magnitude only for the graph weight; sign goes into the edge as a separate field.
        "fitted_weight": _round(_to_weight(dxy_to_comm.long_run_multiplier, share=1.0)),
        "fitted_lag_months": max(1, dxy_to_comm.selected_lag_months),
        "fitted_confidence": _round(min(0.9, max(0.5, 1.0 - dxy_to_comm.se_long_run / max(abs(dxy_to_comm.long_run_multiplier), 1e-6) * 0.5))),
        "sign": dxy_to_comm.sign,
        "note": dxy_to_comm.note,
    })

    # ── Edges 3-4: mi_dxy → fc_fx_pressure / fc_em_fx_reserves ──
    # Channel is the textbook "US dollar funding squeeze" (Bruno-Shin
    # 2015, Hofmann-Patel-Wu 2022). EM corporates with USD-denominated
    # debt face higher rollover costs as DXY rises; central banks burn
    # reserves defending pegs. Magnitudes from the literature put a
    # 1% DXY appreciation at roughly 0.5-0.7% EM FX depreciation in
    # the medium term.
    #
    # We don't have an EM FX pressure index reachable from this
    # sandbox — these stay literature-cited and flagged.
    for edge_id, weight, conf, note in [
        (
            "mi_dxy__fc_fx_pressure",
            0.6,
            0.65,
            "Bruno-Shin 2015 / Hofmann-Patel-Wu 2022: 1% DXY appreciation ≈ 0.5-0.7% EM FX depreciation. Literature-cited; refit pending EM FX panel access.",
        ),
        (
            "mi_dxy__fc_em_fx_reserves",
            0.45,
            0.6,
            "EM central banks burn reserves defending currencies as DXY strengthens. Literature-cited; refit pending EM reserves panel access.",
        ),
    ]:
        results.append({
            "edge_id": edge_id,
            "method": "literature_cited",
            "source_proxy": "Synthetic DXY",
            "target_proxy": "no reachable proxy",
            "long_run_multiplier": None,
            "ci_lower": None,
            "ci_upper": None,
            "selected_lag_months": 1,
            "n_obs": 0,
            "sample_period": "n/a",
            "fitted_weight": weight,
            "fitted_lag_months": 1,
            "fitted_confidence": conf,
            "sign": 1,
            "note": note,
        })

    return results


def main() -> None:
    results = fit_all()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nWrote {len(results)} DXY fits to {OUT}")
    print("\n=== Summary ===")
    for r in results:
        sign_marker = "−" if r.get("sign", 1) < 0 else "+"
        print(f"  {r['edge_id']:45s}  weight={sign_marker}{r['fitted_weight']:.3f}  lag={r['fitted_lag_months']}  conf={r['fitted_confidence']:.2f}  ({r['method']})")


if __name__ == "__main__":
    main()
