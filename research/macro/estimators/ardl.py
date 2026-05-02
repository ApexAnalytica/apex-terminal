"""Autoregressive distributed-lag (ARDL) channel estimator.

Fits, on monthly stationary log-return data,

    Δy_t = α + Σ_{i=1..p} φ_i Δy_{t-i} + Σ_{j=0..q} β_j Δx_{t-j} + ε_t

selecting (p, q) by AIC over a small grid (p ∈ {1..3}, q ∈ {0..6}). The
returned ``long_run_multiplier`` Σβ_j is the cumulative response of Δy
to a permanent unit shock in Δx — exactly what an edge weight should
encode in a propagation graph. Standard errors use Newey–West HAC with
``floor(1.5·T^(1/3))`` lags so heteroskedastic + autocorrelated errors
don't bias inference.

Fitting is done from scratch with ``numpy`` so we don't depend on
``statsmodels.tsa.ardl`` (different versions ship different APIs).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class ARDLResult:
    """Fit summary for a single ARDL channel regression."""

    edge: str
    source_label: str
    target_label: str
    p_lags: int
    q_lags: int
    long_run_multiplier: float  # Σβ_j — what we use as the edge weight (post-rescale)
    impact_multiplier: float    # β_0 — same-period response
    se_long_run: float
    ci_lower: float
    ci_upper: float
    selected_lag_months: int    # argmax over j of β_j by absolute value
    n_obs: int
    sample_start: pd.Timestamp
    sample_end: pd.Timestamp
    aic: float
    sign: int
    note: str = ""


def _newey_west(X: np.ndarray, resid: np.ndarray, lags: int) -> np.ndarray:
    """Newey–West HAC covariance with Bartlett kernel."""
    n, k = X.shape
    XtX_inv = np.linalg.inv(X.T @ X)
    S = (X * resid[:, None]).T @ (X * resid[:, None])
    for L in range(1, lags + 1):
        w = 1.0 - L / (lags + 1)
        gamma = (X[L:] * resid[L:, None]).T @ (X[:-L] * resid[:-L, None])
        S = S + w * (gamma + gamma.T)
    return XtX_inv @ S @ XtX_inv * (n / (n - k))


def _build_lags(y: pd.Series, x: pd.Series, p: int, q: int) -> tuple[np.ndarray, np.ndarray]:
    cols = {"const": np.ones(len(y))}
    for i in range(1, p + 1):
        cols[f"y_lag{i}"] = y.shift(i)
    for j in range(0, q + 1):
        cols[f"x_lag{j}"] = x.shift(j)
    df = pd.DataFrame(cols, index=y.index)
    df["__y"] = y
    df = df.dropna()
    Y = df["__y"].to_numpy()
    X = df.drop(columns=["__y"]).to_numpy()
    return X, Y


def ardl_fit(
    *,
    edge: str,
    source: pd.Series,
    target: pd.Series,
    source_label: str = "",
    target_label: str = "",
    p_grid: tuple[int, ...] = (1, 2, 3),
    q_grid: tuple[int, ...] = (0, 1, 2, 3, 4, 6),
    note: str = "",
) -> ARDLResult:
    """Fit ARDL on log returns and return long-run multiplier as the edge weight."""
    # Align, log-difference (commodity prices are multiplicative).
    df = pd.concat([source.rename("x"), target.rename("y")], axis=1).dropna()
    df = np.log(df.where(df > 0)).diff().dropna()
    if len(df) < 24:
        raise ValueError(f"too few overlapping monthly obs for {edge}: {len(df)}")
    y = df["y"]
    x = df["x"]

    best: Optional[tuple[float, dict]] = None
    for p in p_grid:
        for q in q_grid:
            try:
                X, Y = _build_lags(y, x, p, q)
            except Exception:
                continue
            if len(Y) < 3 * (p + q + 2):
                continue
            beta, *_ = np.linalg.lstsq(X, Y, rcond=None)
            resid = Y - X @ beta
            sse = float(resid @ resid)
            n = len(Y)
            k = X.shape[1]
            aic = n * np.log(sse / n) + 2 * k
            if best is None or aic < best[0]:
                best = (
                    aic,
                    {"p": p, "q": q, "beta": beta, "resid": resid, "X": X, "n": n, "k": k},
                )
    if best is None:
        raise RuntimeError(f"ARDL grid empty for {edge}")
    fit = best[1]
    p, q = fit["p"], fit["q"]
    beta = fit["beta"]
    # Layout: [const, y_lag1..y_lagp, x_lag0..x_lagq]
    x_betas = beta[1 + p :]
    long_run = float(x_betas.sum())
    impact = float(x_betas[0])
    selected_lag = int(np.argmax(np.abs(x_betas)))

    lags = max(1, int(np.floor(1.5 * fit["n"] ** (1 / 3))))
    cov = _newey_west(fit["X"], fit["resid"], lags)
    # SE of Σ x_betas — sum of the relevant covariance block (linear-combination var).
    idx = np.arange(1 + p, 1 + p + q + 1)
    var_lr = float(cov[np.ix_(idx, idx)].sum())
    se_lr = float(np.sqrt(max(var_lr, 0.0)))
    ci_l, ci_u = long_run - 1.96 * se_lr, long_run + 1.96 * se_lr

    return ARDLResult(
        edge=edge,
        source_label=source_label,
        target_label=target_label,
        p_lags=p,
        q_lags=q,
        long_run_multiplier=long_run,
        impact_multiplier=impact,
        se_long_run=se_lr,
        ci_lower=float(ci_l),
        ci_upper=float(ci_u),
        selected_lag_months=selected_lag,
        n_obs=fit["n"],
        sample_start=df.index.min(),
        sample_end=df.index.max(),
        aic=float(best[0]),
        sign=1 if long_run >= 0 else -1,
        note=note,
    )
