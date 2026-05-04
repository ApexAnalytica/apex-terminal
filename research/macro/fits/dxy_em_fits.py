"""Empirical refit of the two literature-cited DXY → EM edges.

Closes the deferred edges in PR #129's dxy_fits.json:

    ip_dxy → fc_fx_pressure       (was 0.6,  literature-cited Bruno-Shin 2015)
    ip_dxy → fc_em_fx_reserves    (was 0.45, literature-cited)

Sandbox-reachable data sources:

  EM FX panel (datasets/exchange-rates monthly mirror):
      Brazil, India, Mexico, South Africa, Thailand, Malaysia, Sri Lanka.
      Euro / GBP excluded (DM, not EM); China / Singapore excluded
      (managed peg). Geometric panel mean of LCU/USD rates becomes the
      EM FX index — rises when EMs depreciate vs USD, exactly the
      `fc_fx_pressure` direction.

  EM reserves panel (PIMCO sovereign workbook in claire/timeseries.json):
      20 EMs × 15 annual observations 2010-2024. Annual reduces N but the
      DXY → reserves channel runs over multi-year cycles (2014-2016 shock,
      2022-2023 shock) so the time-aggregated regression has enough signal.

Method:
  - Construct synthetic DXY (research/macro/datasets/dxy.py).
  - For FX pressure: ARDL on log-diff EM FX panel mean ~ log-diff DXY.
  - For reserves: pooled panel ARDL on log-diff reserves ~ log-diff DXY,
    annual frequency. Within-country differencing controls for fixed
    effects without estimating them explicitly.

Output: ``research/macro/output/dxy_em_fits.json``, consumed by the
graph-data.ts port for the two edge weights.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets._cache import cached_get  # noqa: E402
from research.macro.datasets.dxy import fetch_dxy_monthly  # noqa: E402
from research.macro.estimators import ardl_fit  # noqa: E402

EXCHANGE_RATES_URL = "https://raw.githubusercontent.com/datasets/exchange-rates/main/data/monthly.csv"
PIMCO_PATH = (
    Path(__file__).resolve().parents[3]
    / "public"
    / "datasets"
    / "claire"
    / "timeseries.json"
)
OUT = Path(__file__).resolve().parents[1] / "output" / "dxy_em_fits.json"

# EMs present in the exchange-rates mirror that we treat as the panel.
# Excluded: China (managed peg, fix would mask the channel), Singapore /
# Hong Kong (DM-like), Venezuela (hyperinflation regime contaminates the
# log-diff). Subset reflects what's actually in the mirror — Turkey,
# Argentina, Indonesia, Colombia aren't covered.
EM_FX_PANEL = ["Brazil", "India", "Mexico", "South Africa", "Thailand", "Malaysia", "Sri Lanka"]

# EMs in the PIMCO reserves panel. Drop oil-state Saudi (managed FX
# anchored to USD breaks the channel) and tiny Bangladesh/Lebanon/Zambia
# series with structural breaks. Keep the sample large enough to identify
# the long-run multiplier.
EM_RESERVES_PANEL = [
    "Brazil", "Mexico", "Colombia", "Turkey", "Argentina",
    "South Africa", "Egypt", "Morocco", "Tunisia", "Nigeria",
    "Pakistan", "Sri Lanka", "Philippines", "Kenya", "Ghana",
]


def load_em_fx_panel() -> pd.Series:
    raw = cached_get(EXCHANGE_RATES_URL)
    import io
    df = pd.read_csv(io.BytesIO(raw))
    df["Date"] = pd.to_datetime(df["Date"])
    wide = (
        df[df["Country"].isin(EM_FX_PANEL)]
        .pivot(index="Date", columns="Country", values="Exchange rate")
        .sort_index()
    )
    # Drop rows with any missing currency so the geometric mean stays
    # comparable across the panel sample.
    wide = wide.dropna(how="any")
    # Equal-weighted geometric mean of LCU/USD: rises ↔ EM depreciation.
    log_em_fx = np.log(wide).mean(axis=1)
    s = np.exp(log_em_fx)
    s.name = "em_fx_index"
    return s


def load_em_reserves_panel() -> pd.DataFrame:
    payload = json.loads(PIMCO_PATH.read_text())
    rows = payload.get("pimco_sovereign", [])
    df = pd.DataFrame(rows)
    df = df[df["country"].isin(EM_RESERVES_PANEL)].copy()
    df = df[["country", "date", "fx_reserves_usd"]].dropna()
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    return df.sort_values(["country", "year"]).reset_index(drop=True)


def fit_dxy_to_em_fx(dxy: pd.Series, em_fx: pd.Series) -> dict:
    """Long-run multiplier of EM FX (LCU/USD basket) to DXY moves.

    Both series are LCU/USD-style, so a positive long-run multiplier
    means: when DXY rises 1%, the EM FX basket also depreciates β%.
    Bruno-Shin / Hofmann-Patel-Wu predict β ≈ 0.5–0.7 over the medium
    term. The fitted weight is the magnitude (already in the right
    direction)."""
    res = ardl_fit(
        edge="ip_dxy__fc_fx_pressure",
        source=dxy,
        target=em_fx,
        source_label="Synthetic DXY (basket of 6 majors)",
        target_label="EM FX panel geometric mean (7 currencies)",
        transform="log_diff",
    )
    weight = float(np.clip(abs(res.long_run_multiplier), 0.0, 0.95))
    return {
        "edge_id": "ip_dxy__fc_fx_pressure",
        "method": "ardl_em_fx_panel",
        "source_proxy": res.source_label,
        "target_proxy": res.target_label,
        "long_run_multiplier": round(res.long_run_multiplier, 4),
        "ci_lower": round(res.ci_lower, 4),
        "ci_upper": round(res.ci_upper, 4),
        "selected_lag_months": res.selected_lag_months,
        "n_obs": res.n_obs,
        "sample_period": f"{res.sample_start.date()} – {res.sample_end.date()}",
        "fitted_weight": round(weight, 3),
        "fitted_lag_months": max(1, res.selected_lag_months),
        "fitted_confidence": 0.8,
        "sign": int(np.sign(res.long_run_multiplier)) or 1,
        "panel": EM_FX_PANEL,
        "note": (
            "Empirical refit on EM FX panel. ARDL of log-diff EM FX index "
            "(equal-weighted geometric mean of "
            f"{len(EM_FX_PANEL)} EM LCU/USD rates) on log-diff synthetic "
            "DXY. Long-run β is the cumulative response of the EM basket "
            "to a permanent 1% DXY appreciation."
        ),
    }


def fit_dxy_to_em_reserves(dxy_monthly: pd.Series, reserves: pd.DataFrame) -> dict:
    """Pooled panel ARDL: Δlog(reserves_{i,t}) ~ Δlog(DXY_t).

    Annual frequency: country-fixed-effects fall out of first-differencing
    so we don't need explicit dummies. We pool the within-country
    log-differences across all panel countries and fit a single
    long-run multiplier. Expected sign: NEGATIVE — stronger DXY drains
    EM reserves (CB intervention).
    """
    dxy_annual = (
        dxy_monthly.groupby(dxy_monthly.index.year).mean()
    )
    dxy_annual.index = pd.to_datetime(dxy_annual.index.astype(int).astype(str) + "-12-31")
    dxy_log_diff = np.log(dxy_annual).diff().dropna()
    dxy_log_diff.index = dxy_log_diff.index.year

    rows: list[tuple[float, float]] = []
    by_country: dict[str, int] = {}
    for c, g in reserves.groupby("country"):
        g = g.sort_values("year").set_index("year")["fx_reserves_usd"]
        g = g[g > 0]
        if len(g) < 4:
            continue
        log_diff = np.log(g).diff().dropna()
        for yr, dr in log_diff.items():
            if yr in dxy_log_diff.index:
                rows.append((float(dxy_log_diff.loc[yr]), float(dr)))
        by_country[c] = len(log_diff)

    arr = np.array(rows)
    if len(arr) < 30:
        raise RuntimeError(f"too few panel obs: {len(arr)}")
    x = arr[:, 0]
    y = arr[:, 1]
    # OLS with intercept; report the slope as the long-run multiplier
    # (annual frequency, single contemporaneous regressor — the q=0
    # ARDL collapses to a level regression on differences).
    X = np.column_stack([np.ones_like(x), x])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    n, k = X.shape
    sse = float(resid @ resid)
    sigma2 = sse / (n - k)
    cov = sigma2 * np.linalg.inv(X.T @ X)
    se_slope = float(np.sqrt(cov[1, 1]))
    long_run = float(beta[1])
    ci_l = long_run - 1.96 * se_slope
    ci_u = long_run + 1.96 * se_slope
    weight = float(np.clip(abs(long_run), 0.0, 0.95))

    return {
        "edge_id": "ip_dxy__fc_em_fx_reserves",
        "method": "pooled_panel_ols_log_diff",
        "source_proxy": "Synthetic DXY (annual mean)",
        "target_proxy": f"PIMCO sovereign FX reserves panel ({len(by_country)} EMs, annual)",
        "long_run_multiplier": round(long_run, 4),
        "ci_lower": round(ci_l, 4),
        "ci_upper": round(ci_u, 4),
        "selected_lag_months": 0,
        "n_obs": int(n),
        "sample_period": (
            f"{int(min(dxy_log_diff.index))} – {int(max(dxy_log_diff.index))} (annual, pooled)"
        ),
        "fitted_weight": round(weight, 3),
        "fitted_lag_months": 12,  # annual cadence; expressed as months
        "fitted_confidence": 0.7,
        "sign": int(np.sign(long_run)) or -1,
        "panel": list(by_country.keys()),
        "note": (
            "Empirical refit on PIMCO EM reserves panel. Pooled OLS of "
            "Δlog(reserves) on Δlog(DXY), annual 2011–2024. Country FE "
            "absorbed by within-country differencing. Sign expected "
            "negative (stronger DXY drains reserves); fitted_weight is "
            "the magnitude."
        ),
    }


def main() -> None:
    print("Loading sources …")
    dxy_monthly = fetch_dxy_monthly()["dxy"]
    em_fx = load_em_fx_panel()
    reserves = load_em_reserves_panel()

    print(f"  DXY:       {dxy_monthly.index.min().date()} → {dxy_monthly.index.max().date()}, n={len(dxy_monthly)}")
    print(f"  EM FX:     {em_fx.index.min().date()} → {em_fx.index.max().date()}, n={len(em_fx)}")
    print(f"  Reserves:  {reserves.year.min()} → {reserves.year.max()}, "
          f"{reserves.country.nunique()} countries, n={len(reserves)}")

    print("\nFitting ip_dxy → fc_fx_pressure …")
    fx_fit = fit_dxy_to_em_fx(dxy_monthly, em_fx)
    print(f"  long-run β = {fx_fit['long_run_multiplier']}  "
          f"CI [{fx_fit['ci_lower']}, {fx_fit['ci_upper']}]  "
          f"n={fx_fit['n_obs']}  weight={fx_fit['fitted_weight']}")

    print("\nFitting ip_dxy → fc_em_fx_reserves …")
    res_fit = fit_dxy_to_em_reserves(dxy_monthly, reserves)
    print(f"  long-run β = {res_fit['long_run_multiplier']}  "
          f"CI [{res_fit['ci_lower']}, {res_fit['ci_upper']}]  "
          f"n={res_fit['n_obs']}  weight={res_fit['fitted_weight']}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps([fx_fit, res_fit], indent=2))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
