"""Transfer entropy — directed information flow X → Y.

Schreiber 2000 formulation:

    TE(X → Y) = Σ p(y_{t+1}, y_t^{(l)}, x_t^{(k)})
                · log [ p(y_{t+1} | y_t^{(l)}, x_t^{(k)}) / p(y_{t+1} | y_t^{(l)}) ]

In English: how much the past of X reduces uncertainty about the next
step of Y, above and beyond Y's own past. TE is directed and
asymmetric — TE(X→Y) ≠ TE(Y→X) — which is what we need to tell apart
"insulin drives glucose" from "glucose drives insulin" in coupled CGM
+ activity + dosing streams.

Binning-based (Schreiber 2000 original) estimator: we discretize each
signal into equal-quantile bins, form empirical joint and marginal
histograms, and plug in the plug-in entropy. Biased at small n but
fast, deterministic, and straightforward to port to TypeScript without
a k-NN dependency. Miller-Madow bias correction applied.

For high-accuracy unbiased estimates on longer records the KSG estimator
(Kraskov 2004) should be used instead; we leave it as a follow-up
because it requires k-NN queries that are cheap in Python/sklearn but
add complexity to a TS port.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class TeResult:
    te_xy: float          # TE(X → Y) in nats
    te_yx: float          # TE(Y → X) in nats (for asymmetry checks)
    n_bins: int
    history_k: int        # embedding length of X past
    history_l: int        # embedding length of Y past


def _quantile_bin(x: np.ndarray, n_bins: int) -> np.ndarray:
    """Equal-frequency (quantile) binning — robust to heavy tails."""
    ranks = np.argsort(np.argsort(x))
    return (ranks * n_bins // len(x)).astype(int).clip(0, n_bins - 1)


def _joint_count(*cols: np.ndarray, n_bins: int) -> np.ndarray:
    """Count occurrences of each unique integer tuple (cols[0], cols[1], ...).

    Returns a flat histogram indexed by the mixed-radix encoding
    sum_i cols[i] * n_bins^(k-1-i). We only need the non-zero bins for
    the Shannon sum, so we hash tuples into integers and use bincount.
    """
    n = len(cols[0])
    code = np.zeros(n, dtype=np.int64)
    for c in cols:
        code = code * n_bins + c
    total = n_bins ** len(cols)
    h = np.bincount(code, minlength=total)
    return h


def _entropy(counts: np.ndarray) -> float:
    """Plug-in Shannon entropy with Miller-Madow correction."""
    n = counts.sum()
    if n == 0:
        return 0.0
    p = counts / n
    nz = p > 0
    H = float(-(p[nz] * np.log(p[nz])).sum())
    # Miller-Madow: add (K̂ - 1) / (2n) where K̂ = # nonzero bins.
    K_hat = int(nz.sum())
    if K_hat > 1:
        H += (K_hat - 1) / (2.0 * n)
    return H


def _directed_te(
    src: np.ndarray, dst: np.ndarray, k: int, l: int, n_bins: int
) -> float:
    """TE(src → dst) via identity TE = H(dst_fut, dst_past) + H(dst_past, src_past)
       − H(dst_past) − H(dst_fut, dst_past, src_past).
    """
    T = max(k, l)
    dst_fut = dst[T:]
    # Build lag-embedded past windows.
    dst_past = np.stack([dst[T - 1 - i : len(dst) - 1 - i] for i in range(l)], axis=1)
    src_past = np.stack([src[T - 1 - i : len(src) - 1 - i] for i in range(k)], axis=1)

    # Flatten the lag windows to single discrete codes (mixed-radix).
    def flatten(W):
        code = np.zeros(W.shape[0], dtype=np.int64)
        for j in range(W.shape[1]):
            code = code * n_bins + W[:, j]
        return code

    dp = flatten(dst_past)
    sp = flatten(src_past)
    df = dst_fut

    eff_bins = max(n_bins ** max(k, l), n_bins)
    H_fp = _entropy(_joint_count(df, dp, n_bins=eff_bins))
    H_fps = _entropy(_joint_count(df, dp, sp, n_bins=eff_bins))
    H_p = _entropy(_joint_count(dp, n_bins=eff_bins))
    H_ps = _entropy(_joint_count(dp, sp, n_bins=eff_bins))

    te = H_fp + H_ps - H_p - H_fps
    # TE is non-negative in the population; small negative values are a
    # finite-sample artifact of Miller-Madow. Clip for interpretability.
    return float(max(0.0, te))


def transfer_entropy(
    x: np.ndarray,
    y: np.ndarray,
    n_bins: int = 4,
    history_k: int = 1,
    history_l: int = 1,
) -> TeResult:
    """Estimate TE(X → Y) and TE(Y → X) on 1-D series of equal length.

    Parameters
    ----------
    x, y : 1-D arrays, same length.
    n_bins : quantile-bin count. 4 works well on n ~ 300; 8 on n ~ 2000.
    history_k : lag-embedding depth of the source.
    history_l : lag-embedding depth of the target.
    """
    x = np.asarray(x, dtype=float).ravel()
    y = np.asarray(y, dtype=float).ravel()
    if len(x) != len(y):
        raise ValueError(f"series must be equal length, got {len(x)} vs {len(y)}")
    bx = _quantile_bin(x, n_bins)
    by = _quantile_bin(y, n_bins)

    te_xy = _directed_te(bx, by, k=history_k, l=history_l, n_bins=n_bins)
    te_yx = _directed_te(by, bx, k=history_l, l=history_k, n_bins=n_bins)
    return TeResult(
        te_xy=te_xy, te_yx=te_yx,
        n_bins=n_bins, history_k=history_k, history_l=history_l,
    )
