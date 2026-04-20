"""Reference estimator implementations backing Manifold's criticality layer."""
from .bocpd import bocpd, BocpdResult, detect_changepoints_from_map  # noqa: F401
from .cox import CoxFit, cox_fit  # noqa: F401
from .gp_regression import GpFit, gp_fit  # noqa: F401
from .hte_meta import s_learner, t_learner, x_learner, CateFit  # noqa: F401
from .persistent_homology import (  # noqa: F401
    BettiTrajectory,
    betti1_at_epsilon,
    sliding_betti1,
    takens_embedding,
)
from .transfer_entropy import TeResult, transfer_entropy  # noqa: F401

__all__ = [
    "bocpd", "BocpdResult", "detect_changepoints_from_map",
    "cox_fit", "CoxFit",
    "gp_fit", "GpFit",
    "s_learner", "t_learner", "x_learner", "CateFit",
    "BettiTrajectory", "betti1_at_epsilon", "sliding_betti1", "takens_embedding",
    "transfer_entropy", "TeResult",
]
