"""Gaussian-process regression for dose- and protocol-response surfaces.

Thin wrapper around sklearn's `GaussianProcessRegressor` exposing two
kernel structures:

  - ``rbf``: a single RBF over the full feature vector, good when all
    inputs interact smoothly (classic Friedman-#1 style regressions).
  - ``additive``: RBF over the covariate block + independent RBF over
    the dose block, summed. Matches the Künzel 2019 / Williams-Rasmussen
    intuition that dose enters the response surface factorizably with
    the subject features — the typical assumption in pharmacokinetics
    and in the VX-880 / TZD titration briefs.

Separate ``fit`` / ``predict`` returning posterior mean and sd so
downstream callers can plot credible bands or drive acquisition
functions for dose-finding.

This is a bridge layer — once validated, the same kernel structure is
a ~50-line TS port backed by `@stdlib/linalg-cholesky` or equivalent.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel, Kernel, WhiteKernel
from sklearn.preprocessing import StandardScaler


class _SubspaceRBF(Kernel):
    """RBF restricted to a subset of input dimensions.

    sklearn's built-in kernel operators (`k1 + k2`) always apply each
    kernel to the full feature matrix. For a *true* additive kernel
    k_feat(x_feat) + k_dose(x_dose) we need each summand to see only its
    own block. This wrapper accomplishes that by slicing `X` before
    delegating to an inner RBF.

    The gradient is passed through unchanged — sklearn treats it as a
    leaf kernel with the inner RBF's parameters exposed via
    ``get_params`` / ``set_params``.
    """

    def __init__(self, cols: tuple[int, ...], length_scale, length_scale_bounds):
        self.cols = cols
        self.length_scale = length_scale
        self.length_scale_bounds = length_scale_bounds

    def _inner(self) -> RBF:
        return RBF(
            length_scale=self.length_scale,
            length_scale_bounds=self.length_scale_bounds,
        )

    def __call__(self, X, Y=None, eval_gradient=False):
        Xs = X[:, list(self.cols)]
        Ys = None if Y is None else Y[:, list(self.cols)]
        return self._inner()(Xs, Ys, eval_gradient=eval_gradient)

    def diag(self, X):
        return self._inner().diag(X[:, list(self.cols)])

    def is_stationary(self):
        return True

    @property
    def hyperparameter_length_scale(self):
        return self._inner().hyperparameter_length_scale

    @property
    def theta(self):
        return self._inner().theta

    @theta.setter
    def theta(self, value):
        inner = self._inner()
        inner.theta = value
        self.length_scale = inner.length_scale

    @property
    def bounds(self):
        return self._inner().bounds

    def get_params(self, deep=True):
        return {
            "cols": self.cols,
            "length_scale": self.length_scale,
            "length_scale_bounds": self.length_scale_bounds,
        }

    def __repr__(self):
        return f"SubspaceRBF(cols={self.cols}, length_scale={self.length_scale})"


@dataclass
class GpFit:
    """Fitted GP with posterior-predictive helpers."""
    predict: "callable"  # (Xnew, return_std=False) -> ndarray | (mean, std)
    kernel_: str         # the optimized kernel expression (for debugging)
    log_marginal_likelihood: float
    scaler_X: StandardScaler
    scaler_y: StandardScaler


def _make_kernel(kind: str, d_features: int, d_dose: int):
    if kind == "rbf":
        return ConstantKernel(1.0, (1e-3, 1e3)) * RBF(
            length_scale=np.ones(d_features + d_dose),
            length_scale_bounds=(1e-2, 1e3),
        ) + WhiteKernel(noise_level=0.1, noise_level_bounds=(1e-6, 1e1))
    if kind == "additive":
        if d_dose == 0:
            raise ValueError("additive kernel needs a non-empty dose block")
        feat_cols = tuple(range(d_features))
        dose_cols = tuple(range(d_features, d_features + d_dose))
        k_feat = ConstantKernel(1.0, (1e-3, 1e3)) * _SubspaceRBF(
            cols=feat_cols,
            length_scale=np.ones(d_features),
            length_scale_bounds=(1e-2, 1e3),
        )
        k_dose = ConstantKernel(1.0, (1e-3, 1e3)) * _SubspaceRBF(
            cols=dose_cols,
            length_scale=np.ones(d_dose),
            length_scale_bounds=(1e-2, 1e3),
        )
        return k_feat + k_dose + WhiteKernel(
            noise_level=0.1, noise_level_bounds=(1e-6, 1e1)
        )
    raise ValueError(f"unknown kernel kind: {kind!r}")


def gp_fit(
    X: np.ndarray,
    y: np.ndarray,
    dose: Optional[np.ndarray] = None,
    kernel: str = "rbf",
    n_restarts: int = 3,
    random_state: int = 0,
) -> GpFit:
    """Fit a GP on (X, [dose]) → y.

    Parameters
    ----------
    X : (n, d_feat) covariate matrix.
    y : (n,) response.
    dose : optional (n, d_dose) dose/protocol matrix; stacked to the
        right of X for additive kernels.
    kernel : 'rbf' | 'additive'.
    """
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float).reshape(-1, 1)
    if dose is not None:
        dose = np.asarray(dose, dtype=float)
        if dose.ndim == 1:
            dose = dose[:, None]
        Z = np.hstack([X, dose])
        d_feat = X.shape[1]
        d_dose = dose.shape[1]
    else:
        Z = X
        d_feat = X.shape[1]
        d_dose = 0

    sx = StandardScaler().fit(Z)
    sy = StandardScaler().fit(y)
    Zs = sx.transform(Z)
    ys = sy.transform(y).ravel()

    k = _make_kernel(kernel, d_feat, d_dose)
    gp = GaussianProcessRegressor(
        kernel=k,
        normalize_y=False,  # we already scaled
        n_restarts_optimizer=n_restarts,
        random_state=random_state,
    )
    gp.fit(Zs, ys)

    def predict(Xnew, dose_new=None, return_std: bool = False):
        Xnew = np.asarray(Xnew, dtype=float)
        if dose_new is not None:
            dose_new = np.asarray(dose_new, dtype=float)
            if dose_new.ndim == 1:
                dose_new = dose_new[:, None]
            Znew = np.hstack([Xnew, dose_new])
        else:
            Znew = Xnew
        Zns = sx.transform(Znew)
        if return_std:
            mu_s, sd_s = gp.predict(Zns, return_std=True)
            mu = sy.inverse_transform(mu_s.reshape(-1, 1)).ravel()
            sd = sd_s * sy.scale_[0]
            return mu, sd
        mu_s = gp.predict(Zns)
        return sy.inverse_transform(mu_s.reshape(-1, 1)).ravel()

    return GpFit(
        predict=predict,
        kernel_=str(gp.kernel_),
        log_marginal_likelihood=float(gp.log_marginal_likelihood_value_),
        scaler_X=sx,
        scaler_y=sy,
    )
