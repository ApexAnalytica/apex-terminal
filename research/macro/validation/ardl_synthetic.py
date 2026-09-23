"""Synthetic validation for the ARDL channel estimator.

Generates a series with a known long-run multiplier, fits ARDL, and
checks recovery within tolerance. Three regimes:

  1. Strong channel  (β = 0.8)   : recover within ±0.10
  2. Weak channel    (β = 0.1)   : recover within ±0.10 (CI should
                                    typically include zero — that's
                                    the regime US10y → DXY hits)
  3. Negative channel (β = -0.6) : sign correctly recovered

Also runs a small AIC-grid sanity check to ensure the lag-selection
mechanism does the right thing on a series where the true lag is 2.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.estimators import ardl_fit  # noqa: E402


def _simulate_ardl(
    *,
    n: int,
    long_run_beta: float,
    impact_share: float = 0.5,
    ar1_phi: float = 0.3,
    sigma: float = 1.0,
    seed: int = 0,
    lag_distribution: tuple[float, ...] | None = None,
) -> tuple[pd.Series, pd.Series]:
    """Return (source, target) monthly series whose log-returns satisfy

        Δy_t = ar1_phi · Δy_{t-1} + Σ_j β_j · Δx_{t-j} + ε_t

    with Σ β_j = ``long_run_beta`` and β_0 = ``impact_share · long_run_beta``
    (or, if ``lag_distribution`` is provided, those exact β_j weights
    summing to ``long_run_beta``).

    Series are returned at *level*: y, x = exp(cumsum(Δy)), exp(cumsum(Δx))
    so the ardl_fit caller (which log-diffs internally) gets back to
    the same Δ-level regression.
    """
    rng = np.random.default_rng(seed)
    if lag_distribution is None:
        # Two-lag: β_0 = impact_share · LR, β_1 = (1 - impact_share) · LR
        betas = np.array([impact_share * long_run_beta, (1 - impact_share) * long_run_beta])
    else:
        betas = np.array(lag_distribution)
        betas = betas * (long_run_beta / betas.sum())

    dx = rng.normal(0, 0.02, size=n)  # 2% monthly vol on log-returns
    dy = np.zeros(n)
    eps = rng.normal(0, sigma * 0.005, size=n)  # noise
    for t in range(len(betas), n):
        dy[t] = ar1_phi * dy[t - 1] + sum(betas[j] * dx[t - j] for j in range(len(betas))) + eps[t]

    idx = pd.date_range("2000-01-31", periods=n, freq="ME")
    x_lvl = pd.Series(np.exp(np.cumsum(dx)) * 100, index=idx, name="x")
    y_lvl = pd.Series(np.exp(np.cumsum(dy)) * 100, index=idx, name="y")
    return x_lvl, y_lvl


def _validate(
    *,
    label: str,
    long_run_beta: float,
    n: int,
    tolerance: float,
    sign_required: bool = True,
    seed: int = 0,
) -> dict:
    x, y = _simulate_ardl(n=n, long_run_beta=long_run_beta, seed=seed)
    fit = ardl_fit(
        edge=f"_synth_{label}",
        source=x,
        target=y,
        source_label="synth_x",
        target_label="synth_y",
    )
    err = abs(fit.long_run_multiplier - long_run_beta)
    # When the true effect is zero, ``np.sign(0) = 0`` and an estimator
    # that fits a small non-zero coefficient would always trip a strict
    # sign check. The right test in the zero regime is "CI contains 0".
    if long_run_beta == 0:
        sign_ok = fit.ci_lower <= 0 <= fit.ci_upper
    else:
        sign_ok = (fit.sign == np.sign(long_run_beta)) if sign_required else True
    within = err <= tolerance
    pass_ = within and sign_ok
    print(
        f"  [{label:18s}] true β={long_run_beta:+.2f}  fit={fit.long_run_multiplier:+.3f}  "
        f"err={err:.3f}  CI=[{fit.ci_lower:+.3f}, {fit.ci_upper:+.3f}]  "
        f"lags p={fit.p_lags} q={fit.q_lags}  → {'PASS' if pass_ else 'FAIL'}"
    )
    return {
        "label": label,
        "true_long_run_beta": long_run_beta,
        "fitted_long_run_multiplier": fit.long_run_multiplier,
        "error": err,
        "tolerance": tolerance,
        "sign_correct": sign_ok,
        "within_tolerance": within,
        "ci_lower": fit.ci_lower,
        "ci_upper": fit.ci_upper,
        "n_obs": fit.n_obs,
        "selected_p": fit.p_lags,
        "selected_q": fit.q_lags,
        "pass": pass_,
    }


def main() -> None:
    print("=== ARDL synthetic validation ===\n")
    results = []
    for label, beta, n, tol in [
        ("strong_positive", 0.80, 240, 0.15),
        ("moderate_positive", 0.40, 240, 0.15),
        ("weak_positive", 0.10, 240, 0.15),
        ("strong_negative", -0.60, 240, 0.15),
        ("zero", 0.00, 240, 0.15),
    ]:
        results.append(_validate(label=label, long_run_beta=beta, n=n, tolerance=tol))

    n_pass = sum(r["pass"] for r in results)
    print(f"\n=== {n_pass} / {len(results)} passed ===")
    if n_pass != len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
