"""Validate the event-study estimator on Abqaiq-Khurais (2019-09-14).

Ground truth: the September 14, 2019 attack on the Abqaiq processing
plant and Khurais oil field knocked ~5.7 mb/d of Saudi crude offline
(~5% of global supply). Brent opened up roughly 15% on the next trading
day (2019-09-16, Monday), the largest single-day jump since 1991.

Acceptance criteria for this validation:

  - Brent CAR_peak in [+0.08, +0.25] over [-5, +20]; CI excludes 0;
    peak within first 3 trading days.
  - WTI CAR_peak in [+0.04, +0.20]; CI excludes 0; peak within 5 days.
  - Brent and WTI day-0 abnormal returns both strictly greater than the
    natgas day-0 abnormal return. Gas markets do show spillover from a
    crude shock (general energy risk premium), but the magnitude must
    be smaller since the supply hit is specifically to crude. Both
    crude benchmarks arbitrage within a session so we don't test for a
    Brent-vs-WTI ordering.

If any of these fail, either the estimator is broken or the price
mirrors are out of date.
"""
from __future__ import annotations

import numpy as np

from research.macro.datasets.commodity_prices import load
from research.macro.estimators.event_study import event_study


def main() -> int:
    rng = np.random.default_rng(42)
    event = "2019-09-14"

    results = {}
    for series in ("brent", "wti", "natgas"):
        price = load(series)
        results[series] = event_study(price, event, n_boot=2000, rng=rng)

    checks = []

    def check(label: str, ok: bool, detail: str) -> None:
        flag = "PASS" if ok else "FAIL"
        print(f"[{flag}] {label}: {detail}")
        checks.append(ok)

    # individual-series checks
    for series, want in [
        ("brent", dict(car_low=0.08, car_high=0.25, peak_max=3)),
        ("wti",   dict(car_low=0.04, car_high=0.20, peak_max=5)),
    ]:
        r = results[series]
        sig = r.boot_ci_low > 0 or r.boot_ci_high < 0
        ok_car = want["car_low"] <= r.car_peak <= want["car_high"]
        ok_lag = r.peak_offset <= want["peak_max"]
        check(
            f"{series:>6} CAR & sig",
            ok_car and ok_lag and sig,
            f"CAR_peak={r.car_peak:+.4f}  lag={r.peak_offset:>2}d  "
            f"CI=[{r.boot_ci_low:+.4f}, {r.boot_ci_high:+.4f}]  patell_t={r.patell_t:+.2f}",
        )

    # cross-series ordering: crude shock should hit crude benchmarks far
    # harder than natural gas (regional market, weak coupling).
    ar0 = {s: float(results[s].abnormal_returns.loc[0]) for s in results}
    print(f"       day-0 ARs: brent={ar0['brent']:+.4f} "
          f"wti={ar0['wti']:+.4f} natgas={ar0['natgas']:+.4f}")
    check(
        "brent day-0 > natgas day-0",
        ar0["brent"] > ar0["natgas"],
        f"{ar0['brent']:+.4f} > {ar0['natgas']:+.4f}",
    )
    check(
        "wti day-0 > natgas day-0",
        ar0["wti"] > ar0["natgas"],
        f"{ar0['wti']:+.4f} > {ar0['natgas']:+.4f}",
    )

    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
