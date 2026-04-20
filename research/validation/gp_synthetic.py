"""GP regression validation on synthetic benchmarks.

Two cases:

  (1) Friedman #1 — canonical nonlinear-regression benchmark:
      y = 10·sin(π·x1·x2) + 20·(x3 − 0.5)^2 + 10·x4 + 5·x5 + ε
      Inputs uniform on [0, 1]^10 (the last 5 are distractors).
      GP with RBF kernel should beat ridge and approach the paper's
      reported test-RMSE (~1.0-1.3 with n=200 training points).

  (2) Additive dose-response surface:
      y = f(x) + g(dose) + ε
      f(x) = sin(2π x1) + 0.5 x2
      g(d) = sigmoid(3·(d − 0.4))
      Additive kernel should match the full-RBF kernel in-sample and
      extrapolate better on held-out doses.
"""
from __future__ import annotations

import os
import sys

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_squared_error

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.gp_regression import gp_fit  # noqa: E402


def friedman1(n: int, d: int = 10, noise: float = 1.0, seed: int = 0):
    rng = np.random.default_rng(seed)
    X = rng.uniform(0, 1, size=(n, d))
    y = (
        10 * np.sin(np.pi * X[:, 0] * X[:, 1])
        + 20 * (X[:, 2] - 0.5) ** 2
        + 10 * X[:, 3]
        + 5 * X[:, 4]
        + noise * rng.standard_normal(n)
    )
    return X, y


def dose_response(n: int, seed: int = 0):
    rng = np.random.default_rng(seed)
    X = rng.uniform(0, 1, size=(n, 2))
    dose = rng.uniform(0, 1, size=(n, 1))

    def f(x):
        return np.sin(2 * np.pi * x[:, 0]) + 0.5 * x[:, 1]

    def g(d):
        return 1.0 / (1.0 + np.exp(-3 * (d[:, 0] - 0.4)))

    y = f(X) + g(dose) + 0.2 * rng.standard_normal(n)
    return X, dose, y


def rmse(y_true, y_pred):
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def main() -> None:
    print("=== Friedman #1 (n=200 train, 500 test, 10 features, noise=1.0) ===")
    X_tr, y_tr = friedman1(200, seed=0)
    X_te, y_te = friedman1(500, seed=1)

    gp = gp_fit(X_tr, y_tr, kernel="rbf", n_restarts=3)
    mu_gp, sd_gp = gp.predict(X_te, return_std=True)
    gp_rmse = rmse(y_te, mu_gp)

    ridge = Ridge(alpha=1.0).fit(X_tr, y_tr)
    ridge_rmse = rmse(y_te, ridge.predict(X_te))

    # Coverage: fraction of test points inside 95% posterior band.
    lo = mu_gp - 1.96 * sd_gp
    hi = mu_gp + 1.96 * sd_gp
    cov = float(((y_te >= lo) & (y_te <= hi)).mean())

    print(f"GP   test RMSE = {gp_rmse:.3f}")
    print(f"Ridge test RMSE = {ridge_rmse:.3f}")
    print(f"GP 95% coverage = {cov:.2f}   "
          f"log-marg-lik = {gp.log_marginal_likelihood:.1f}")
    print(f"kernel: {gp.kernel_}")
    ok_friedman = gp_rmse < ridge_rmse * 0.7  # GP should meaningfully beat ridge

    print("\n=== Additive dose-response (n=150, holdout dose=0.9) ===")
    X_all, d_all, y_all = dose_response(200, seed=0)
    # Hold out high-dose extrapolation region (dose > 0.8)
    tr_mask = d_all.ravel() <= 0.8
    X_tr, d_tr, y_tr = X_all[tr_mask], d_all[tr_mask], y_all[tr_mask]
    X_te, d_te, y_te = X_all[~tr_mask], d_all[~tr_mask], y_all[~tr_mask]

    gp_add = gp_fit(X_tr, y_tr, dose=d_tr, kernel="additive", n_restarts=3)
    gp_full = gp_fit(X_tr, y_tr, dose=d_tr, kernel="rbf", n_restarts=3)

    mu_add = gp_add.predict(X_te, dose_new=d_te)
    mu_full = gp_full.predict(X_te, dose_new=d_te)
    print(f"additive kernel:  extrapolation RMSE = {rmse(y_te, mu_add):.3f}")
    print(f"monolithic RBF:   extrapolation RMSE = {rmse(y_te, mu_full):.3f}")
    ok_additive = rmse(y_te, mu_add) <= rmse(y_te, mu_full) * 1.1  # within 10%

    print("")
    print(f"Friedman GP-beats-ridge check:      {'PASS' if ok_friedman else 'FAIL'}")
    print(f"Additive-vs-RBF extrapolation check: {'PASS' if ok_additive else 'FAIL'}")


if __name__ == "__main__":
    main()
