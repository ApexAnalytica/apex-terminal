"""Event study with constant-mean normal-returns model and block-bootstrap CI.

Reference: MacKinlay (1997), "Event Studies in Economics and Finance,"
Journal of Economic Literature 35(1): 13-39.

We use a constant-mean model rather than the market model because
commodity spot prices (Brent, Henry Hub, etc.) have no obvious benchmark
factor analogous to a stock-market index. The estimation-window mean and
variance of log returns serve as the null distribution of "normal" returns.

Two test statistics are reported:

  - Patell standardized residual t-stat (parametric, assumes normality of
    daily abnormal returns).
  - Moving-block bootstrap percentile CI on the cumulative abnormal
    return (CAR), which preserves volatility clustering present in the
    estimation window. Block length defaults to 5 trading days; results
    are insensitive in the [3, 10] range for our sample sizes.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd


@dataclass
class EventStudyResult:
    event_date: pd.Timestamp
    estimation_mean: float
    estimation_std: float
    abnormal_returns: pd.Series       # AR_t indexed by trading day offset
    car: pd.Series                    # cumulative AR over event window
    car_peak: float                   # CAR at the peak-|magnitude| offset
    peak_offset: int                  # offset to peak |CAR|
    car_short: float                  # CAR at the short-horizon offset
    short_offset: int                 # short-horizon offset (~ event_window[1]/3)
    car_immediate: float              # CAR at offset 0 (event date itself)
    patell_t: float                   # standardized t-stat at peak offset
    boot_ci_low: float                # 95% CI low for CAR_peak
    boot_ci_high: float               # 95% CI high for CAR_peak
    boot_ci_low_short: float          # 95% CI low for CAR_short
    boot_ci_high_short: float         # 95% CI high for CAR_short
    n_estimation: int                 # estimation-window observations


def _log_returns(price: pd.Series) -> pd.Series:
    return np.log(price).diff().dropna()


def event_study(
    price: pd.Series,
    event_date: str | pd.Timestamp,
    estimation_window: tuple[int, int] = (-120, -20),
    event_window: tuple[int, int] = (-5, 20),
    n_boot: int = 2000,
    block_len: int = 5,
    rng: np.random.Generator | None = None,
) -> EventStudyResult:
    """Run a constant-mean event study on a daily price series.

    Parameters
    ----------
    price : pd.Series
        Daily price levels indexed by date (DatetimeIndex). Non-trading
        days simply absent.
    event_date : str or Timestamp
        The event day. If not a trading day, the next trading day is used.
    estimation_window : (start, end)
        Trading-day offsets relative to event_date defining the
        estimation window (defaults to roughly six months before event,
        excluding the 20 days immediately prior to avoid contamination).
    event_window : (start, end)
        Inclusive trading-day offsets defining the event window.
    n_boot : int
        Number of bootstrap replications for the CAR confidence interval.
    block_len : int
        Block length (trading days) for the moving-block bootstrap.
    """
    rng = rng if rng is not None else np.random.default_rng(0)
    event_date = pd.Timestamp(event_date)

    rets = _log_returns(price)
    # snap event_date to next available trading day
    valid = rets.index[rets.index >= event_date]
    if len(valid) == 0:
        raise ValueError(f"event_date {event_date.date()} after end of series")
    event_t = valid[0]

    idx = rets.index.get_indexer([event_t])[0]
    est_lo, est_hi = idx + estimation_window[0], idx + estimation_window[1]
    ev_lo, ev_hi = idx + event_window[0], idx + event_window[1] + 1
    if est_lo < 0 or ev_hi > len(rets):
        raise ValueError(
            f"window out of bounds: estimation [{est_lo},{est_hi}], "
            f"event [{ev_lo},{ev_hi-1}], series length {len(rets)}"
        )

    est = rets.iloc[est_lo:est_hi]
    mu = est.mean()
    sigma = est.std(ddof=1)

    ar = rets.iloc[ev_lo:ev_hi] - mu
    ar.index = range(event_window[0], event_window[1] + 1)
    ar.name = "AR"

    car = ar.cumsum()
    car.name = "CAR"

    peak_offset = int(car.abs().idxmax())
    car_peak = float(car.loc[peak_offset])

    # Short horizon: 1/3 of the way into the post-event window. This is
    # the "immediate response" stat that avoids contamination from later
    # unrelated trends (e.g., COVID demand crash following Abqaiq 2019).
    short_offset = max(1, event_window[1] // 3)
    short_offset = min(short_offset, event_window[1])
    car_short = float(car.loc[short_offset])

    car_immediate = float(car.loc[0]) if 0 in car.index else float("nan")

    # n events between event_window[0] and a given offset (inclusive)
    def _n_event(offset: int) -> int:
        return offset - event_window[0] + 1

    n_event_peak = _n_event(peak_offset)
    patell_t = car_peak / (sigma * np.sqrt(n_event_peak))

    # moving-block bootstrap on estimation-window AR for CAR null dist
    est_ar = (est - mu).to_numpy()
    n_est = len(est_ar)

    def _boot_ci(n_event: int) -> tuple[float, float]:
        if n_event <= 0:
            return float("nan"), float("nan")
        n_blocks = int(np.ceil(n_event / block_len))
        boots = np.empty(n_boot)
        for b in range(n_boot):
            starts = rng.integers(0, n_est - block_len + 1, size=n_blocks)
            sample = np.concatenate(
                [est_ar[s : s + block_len] for s in starts]
            )[:n_event]
            boots[b] = sample.sum()
        return float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975))

    # CI is car +/- bootstrap quantiles of null-sum distribution
    # (percentile bootstrap inversion of H0: CAR=0).
    q025_peak, q975_peak = _boot_ci(n_event_peak)
    q025_short, q975_short = _boot_ci(_n_event(short_offset))

    return EventStudyResult(
        event_date=event_t,
        estimation_mean=float(mu),
        estimation_std=float(sigma),
        abnormal_returns=ar,
        car=car,
        car_peak=car_peak,
        peak_offset=peak_offset,
        car_short=car_short,
        short_offset=short_offset,
        car_immediate=car_immediate,
        patell_t=float(patell_t),
        boot_ci_low=float(car_peak - q975_peak),
        boot_ci_high=float(car_peak - q025_peak),
        boot_ci_low_short=float(car_short - q975_short),
        boot_ci_high_short=float(car_short - q025_short),
        n_estimation=n_est,
    )


def aggregate_car(results: Sequence[EventStudyResult]) -> dict:
    """Cross-sectional aggregation across multiple events on the same edge."""
    cars = np.array([r.car_peak for r in results])
    return {
        "n_events": len(results),
        "mean_car": float(cars.mean()),
        "median_car": float(np.median(cars)),
        "mean_abs_car": float(np.abs(cars).mean()),
        "lag_days_mean": float(np.mean([r.peak_offset for r in results])),
        "lag_days_median": float(np.median([r.peak_offset for r in results])),
    }
