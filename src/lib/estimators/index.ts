// TS-ported subset of the M-T1D-02 estimator suite. Each module is a
// direct port of its counterpart in research/estimators/ with a
// corresponding parity test under src/lib/__tests__/estimators/.
//
// Heavier-math estimators (GP regression, Cox PH, NLME C-peptide decay,
// cross-species HLM, HTE meta-learners) remain Python-only until a
// linear-algebra dependency decision — the Python reference is the
// ground truth for algorithmic correctness in the meantime. See
// research/README.md for the full status table.

export {
  bocpd,
  detectChangepointsFromMap,
  lgamma,
  logsumexp,
} from "./bocpd";
export type { BocpdOptions, BocpdResult } from "./bocpd";

export { transferEntropy } from "./transfer-entropy";
export type { TeOptions, TeResult } from "./transfer-entropy";

export {
  bivariateMoransI,
  knnWeights,
  moransI,
} from "./moran";
export type { MoranResult, WeightMatrix } from "./moran";

export {
  betti1FromDiagram,
  median,
  medianPairwiseDistance,
  pairwiseDistancesUpper,
  takensEmbedding,
} from "./persistent-homology";
export type {
  BettiAtEpsilon,
  PersistenceBar,
} from "./persistent-homology";
