"""Synthetic validation for the event-study estimator.

Generates a noise series with a known cumulative jump injected at a
specific date, runs ``event_study``, and asserts the abnormal
cumulative percent change recovers the injected jump within tolerance.

We test three regimes:
  - large positive jump (+15%) — easy detection
  - moderate negative jump (−5%) — sign + magnitude
  - no jump (null) — abnormal_pct should hover near zero, t-stat
                     non-significant
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.estimators import event_study  # noqa: E402


def _simulate_with_jump(
    *,
    n_pre: int,
    n_post: int,
    jump_log_pct: float,
    sigma: float = 0.005,
    seed: int = 0,
) -> tuple[pd.Series, pd.Timestamp]:
    """Daily noise series with a single permanent jump on the event date."""
    rng = np.random.default_rng(seed)
    total = n_pre + n_post
    drift = rng.normal(0, sigma, size=total)
    drift[n_pre] += jump_log_pct  # impulse on event day
    log_lvl = np.cumsum(drift)
    idx = pd.date_range("2020-01-01", periods=total, freq="D")
    return pd.Series(np.exp(log_lvl) * 100, index=idx, name="y"), idx[n_pre]


def _validate(
    *,
    label: str,
    jump_log_pct: float,
    expected_pct: float,
    tolerance_pct: float,
    n_pre: int = 90,
    n_post: int = 30,
    seed: int = 0,
    expect_significant: bool | None = None,
) -> dict:
    series, event_date = _simulate_with_jump(
        n_pre=n_pre, n_post=n_post, jump_log_pct=jump_log_pct, seed=seed
    )
    es = event_study(
        edge=f"_synth_{label}",
        event_id=label,
        event_date=event_date,
        target=series,
        pre_window_days=n_pre,
        post_window_days=n_post,
    )
    err = abs(es.abnormal_pct - expected_pct)
    within = err <= tolerance_pct
    sig_ok = True if expect_significant is None else (
        (abs(es.t_stat) > 1.96) == expect_significant
    )
    pass_ = within and sig_ok
    print(
        f"  [{label:14s}] expected ≈{expected_pct:+.2f}%  fit={es.abnormal_pct:+.3f}%  "
        f"err={err:.3f}  t={es.t_stat:+.2f}  → {'PASS' if pass_ else 'FAIL'}"
    )
    return {
        "label": label,
        "expected_pct": expected_pct,
        "fitted_pct": es.abnormal_pct,
        "error": err,
        "tolerance_pct": tolerance_pct,
        "t_stat": es.t_stat,
        "within_tolerance": within,
        "significance_ok": sig_ok,
        "pass": pass_,
    }


def main() -> None:
    print("=== Event-study synthetic validation ===\n")
    results = [
        _validate(
            label="large_pos",
            jump_log_pct=np.log(1.15),
            expected_pct=15.0,
            tolerance_pct=2.0,
            expect_significant=True,
        ),
        _validate(
            label="moderate_neg",
            jump_log_pct=np.log(0.95),
            expected_pct=-5.0,
            tolerance_pct=2.0,
            expect_significant=True,
        ),
        _validate(
            label="null",
            jump_log_pct=0.0,
            expected_pct=0.0,
            tolerance_pct=2.0,
            expect_significant=False,
        ),
    ]
    n_pass = sum(r["pass"] for r in results)
    print(f"\n=== {n_pass} / {len(results)} passed ===")
    if n_pass != len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
