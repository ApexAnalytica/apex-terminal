"""IHDP semi-synthetic HTE benchmark.

Infant Health and Development Program — real 25-dim covariates from a
randomized home-visit intervention (Hill 2011, JCGS), with 100 simulated
potential-outcome realizations stamped on top. De-facto gold standard
for HTE meta-learner benchmarking (Shalit 2017, Künzel 2019, etc.).

Source: Fred Johansson's pre-processed npz bundles —
https://www.fredjo.com/files/ihdp_npci_1-100.{train,test}.npz
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np

_TRAIN = os.path.join(os.path.dirname(__file__), "_cache", "ihdp_train.npz")
_TEST = os.path.join(os.path.dirname(__file__), "_cache", "ihdp_test.npz")


@dataclass
class IhdpRealization:
    X_train: np.ndarray      # (n_train, d)
    T_train: np.ndarray      # (n_train,) binary
    Y_train: np.ndarray      # (n_train,) factual outcome
    tau_train: np.ndarray    # (n_train,) true CATE = mu1 - mu0
    X_test: np.ndarray
    tau_test: np.ndarray
    index: int


def load_ihdp(realization: int = 0) -> IhdpRealization:
    """Load one of the 100 IHDP realizations."""
    if not (os.path.exists(_TRAIN) and os.path.exists(_TEST)):
        raise FileNotFoundError(
            "IHDP npz missing — run research/scripts/fetch_ihdp.py"
        )
    tr = np.load(_TRAIN)
    te = np.load(_TEST)
    i = realization
    return IhdpRealization(
        X_train=tr["x"][:, :, i],
        T_train=tr["t"][:, i].astype(int),
        Y_train=tr["yf"][:, i],
        tau_train=tr["mu1"][:, i] - tr["mu0"][:, i],
        X_test=te["x"][:, :, i],
        tau_test=te["mu1"][:, i] - te["mu0"][:, i],
        index=i,
    )
