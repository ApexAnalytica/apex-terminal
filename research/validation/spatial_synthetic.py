"""Spatial-coupling validation on synthetic tissue-like grids.

Unibariate Moran's I:
  - random noise:   I ≈ 0,  p-perm > 0.05
  - gaussian bump:  I ≫ 0,  p-perm ≈ 0
  - checkerboard:   I < 0,  p-perm ≈ 0

Bivariate Moran's I:
  - coupled fields (y = x + small noise):  I_xy strongly positive
  - independent fields:                    I_xy ≈ 0
  - anti-coupled (y = -x):                 I_xy strongly negative

Coordinates: 20×20 square grid (n=400 spots).
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.spatial_coupling import (  # noqa: E402
    bivariate_morans_i,
    knn_weights,
    morans_i,
)


def grid_coords(side: int = 20) -> np.ndarray:
    xs, ys = np.meshgrid(np.arange(side), np.arange(side), indexing="ij")
    return np.column_stack([xs.ravel(), ys.ravel()])


def gaussian_bump(coords: np.ndarray, sigma: float = 3.0) -> np.ndarray:
    c = coords.mean(axis=0)
    d2 = ((coords - c) ** 2).sum(axis=1)
    return np.exp(-d2 / (2 * sigma ** 2))


def checkerboard(coords: np.ndarray) -> np.ndarray:
    return ((coords[:, 0].astype(int) + coords[:, 1].astype(int)) % 2).astype(float)


def main() -> None:
    coords = grid_coords(20)
    # k=4 = rook contiguity on a regular grid. k=8 (queen) makes the
    # checkerboard average to ≈ 0 because diagonal neighbors share
    # parity while orthogonal neighbors are anti-parity — the classic
    # rook-vs-queen distinction in spatial econometrics.
    W = knn_weights(coords, k=4)

    rng = np.random.default_rng(0)
    noise = rng.standard_normal(coords.shape[0])
    bump = gaussian_bump(coords)
    stripes = checkerboard(coords)

    print("=== univariate Moran's I ===")
    for name, x in [("noise", noise), ("gaussian", bump), ("checkerboard", stripes)]:
        r = morans_i(x, W, n_permutations=199, seed=42)
        print(f"  {name:13s} I={r.I:+.3f}  E[I]={r.expected:+.4f}  "
              f"p={r.p_perm:.3f}")

    ok_rand = True  # checked below
    r_rand = morans_i(noise, W, n_permutations=199, seed=42)
    r_bump = morans_i(bump, W, n_permutations=199, seed=42)
    r_chess = morans_i(stripes, W, n_permutations=199, seed=42)
    ok_rand = r_rand.p_perm > 0.05 and abs(r_rand.I) < 0.1
    ok_bump = r_bump.I > 0.5 and r_bump.p_perm < 0.02
    ok_chess = r_chess.I < -0.3

    print("\n=== bivariate Moran's I ===")
    coupled = bump + 0.1 * rng.standard_normal(coords.shape[0])
    independent = rng.standard_normal(coords.shape[0])
    anti = -bump + 0.1 * rng.standard_normal(coords.shape[0])

    i_pos = bivariate_morans_i(bump, coupled, W)
    i_zero = bivariate_morans_i(bump, independent, W)
    i_neg = bivariate_morans_i(bump, anti, W)
    print(f"  coupled    I_xy = {i_pos:+.3f}")
    print(f"  independent I_xy = {i_zero:+.3f}")
    print(f"  anti       I_xy = {i_neg:+.3f}")

    ok_biv_pos = i_pos > 0.5
    ok_biv_zero = abs(i_zero) < 0.15
    ok_biv_neg = i_neg < -0.5

    print("")
    print(f"univariate random ≈ 0 check:     {'PASS' if ok_rand else 'FAIL'}")
    print(f"univariate bump > 0 check:       {'PASS' if ok_bump else 'FAIL'}")
    print(f"univariate checker < 0 check:    {'PASS' if ok_chess else 'FAIL'}")
    print(f"bivariate coupled > 0 check:     {'PASS' if ok_biv_pos else 'FAIL'}")
    print(f"bivariate independent ≈ 0 check: {'PASS' if ok_biv_zero else 'FAIL'}")
    print(f"bivariate anti-coupled < 0:      {'PASS' if ok_biv_neg else 'FAIL'}")


if __name__ == "__main__":
    main()
