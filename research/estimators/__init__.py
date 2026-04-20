"""Reference estimator implementations backing Manifold's criticality layer."""
from .bocpd import bocpd, BocpdResult, detect_changepoints_from_map  # noqa: F401
from .cox import CoxFit, cox_fit  # noqa: F401
from .gp_regression import GpFit, gp_fit  # noqa: F401
from .hierarchical import (  # noqa: F401
    HlmFit,
    SpeciesData,
    complete_pooling,
    hlm_fit,
    no_pooling,
)
from .hte_meta import s_learner, t_learner, x_learner, CateFit  # noqa: F401
from .nlme import NlmeFit, NlmeSubject, nlme_fit  # noqa: F401
from .spatial_coupling import (  # noqa: F401
    MoranResult,
    bivariate_morans_i,
    knn_weights,
    morans_i,
)
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
    "hlm_fit", "HlmFit", "SpeciesData", "no_pooling", "complete_pooling",
    "s_learner", "t_learner", "x_learner", "CateFit",
    "nlme_fit", "NlmeFit", "NlmeSubject",
    "BettiTrajectory", "betti1_at_epsilon", "sliding_betti1", "takens_embedding",
    "morans_i", "bivariate_morans_i", "knn_weights", "MoranResult",
    "transfer_entropy", "TeResult",
]
