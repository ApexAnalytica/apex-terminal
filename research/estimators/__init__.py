"""Reference estimator implementations backing Manifold's criticality layer."""
from .bocpd import bocpd, BocpdResult, detect_changepoints_from_map  # noqa: F401
from .hte_meta import s_learner, t_learner, x_learner, CateFit  # noqa: F401
from .persistent_homology import (  # noqa: F401
    BettiTrajectory,
    betti1_at_epsilon,
    sliding_betti1,
    takens_embedding,
)

__all__ = [
    "bocpd", "BocpdResult", "detect_changepoints_from_map",
    "s_learner", "t_learner", "x_learner", "CateFit",
    "BettiTrajectory", "betti1_at_epsilon", "sliding_betti1", "takens_embedding",
]
