"""Out-of-sample (OOS) validation for the empirical channel fits.

Production rigor check: the in-sample long-run multipliers in
``output/edge_fits.json`` and ``output/dxy_fits.json`` are useful
edge weights only if the underlying channel is *stable*. We test
that by splitting each channel-fit dataset 80/20, fitting ARDL on
the first 80% (train), then evaluating one-step-ahead forecasts on
the remaining 20% (test) using the train-fitted coefficients.

For each channel we report:
  - in-sample long-run β (fit on train)
  - test-period long-run β (refit on test, for stability check)
  - OOS R²            — fraction of test variance explained
  - OOS RMSE          — forecast error magnitude
  - structural-break flag — fires when |β_train − β_test| > 0.5·|β_train|

A negative OOS R² or a structural-break flag means the channel has
shifted and the in-sample weight should not be trusted for current-
regime extrapolation. We expect the IMF Pink Sheet channels to show
some shift since the IMF panel ends 2017 and a lot has happened since.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets import (  # noqa: E402
    fetch_brent_monthly,
    fetch_dxy_monthly,
    fetch_imf_pink_sheet,
    fetch_us10y_monthly,
)
from research.macro.estimators import ardl_fit  # noqa: E402


@dataclass
class OOSResult:
    label: str
    n_train: int
    n_test: int
    train_long_run: float
    test_long_run: float
    oos_r2: float
    oos_rmse: float
    structural_break: bool
    pass_: bool


def _ardl_predict(
    *,
    train_x: pd.Series,
    train_y: pd.Series,
    test_x: pd.Series,
    test_y: pd.Series,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Fit ARDL on (train_x, train_y) log-returns; return (predictions,
    realizations, train_long_run) over the test sample."""
    fit = ardl_fit(
        edge="_oos_train",
        source=train_x,
        target=train_y,
        source_label="x",
        target_label="y",
    )
    p, q = fit.p_lags, fit.q_lags
    # Reconstruct the regression on a rolling test window using train
    # coefficients. We need the same Δlog transform the fit applies.
    full_x = pd.concat([train_x, test_x]).sort_index()
    full_y = pd.concat([train_y, test_y]).sort_index()
    full = pd.concat([full_x.rename("x"), full_y.rename("y")], axis=1, sort=False).dropna()
    dlog = np.log(full.where(full > 0)).diff().dropna()

    # Reconstruct β layout: [const, y_lag1..y_lagp, x_lag0..x_lagq]
    beta_train = _refit_coeffs(dlog.loc[: train_y.index.max()], p, q)

    # Walk through test horizon predicting one step at a time.
    preds = []
    truths = []
    for t in dlog.index:
        if t <= train_y.index.max():
            continue
        # We need lag rows up through t-1
        try:
            row = [1.0]
            for i in range(1, p + 1):
                row.append(dlog["y"].shift(i).loc[t])
            for j in range(0, q + 1):
                row.append(dlog["x"].shift(j).loc[t])
            row_arr = np.array(row, dtype=float)
            if np.isnan(row_arr).any():
                continue
            preds.append(float(row_arr @ beta_train))
            truths.append(float(dlog["y"].loc[t]))
        except KeyError:
            continue
    return np.array(preds), np.array(truths), fit.long_run_multiplier


def _refit_coeffs(dlog: pd.DataFrame, p: int, q: int) -> np.ndarray:
    cols = {"const": np.ones(len(dlog))}
    for i in range(1, p + 1):
        cols[f"y_lag{i}"] = dlog["y"].shift(i)
    for j in range(0, q + 1):
        cols[f"x_lag{j}"] = dlog["x"].shift(j)
    df = pd.DataFrame(cols, index=dlog.index)
    df["__y"] = dlog["y"]
    df = df.dropna()
    Y = df["__y"].to_numpy()
    X = df.drop(columns=["__y"]).to_numpy()
    beta, *_ = np.linalg.lstsq(X, Y, rcond=None)
    return beta


def _split_80_20(x: pd.Series, y: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    """Align ``x`` and ``y`` to a shared month-end index, then split 80/20."""
    x_aligned = x.copy()
    x_aligned.index = pd.to_datetime(x_aligned.index).to_period("M").to_timestamp("M")
    y_aligned = y.copy()
    y_aligned.index = pd.to_datetime(y_aligned.index).to_period("M").to_timestamp("M")
    common = pd.concat([x_aligned, y_aligned], axis=1, sort=False).dropna().index
    if len(common) < 24:
        raise ValueError(f"too little overlapping monthly data: {len(common)} obs")
    cutoff = common[int(len(common) * 0.8)]
    return (
        x_aligned.loc[x_aligned.index <= cutoff],
        y_aligned.loc[y_aligned.index <= cutoff],
        x_aligned.loc[x_aligned.index > cutoff],
        y_aligned.loc[y_aligned.index > cutoff],
    )


def _validate(
    *,
    label: str,
    x: pd.Series,
    y: pd.Series,
    structural_break_tol: float = 0.5,
) -> OOSResult:
    train_x, train_y, test_x, test_y = _split_80_20(x, y)
    if len(test_x) < 12:
        raise ValueError(f"{label}: too little test data ({len(test_x)} obs)")

    preds, truths, train_lr = _ardl_predict(
        train_x=train_x, train_y=train_y, test_x=test_x, test_y=test_y
    )
    if len(preds) < 6:
        raise ValueError(f"{label}: too few OOS predictions ({len(preds)})")

    test_fit = ardl_fit(
        edge="_oos_test_refit",
        source=test_x,
        target=test_y,
        source_label="x",
        target_label="y",
    )

    ss_res = float(((truths - preds) ** 2).sum())
    ss_tot = float(((truths - truths.mean()) ** 2).sum())
    oos_r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    oos_rmse = float(np.sqrt(((truths - preds) ** 2).mean()))

    drift = abs(test_fit.long_run_multiplier - train_lr)
    rel_drift = drift / max(abs(train_lr), 1e-6)
    sb = rel_drift > structural_break_tol

    pass_ = oos_r2 > -0.10  # allow slight negative R² (forecast worse than mean) before failing
    print(
        f"  [{label:35s}] β_train={train_lr:+.3f}  β_test={test_fit.long_run_multiplier:+.3f}  "
        f"|drift|={drift:.3f} ({rel_drift*100:.0f}%)  OOS R²={oos_r2:+.3f}  "
        f"RMSE={oos_rmse:.4f}  {'BREAK' if sb else 'stable':6s}  → {'PASS' if pass_ else 'FAIL'}"
    )
    return OOSResult(
        label=label,
        n_train=len(train_x),
        n_test=len(test_x),
        train_long_run=train_lr,
        test_long_run=test_fit.long_run_multiplier,
        oos_r2=oos_r2,
        oos_rmse=oos_rmse,
        structural_break=sb,
        pass_=pass_,
    )


def main() -> None:
    print("=== OOS rolling validation on real channel fits ===\n")
    print("(80/20 train/test split; one-step-ahead forecast; expects OOS R² > -0.10)\n")

    imf = fetch_imf_pink_sheet()
    dxy = fetch_dxy_monthly()["dxy"]
    us10y = fetch_us10y_monthly()["us10y_pct"]
    brent = fetch_brent_monthly()["brent_usd_bbl"]

    fuel_idx = imf["Fuel Energy Index"]
    food_idx = imf["Food Price Index"]
    indust_inputs = imf["Industrial Inputs Price Index"]
    all_comm = imf["All Commodity Price Index"]
    iron_ore = imf["China import Iron Ore Fines 62% FE spot"]
    wheat = imf["Wheat"]

    results = [
        _validate(label="P1: Brent → IMF Fuel Energy", x=brent, y=fuel_idx),
        _validate(label="P2: Wheat → IMF Food Index", x=wheat, y=food_idx),
        _validate(label="P3: Indust Inputs → All Comm.", x=indust_inputs, y=all_comm),
        _validate(label="P4: China Iron-Ore → Indust In.", x=iron_ore, y=indust_inputs),
        _validate(label="DXY: US10y → DXY", x=us10y, y=dxy),
        _validate(label="DXY: DXY → All Commodity", x=dxy, y=all_comm),
    ]

    n_pass = sum(r.pass_ for r in results)
    n_break = sum(r.structural_break for r in results)
    print(f"\n=== {n_pass} / {len(results)} pass; {n_break} structural break(s) flagged ===")
    if n_pass != len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
