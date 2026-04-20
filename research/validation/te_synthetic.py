"""Transfer-entropy validation on coupled AR processes.

Three canonical checks:

  (A) Independent noise: TE in both directions should be ≈ 0.
  (B) Unidirectional coupling X → Y:
        x_t = 0.5 x_{t-1} + ε_x
        y_t = 0.5 y_{t-1} + c · x_{t-1} + ε_y
      Expected: TE(X→Y) > 0, TE(Y→X) ≈ 0.
  (C) Bidirectional coupling: both should be positive, with the
      stronger coupling direction registering higher TE.
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.transfer_entropy import transfer_entropy  # noqa: E402


def ar_independent(n: int, seed: int = 0):
    rng = np.random.default_rng(seed)
    x = np.zeros(n); y = np.zeros(n)
    for t in range(1, n):
        x[t] = 0.5 * x[t - 1] + rng.standard_normal()
        y[t] = 0.5 * y[t - 1] + rng.standard_normal()
    return x, y


def ar_xy(n: int, coupling: float = 0.6, seed: int = 0):
    rng = np.random.default_rng(seed)
    x = np.zeros(n); y = np.zeros(n)
    for t in range(1, n):
        x[t] = 0.5 * x[t - 1] + rng.standard_normal()
        y[t] = 0.5 * y[t - 1] + coupling * x[t - 1] + rng.standard_normal()
    return x, y


def ar_bidir(n: int, c_xy: float = 0.6, c_yx: float = 0.3, seed: int = 0):
    rng = np.random.default_rng(seed)
    x = np.zeros(n); y = np.zeros(n)
    for t in range(1, n):
        x[t] = 0.5 * x[t - 1] + c_yx * y[t - 1] + rng.standard_normal()
        y[t] = 0.5 * y[t - 1] + c_xy * x[t - 1] + rng.standard_normal()
    return x, y


def run_case(label, x, y, **kw):
    r = transfer_entropy(x, y, **kw)
    print(f"[{label}] TE(X→Y)={r.te_xy:.4f}  TE(Y→X)={r.te_yx:.4f}  "
          f"asymmetry={r.te_xy - r.te_yx:+.4f}")
    return r


def main() -> None:
    n = 2000
    print(f"transfer-entropy validation, n={n}, bins=6, k=l=1")

    r_a = run_case("independent", *ar_independent(n), n_bins=6)
    ok_a = abs(r_a.te_xy) < 0.05 and abs(r_a.te_yx) < 0.05

    r_b = run_case("X→Y only",    *ar_xy(n, coupling=0.6), n_bins=6)
    ok_b = r_b.te_xy > 0.1 and r_b.te_yx < r_b.te_xy * 0.5

    r_c = run_case("bidir (xy>yx)", *ar_bidir(n, c_xy=0.7, c_yx=0.2), n_bins=6)
    ok_c = r_c.te_xy > r_c.te_yx and r_c.te_yx > 0.01

    print("")
    print(f"independent ≈ 0 check:        {'PASS' if ok_a else 'FAIL'}")
    print(f"unidirectional X→Y asymmetry: {'PASS' if ok_b else 'FAIL'}")
    print(f"bidirectional ordering check: {'PASS' if ok_c else 'FAIL'}")


if __name__ == "__main__":
    main()
