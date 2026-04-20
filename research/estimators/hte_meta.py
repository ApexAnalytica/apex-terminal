"""Meta-learners for heterogeneous-treatment-effect estimation.

Künzel et al 2019 (https://www.pnas.org/doi/10.1073/pnas.1804597116) —
the S-learner, T-learner, and X-learner framework. We wrap them around
any scikit-learn-style regressor so the research validation can swap
between GradientBoostingRegressor, RandomForestRegressor, etc.

These three learners all reduce HTE estimation to vanilla supervised
regression, which makes them:
  - straightforward to port to TypeScript (tree ensembles only,
    no proprietary Causal Forest split criteria),
  - robust on small-n settings (Mt Sinai compound screens, VX-880
    post-infusion cohorts, UBC preclinical),
  - aligned with the briefs' mention of Causal Forest / S/T/X-learners.

Binary treatment only; we will add multi-arm (regimen comparisons for
DRI Miami) in a follow-up.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
from sklearn.base import BaseEstimator, clone
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def _default_regressor() -> BaseEstimator:
    return GradientBoostingRegressor(
        n_estimators=100, max_depth=3, learning_rate=0.1, random_state=0
    )


def _default_propensity() -> BaseEstimator:
    # Scaled LR is well-conditioned for unscaled covariate matrices (IHDP,
    # clinical feature vectors with mixed scales). Without the scaler the
    # inner matmul overflows on heavy-tailed features.
    return Pipeline([
        ("scaler", StandardScaler()),
        ("logit", LogisticRegression(max_iter=1000, random_state=0)),
    ])


@dataclass
class CateFit:
    """Return value of every meta-learner.

    Call `.predict(X)` to obtain CATE estimates for new units.
    """
    predict: Callable[[np.ndarray], np.ndarray]
    kind: str  # 'S' | 'T' | 'X'


def s_learner(
    X: np.ndarray,
    T: np.ndarray,
    Y: np.ndarray,
    base_regressor: Optional[BaseEstimator] = None,
) -> CateFit:
    """S-learner (Künzel 2019 §2.1): one model on [X, T] → Y.

    CATE(x) = f(x, 1) - f(x, 0). Best when treatment effect is small
    relative to outcome variance (low-heterogeneity settings).
    """
    reg = clone(base_regressor if base_regressor is not None else _default_regressor())
    XT = np.column_stack([X, T])
    reg.fit(XT, Y)

    def predict(Xnew: np.ndarray) -> np.ndarray:
        n = Xnew.shape[0]
        one = np.column_stack([Xnew, np.ones(n)])
        zero = np.column_stack([Xnew, np.zeros(n)])
        return reg.predict(one) - reg.predict(zero)

    return CateFit(predict=predict, kind="S")


def t_learner(
    X: np.ndarray,
    T: np.ndarray,
    Y: np.ndarray,
    base_regressor: Optional[BaseEstimator] = None,
) -> CateFit:
    """T-learner (Künzel 2019 §2.2): separate models per treatment arm.

    CATE(x) = f1(x) - f0(x). Best with abundant data in both arms;
    can be noisy when one arm is small.
    """
    base = base_regressor if base_regressor is not None else _default_regressor()
    f0 = clone(base)
    f1 = clone(base)
    mask1 = T == 1
    mask0 = ~mask1
    f0.fit(X[mask0], Y[mask0])
    f1.fit(X[mask1], Y[mask1])

    def predict(Xnew: np.ndarray) -> np.ndarray:
        return f1.predict(Xnew) - f0.predict(Xnew)

    return CateFit(predict=predict, kind="T")


def x_learner(
    X: np.ndarray,
    T: np.ndarray,
    Y: np.ndarray,
    base_regressor: Optional[BaseEstimator] = None,
    propensity_model: Optional[BaseEstimator] = None,
) -> CateFit:
    """X-learner (Künzel 2019 §2.3): imputation + propensity-weighted blend.

    Stages:
      1. Fit outcome models f0, f1 as in T-learner.
      2. Impute counterfactual residuals:
           D1 = Y_1 - f0(X_1)   (treated units' residual vs. imputed control)
           D0 = f1(X_0) - Y_0   (control units' residual vs. imputed treated)
      3. Fit tau1(x) on (X_1, D1), tau0(x) on (X_0, D0).
      4. Blend by propensity:  tau(x) = e(x) * tau0(x) + (1-e(x)) * tau1(x).

    Handles treatment-arm imbalance better than the T-learner and is
    the Künzel 2019 workhorse on the IHDP benchmark.
    """
    base = base_regressor if base_regressor is not None else _default_regressor()
    prop = propensity_model if propensity_model is not None else _default_propensity()

    f0 = clone(base); f1 = clone(base)
    mask1 = T == 1
    mask0 = ~mask1
    f0.fit(X[mask0], Y[mask0])
    f1.fit(X[mask1], Y[mask1])

    D1 = Y[mask1] - f0.predict(X[mask1])
    D0 = f1.predict(X[mask0]) - Y[mask0]

    tau1 = clone(base); tau0 = clone(base)
    tau1.fit(X[mask1], D1)
    tau0.fit(X[mask0], D0)

    prop.fit(X, T)

    def predict(Xnew: np.ndarray) -> np.ndarray:
        e = prop.predict_proba(Xnew)[:, 1]
        return e * tau0.predict(Xnew) + (1.0 - e) * tau1.predict(Xnew)

    return CateFit(predict=predict, kind="X")
