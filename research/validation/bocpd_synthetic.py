"""Synthetic validation for BOCPD.

Generates piecewise-Gaussian trajectories with known change-points and
reports BOCPD recovery accuracy. Also emits a plot to research/output/.

The "CGM-like" synthetic emulates the pattern we'll see in real T1D CGM
data: variance-regime changes more informative than mean-level shifts
(honeymoon-phase loss is primarily a glycemic-variability change-point,
not just a level shift).
"""
from __future__ import annotations

import os
import sys

import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.bocpd import bocpd, detect_changepoints_from_map  # noqa: E402


def synthetic_piecewise(n_segments: int = 4, seg_len: int = 200,
                         seed: int = 0) -> tuple[np.ndarray, list[int]]:
    """Piecewise-Gaussian sequence with well-separated regime shifts.

    Means are spaced at ±3, ±6 to guarantee SNR > 2 sigma. This is the
    algorithmic correctness test, not a realism test — real-world CGM
    traces will be messier and benefit from smoothing.
    """
    rng = np.random.default_rng(seed)
    segment_specs = [(-3.0, 0.5), (3.0, 0.5), (-1.0, 1.5), (5.0, 0.8)]
    segments = [rng.normal(m, s, size=seg_len) for m, s in segment_specs[:n_segments]]
    x = np.concatenate(segments)
    cps = [seg_len * i for i in range(1, n_segments)]
    return x, cps


def synthetic_cgm_like(seed: int = 0) -> tuple[np.ndarray, list[int]]:
    """CGM-like sequence imitating honeymoon-phase loss.

    We subsample to hourly (12 samples / hour → 1 sample / hour) because
    BOCPD with a constant hazard reacts to per-tick variance, and 5-min
    raw CGM induces enough tick-to-tick variance to swamp slow regime
    changes. Honeymoon-loss is a week-scale process; hourly aggregation
    is the appropriate granularity.

    Three regimes:
      1. Stable honeymoon (narrow range around 120 mg/dL).
      2. Transitional (moderate variance, slight upward drift).
      3. Post-honeymoon (wider swings, higher mean).
    """
    rng = np.random.default_rng(seed)
    stable = rng.normal(120.0, 8.0, size=24 * 14)        # ~2 weeks hourly
    transition = rng.normal(140.0, 18.0, size=24 * 7)    # ~1 week
    post = rng.normal(175.0, 30.0, size=24 * 14)         # ~2 weeks
    x = np.concatenate([stable, transition, post])
    cps = [stable.size, stable.size + transition.size]
    return x, cps


def evaluate(detected: list[int], true_cps: list[int],
             tolerance: int = 50) -> dict:
    """Recall and false-alarm count — nearest-match, one-to-one.

    Each detected CP greedily claims its nearest-unmatched true CP
    within `tolerance`; surplus detections are false alarms; unclaimed
    true CPs count against recall.
    """
    unmatched_true = list(range(len(true_cps)))
    matched_true: set[int] = set()
    false_alarms = 0
    for d in detected:
        candidates = [
            (abs(d - true_cps[k]), k) for k in unmatched_true
            if abs(d - true_cps[k]) <= tolerance
        ]
        if candidates:
            candidates.sort()
            k = candidates[0][1]
            matched_true.add(k)
            unmatched_true.remove(k)
        else:
            false_alarms += 1
    return {
        "detected": detected,
        "matched_true_count": len(matched_true),
        "total_true": len(true_cps),
        "recall": len(matched_true) / max(len(true_cps), 1),
        "false_alarms": false_alarms,
    }


def plot_result(x: np.ndarray, result, true_cps: list[int],
                title: str, out_path: str) -> None:
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 7), sharex=True,
                                         gridspec_kw={"height_ratios": [2, 2, 1]})
    ax1.plot(x, lw=0.8, color="#0b1220")
    for cp in true_cps:
        ax1.axvline(cp, color="#e11d48", lw=0.8, alpha=0.6)
    ax1.set_ylabel("observation")
    ax1.set_title(title)

    # Log run-length posterior heatmap.
    Rlog = np.log(np.clip(result.run_length_posterior, 1e-12, 1.0))
    ax2.imshow(Rlog.T, aspect="auto", origin="lower",
               cmap="viridis", vmin=-10, vmax=0)
    ax2.plot(result.map_run_length, color="#fbbf24", lw=0.6, label="MAP r")
    for cp in true_cps:
        ax2.axvline(cp, color="#e11d48", lw=0.8, alpha=0.6)
    ax2.set_ylabel("run length r")
    ax2.legend(loc="upper left", fontsize=8)

    ax3.plot(result.new_run_prob, color="#0891b2", lw=0.8)
    ax3.axhline(0.5, color="#64748b", ls="--", lw=0.6)
    for cp in true_cps:
        ax3.axvline(cp, color="#e11d48", lw=0.8, alpha=0.6)
    ax3.set_ylabel(f"P(r < {result.cp_window})")
    ax3.set_xlabel("t")
    ax3.set_ylim(0, 1)

    plt.tight_layout()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    plt.savefig(out_path, dpi=140)
    plt.close(fig)


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), "..", "output")

    # Test 1: piecewise mean + variance shifts.
    x, true_cps = synthetic_piecewise(n_segments=4, seg_len=200, seed=0)
    res = bocpd(x, hazard=1.0 / 250.0)
    detected = detect_changepoints_from_map(res.map_run_length, min_drop=50)
    m = evaluate(detected, true_cps, tolerance=50)
    print(f"[piecewise] true CPs={true_cps}")
    print(f"            detected={m['detected']}  recall={m['recall']:.2f}  "
          f"false_alarms={m['false_alarms']}")
    plot_result(x, res, true_cps,
                "BOCPD — piecewise synthetic",
                os.path.join(out_dir, "bocpd_synthetic_piecewise.png"))

    # Test 2: CGM-like honeymoon-loss trajectory.
    x, true_cps = synthetic_cgm_like(seed=0)
    res = bocpd(x, hazard=1.0 / 500.0, mu0=120.0, kappa0=0.1,
                alpha0=1.0, beta0=50.0, cp_window=50)
    detected = detect_changepoints_from_map(res.map_run_length, min_drop=24,
                                            refractory=48)
    m = evaluate(detected, true_cps, tolerance=72)
    print(f"[cgm-like]  true CPs={true_cps}")
    print(f"            detected={m['detected']}  recall={m['recall']:.2f}  "
          f"false_alarms={m['false_alarms']}")
    plot_result(x, res, true_cps,
                "BOCPD — CGM-like (honeymoon-phase loss)",
                os.path.join(out_dir, "bocpd_synthetic_cgm.png"))


if __name__ == "__main__":
    main()
