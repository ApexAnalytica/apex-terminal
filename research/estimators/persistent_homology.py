"""Persistent homology — β₁ per tick at fixed ε.

Takens delay-embedding of a scalar signal → point cloud in R^d, then
Vietoris-Rips → first Betti number β₁(ε) = number of persistent
1-cycles whose birth ≤ ε < death. We slide a window across the signal
and report β₁ per tick, so the output is a trajectory that tracks the
appearance and disappearance of loop-like structure in the underlying
dynamics.

Why this matters for T1D:
  - Delay embeddings of CGM traces recover the phase portrait of the
    homeostatic loop. A single-loop regime (β₁ ≈ 1) ≠ a collapsed or
    multi-loop regime (β₁ = 0 or ≥ 2), and the transitions are
    candidate regime-shift markers — exactly what the criticality
    layer is designed to surface.
  - Real β₁ (as opposed to a variance-of-distances proxy) is the
    object used in Perea & Harer 2015, Garland et al 2016, etc.

Backend: `ripser` — a pure-Python (Cython) VR persistence engine.
Fast enough for the Hall et al 2018 CGM scale (n ~ 300, d ≤ 5).
For a TS port we can later swap in a small JS rips implementation or
route through WASM; the delay-embedding + β₁-counting logic is trivial.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from ripser import ripser


@dataclass
class BettiTrajectory:
    """β₁(t) sliding-window output.

    `t` indexes window *centers* in the original signal timeline.
    `beta1` is the count of H₁ intervals alive at fixed ε.
    `max_persistence` is the most persistent H₁ bar in each window
    (useful for threshold-free scoring).
    """
    t: np.ndarray
    beta1: np.ndarray
    max_persistence: np.ndarray
    window: int
    step: int
    embed_dim: int
    embed_delay: int
    epsilon: float


def takens_embedding(
    x: np.ndarray, dim: int = 3, delay: int = 1
) -> np.ndarray:
    """Takens delay embedding of a 1-D signal.

    Returns an (n - (dim-1)*delay, dim) point cloud whose k-th row is
    [x_k, x_{k+delay}, ..., x_{k+(dim-1)*delay}].
    """
    n = len(x)
    m = n - (dim - 1) * delay
    if m <= 0:
        raise ValueError(
            f"signal too short ({n}) for embedding dim={dim} delay={delay}"
        )
    out = np.empty((m, dim), dtype=float)
    for k in range(dim):
        out[:, k] = x[k * delay : k * delay + m]
    return out


def betti1_at_epsilon(
    points: np.ndarray, epsilon: float, maxdim: int = 1
) -> tuple[int, float]:
    """Count H₁ intervals alive at `epsilon` (birth ≤ ε < death).

    Returns (β₁, longest_persistence_in_window).
    """
    if points.shape[0] < 3:
        return 0, 0.0
    res = ripser(points, maxdim=maxdim)
    h1 = res["dgms"][1]
    if h1.size == 0:
        return 0, 0.0
    births = h1[:, 0]
    deaths = h1[:, 1]
    alive = (births <= epsilon) & (epsilon < deaths)
    finite = np.isfinite(deaths)
    max_pers = float((deaths[finite] - births[finite]).max()) if finite.any() else 0.0
    return int(alive.sum()), max_pers


def sliding_betti1(
    x: np.ndarray,
    window: int,
    step: int = 1,
    embed_dim: int = 3,
    embed_delay: int = 1,
    epsilon: float | None = None,
) -> BettiTrajectory:
    """β₁(t) at fixed ε across a sliding window.

    If `epsilon` is None, we set it to the median pairwise distance of
    the first window's embedding — a scale-adaptive default that works
    across signals of wildly different amplitudes without retuning.
    """
    x = np.asarray(x, dtype=float)
    n = len(x)
    if window > n:
        raise ValueError(f"window {window} larger than signal {n}")

    if epsilon is None:
        pts0 = takens_embedding(x[:window], dim=embed_dim, delay=embed_delay)
        # Median pairwise distance scales with the attractor diameter.
        d = _pdist(pts0)
        epsilon = float(np.median(d))

    centers = []
    b1 = []
    mp = []
    for start in range(0, n - window + 1, step):
        seg = x[start : start + window]
        pts = takens_embedding(seg, dim=embed_dim, delay=embed_delay)
        k, pers = betti1_at_epsilon(pts, epsilon)
        centers.append(start + window // 2)
        b1.append(k)
        mp.append(pers)

    return BettiTrajectory(
        t=np.asarray(centers),
        beta1=np.asarray(b1, dtype=int),
        max_persistence=np.asarray(mp, dtype=float),
        window=window,
        step=step,
        embed_dim=embed_dim,
        embed_delay=embed_delay,
        epsilon=epsilon,
    )


def _pdist(pts: np.ndarray) -> np.ndarray:
    """Pairwise distances (upper triangle) — avoids scipy dep."""
    diff = pts[:, None, :] - pts[None, :, :]
    d = np.sqrt((diff * diff).sum(axis=-1))
    iu = np.triu_indices_from(d, k=1)
    return d[iu]
