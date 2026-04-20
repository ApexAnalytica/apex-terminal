"""Synthetic validation for β₁ sliding-window persistent homology.

Three regimes with known topology:

  (A) Pure periodic signal    -> delay embedding = single loop -> β₁ = 1
  (B) White noise             -> no loop structure             -> β₁ = 0
  (C) Amplitude-modulated     -> birth/death of loops over time
        periodic (on-off)

We check:
  - β₁ is close to 1 in the "periodic on" segments
  - β₁ is close to 0 in the "noise / off" segments
  - The transition is detectable in the β₁ time series
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.persistent_homology import sliding_betti1  # noqa: E402


def periodic(n: int, period: int = 20, amp: float = 1.0, seed: int = 0):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return amp * np.sin(2 * np.pi * t / period) + 0.05 * rng.standard_normal(n)


def noise(n: int, seed: int = 0):
    return np.random.default_rng(seed).standard_normal(n)


def amplitude_modulated(n: int, period: int = 20, seed: int = 0):
    """Periodic in [0, n/3) and [2n/3, n); noisy flat in between."""
    out = np.empty(n)
    out[: n // 3] = periodic(n // 3, period=period, seed=seed)
    out[n // 3 : 2 * n // 3] = 0.3 * noise(n // 3 + (2 * n // 3 - n // 3 - n // 3), seed=seed + 1)[
        : 2 * n // 3 - n // 3
    ]
    out[2 * n // 3 :] = periodic(n - 2 * n // 3, period=period, seed=seed + 2)
    return out


def run_case(label: str, x: np.ndarray, window: int, epsilon: float | None):
    traj = sliding_betti1(
        x,
        window=window,
        step=5,
        embed_dim=3,
        embed_delay=5,
        epsilon=epsilon,
    )
    print(
        f"[{label}] β₁ mean={traj.beta1.mean():.2f}  "
        f"frac(β₁≥1)={(traj.beta1 >= 1).mean():.2f}  "
        f"ε={traj.epsilon:.3f}  "
        f"max_pers mean={traj.max_persistence.mean():.3f}"
    )
    return traj


def main() -> None:
    n = 600
    print("synthetic β₁ validation, window=100 step=5 dim=3 delay=5")

    # (A) periodic → β₁ ≈ 1 throughout
    traj_a = run_case("periodic", periodic(n), window=100, epsilon=None)
    ok_a = (traj_a.beta1 >= 1).mean() >= 0.8

    # (B) noise → β₁ ≈ 0 throughout. Use the periodic ε scale so we're not
    # artificially hiding loops by picking a tiny ε.
    traj_b = run_case("noise", noise(n), window=100, epsilon=traj_a.epsilon)
    ok_b = (traj_b.beta1 == 0).mean() >= 0.8

    # (C) AM → first and last thirds β₁≥1, middle third β₁=0.
    x_c = amplitude_modulated(n)
    traj_c = run_case("am", x_c, window=100, epsilon=traj_a.epsilon)
    # Partition traj_c.t into thirds.
    mid_mask = (traj_c.t >= n // 3) & (traj_c.t < 2 * n // 3)
    per_mask = ~mid_mask
    mid_b1 = traj_c.beta1[mid_mask].mean() if mid_mask.any() else np.nan
    per_b1 = traj_c.beta1[per_mask].mean() if per_mask.any() else np.nan
    print(f"[am] middle-third β₁ mean={mid_b1:.2f}  outer β₁ mean={per_b1:.2f}")
    ok_c = per_b1 > mid_b1 + 0.3

    print("")
    print(f"periodic β₁≈1 check: {'PASS' if ok_a else 'FAIL'}")
    print(f"noise    β₁≈0 check: {'PASS' if ok_b else 'FAIL'}")
    print(f"AM contrast   check: {'PASS' if ok_c else 'FAIL'}")


if __name__ == "__main__":
    main()
