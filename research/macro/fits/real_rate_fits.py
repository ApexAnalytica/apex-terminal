"""Empirical fits for the real-rate node + edges.

Replaces the weak direct ``ip_fed_funds_effective → ip_dxy`` channel
(β=+0.014, CI includes zero, structural break flagged in OOS) with a
two-step chain via a real-rate intermediary that captures the actual
causal mechanism:

    ip_fed_funds_effective ──▶ ip_real_rate_10y ──▶ ip_dxy

Empirical fits:
  - US10y → synthetic real rate    (effective floor: identity-ish)
  - synthetic real rate → DXY       (the channel that should fit cleanly)

We don't fit Fed-funds → real-rate empirically here because we don't
have monthly fed funds in our reachable data; the structural edge is
left at literature-cited weight.
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
    fetch_dxy_monthly,
    fetch_real_rate_10y_monthly,
    fetch_us10y_monthly,
)
from research.macro.estimators import ardl_fit  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "output" / "real_rate_fits.json"


def _to_weight(long_run_multiplier: float, *, share: float = 1.0, cap: float = 0.95) -> float:
    return float(np.clip(abs(long_run_multiplier) * share, 0.0, cap))


def _round(x: float, n: int = 3) -> float:
    return float(round(x, n))


def _to_month_end(s):
    s = s.copy()
    s.index = pd.to_datetime(s.index).to_period("M").to_timestamp("M")
    return s


def fit_all() -> list[dict]:
    print("Loading data sources...")
    us10y = _to_month_end(fetch_us10y_monthly()["us10y_pct"])
    real_rate = _to_month_end(fetch_real_rate_10y_monthly()["real_rate_10y"])
    dxy = _to_month_end(fetch_dxy_monthly()["dxy"])

    results: list[dict] = []

    # ── Edge: ip_fed_funds_effective → ip_real_rate_10y ──
    # Channel: US10y → real rate. Identity-ish (the synthetic real rate
    # is constructed as us10y minus inflation_proxy, so this is mostly
    # mechanical). Documented for graph completeness but the meaningful
    # empirical content is in the next edge.
    print("Fitting US10y → synthetic real rate ...")
    fit_rr_drive = ardl_fit(
        edge="ip_fed_funds_effective__ip_real_rate_10y",
        source=us10y,
        target=real_rate,
        source_label="US 10y Treasury yield",
        target_label="synthetic real 10y rate",
        note="Mechanical identity (real = nominal - inflation proxy); fit included for completeness.",
        transform="diff",
    )
    print(f"  long-run = {fit_rr_drive.long_run_multiplier:.3f} "
          f"[{fit_rr_drive.ci_lower:.3f}, {fit_rr_drive.ci_upper:.3f}], n={fit_rr_drive.n_obs}")
    results.append({
        "edge_id": "ip_fed_funds_effective__ip_real_rate_10y",
        "method": "ardl_direct",
        "source_proxy": fit_rr_drive.source_label,
        "target_proxy": fit_rr_drive.target_label,
        "long_run_multiplier": _round(fit_rr_drive.long_run_multiplier),
        "ci_lower": _round(fit_rr_drive.ci_lower),
        "ci_upper": _round(fit_rr_drive.ci_upper),
        "selected_lag_months": fit_rr_drive.selected_lag_months,
        "n_obs": fit_rr_drive.n_obs,
        "sample_period": f"{fit_rr_drive.sample_start.date()} – {fit_rr_drive.sample_end.date()}",
        "fitted_weight": _round(_to_weight(fit_rr_drive.long_run_multiplier)),
        "fitted_lag_months": max(1, fit_rr_drive.selected_lag_months),
        "fitted_confidence": _round(min(0.9, max(0.5, 1.0 - fit_rr_drive.se_long_run / max(abs(fit_rr_drive.long_run_multiplier), 1e-6) * 0.5))),
        "sign": fit_rr_drive.sign,
        "note": fit_rr_drive.note,
    })

    # ── Edge: ip_real_rate_10y → ip_dxy ──
    # Theoretically: high US real rates pull capital in, strengthening
    # the dollar. Empirically with our smoothed-commodity-YoY proxy the
    # ARDL fit comes in near zero with a wide CI — both ("level",
    # "log_diff") and ("diff", "diff") specifications (β = -0.000 [-0.001,
    # 0.001] and β = -0.105 [-0.775, 0.565] respectively, n≈220). That's
    # honest — our proxy is too noisy for monthly returns and the channel
    # is confounded by forward-guidance shifts, risk-on/off regimes, and
    # trade-policy news that move DXY independent of real rates.
    #
    # We fall back to a literature-cited weight: Engel-Mark-West 2007
    # ("Exchange Rate Models Are Not As Bad As You Think") and Stavrakeva-
    # Tang 2024 (real-rate-differential model) put a 1pp rise in the US-
    # foreign 10y real-rate differential at roughly +5-7% DXY appreciation
    # over 12-18 months; on our weight scale (transmission elasticity)
    # that's ≈0.5-0.7 with a 6-month lag. We pick 0.6, conf 0.65.
    #
    # When TIPS data becomes reachable (FRED DFII10), refit empirically
    # — the topology stays unchanged, only the weight tightens.
    results.append({
        "edge_id": "ip_real_rate_10y__ip_dxy",
        "method": "literature_cited",
        "source_proxy": "synthetic real 10y rate (proxy)",
        "target_proxy": "Synthetic DXY",
        "long_run_multiplier": None,
        "ci_lower": None,
        "ci_upper": None,
        "selected_lag_months": 6,
        "n_obs": 0,
        "sample_period": "n/a — literature-cited",
        "fitted_weight": 0.6,
        "fitted_lag_months": 6,
        "fitted_confidence": 0.65,
        "sign": 1,
        "note": (
            "Engel-Mark-West 2007 + Stavrakeva-Tang 2024: 1pp rise in 10y real-rate "
            "differential maps to +5-7% DXY appreciation over 12-18 months. "
            "Empirical refit on synthetic-proxy real rate produced near-zero "
            "monthly fit (β=-0.000 [-0.001, 0.001], n=219) — proxy is too noisy "
            "for short-horizon channel detection. Refit pending FRED DFII10 access."
        ),
    })

    return results


def main() -> None:
    results = fit_all()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nWrote {len(results)} real-rate fits to {OUT}")
    print("\n=== Summary ===")
    for r in results:
        sign_marker = "−" if r.get("sign", 1) < 0 else "+"
        print(f"  {r['edge_id']:50s}  weight={sign_marker}{r['fitted_weight']:.3f}  lag={r['fitted_lag_months']}  conf={r['fitted_confidence']:.2f}")


if __name__ == "__main__":
    main()
