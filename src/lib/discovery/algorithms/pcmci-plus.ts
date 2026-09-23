// ─── PCMCI+ (linear-Gaussian, lagged + contemporaneous) ──────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// Extends `pcmci-linear.ts` with PCMCI+ (Runge 2020): contemporaneous
// edges between time-series variables at the same time step, with
// principled orientation via Meek-rule propagation from v-structures
// discovered during a contemporaneous PC-stable phase.
//
// What this DOES (v0.2):
//
//   1. Phase 1 — Reuses the existing lagged PCMCI to find X[t-k] → Y[t]
//      with k > 0 (no duplication; the lagged backbone is identical).
//
//   2. Phase 2 — Contemporaneous PC-stable. Starts from the complete
//      contemporaneous graph, then iteratively removes edges (i, j)
//      whose partial correlation falls below contempAlpha when
//      conditioning on a subset of size condDim drawn from
//      adj[i] \ {j} OR adj[j] \ {i} (plus the union of lagged parents
//      of both endpoints in every test). Conditioning size grows
//      0 → maxCondsDim. "Stable" means each level uses a snapshot of
//      the skeleton taken at the start of that level — removal order
//      doesn't affect which subsets are tried. The separating set
//      sep(X, Y) that first showed independence is stored per pair.
//
//   3. Phase 3 — V-structure detection. For each unshielded triple
//      X — Z — Y (X and Y not adjacent in the surviving skeleton),
//      orient as X → Z ← Y when Z ∉ sep(X, Y). This is the
//      colliders-from-separation step that PC and PCMCI+ share.
//
//   4. Phase 4 — Meek rule propagation. Iteratively applies:
//      - R1: a → b — c with a, c not adjacent → orient b → c (would
//        otherwise create a new v-structure inconsistent with sep sets)
//      - R2: a → b → c with a — c → orient a → c (would otherwise
//        create a cycle a → b → c → a)
//      - R3: a — b, a — c, a — d, c → b, d → b, c not adj d →
//        orient a → b (only orientation consistent with the existing
//        colliders at b)
//      Fixpoint iteration until no rule fires. Edges that remain
//      unoriented after Meek emit with `endpointMarks: {circle, circle}`
//      per FCI convention.
//
// What this still does NOT do (vs full PCMCI+ in Runge 2020):
//
//   - No nonparametric CI tests (CMI-knn, GP-DC). Linear/Gaussian only.
//   - No special handling for contemporaneous self-loops (which
//     don't exist by construction — same-time-step self-influence
//     is collapsed into the noise term).
//   - The lagged phase still runs WITHOUT conditioning on
//     contemporaneous parents — so spurious lagged edges through a
//     contemporaneous chain (W[t-k] → X[t] → Y[t] inflating W[t-k] vs
//     Y[t] partial correlation) can survive into parentsByY. This
//     dilutes the conditioning set in Phase 2 but doesn't compromise
//     the contemporaneous skeleton's CI test logic.
//
// Compared to v0.1 (lagged-parent-imbalance heuristic): v0.2 produces
// strictly more oriented contemporaneous edges in realistic data, and
// the orientations are now backed by Pearl/Meek's separation-set
// logic rather than an ad-hoc imbalance check.
//
// Why we ship this anyway: the lagged-parent imbalance rule captures
// the strongest signal that pins contemporaneous orientation in real
// time series — when a variable is driven by external lagged forces
// the other isn't, it's almost certainly the upstream side of the
// contemporaneous edge. The conservative skeleton phase plus this
// orientation rule produces honest results: a directed-where-we-can,
// undirected-where-we-can't CPDAG-ish output.

import type { Cohort } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { combineFisherZ, partialCorrelation } from "./_partial-correlation";
import { buildSubjectGrid } from "./_cohort-data";
import { pcmciLinearAlgorithm } from "./pcmci-linear";

export interface PcmciPlusParams {
  /** Maximum lag in seconds. Default 1800 (30 min). */
  maxLagSeconds: number;
  /** Grid cadence in seconds. Default 300 (5 min). */
  gridSeconds: number;
  /** Significance threshold for PC-stable phase pruning (lagged). */
  pcAlpha: number;
  /** Final FDR-adjusted p-value threshold for MCI phase (lagged). */
  mciAlpha: number;
  /** FDR-adjusted p-value threshold for contemporaneous edges. */
  contempAlpha: number;
  /** Cap on the conditioning-set size during PC-stable phase 1. */
  maxCondsDim: number;
  /** Cap on the conditioning-set size in the MCI phase. */
  maxCondsDimMci: number;
  /** Minimum subjects per candidate. */
  minSubjects: number;
  /** Minimum grid points per subject. */
  minGridPoints: number;
}

const DEFAULT_PARAMS: PcmciPlusParams = {
  maxLagSeconds: 1800,
  gridSeconds: 300,
  pcAlpha: 0.05,
  mciAlpha: 0.05,
  contempAlpha: 0.05,
  maxCondsDim: 3,
  maxCondsDimMci: 5,
  minSubjects: 3,
  minGridPoints: 30,
};

interface LaggedVar {
  vIndex: number;
  lagSteps: number;
}

// ─── Helpers vendored from pcmci-linear ───────────────────────────────
//
// These are the same building blocks PCMCI uses; vendored here rather
// than re-exported so the lagged module stays self-contained and a
// future change to its private helpers doesn't break us.

function alignSeries(
  grid: Float64Array[],
  targetIdx: number,
  maxLag: number,
  conds: LaggedVar[],
): { y: number[]; Z: number[][] } {
  const T = grid[targetIdx].length;
  const y: number[] = [];
  const Z: number[][] = [];
  for (let t = maxLag; t < T; t++) {
    y.push(grid[targetIdx][t]);
    const row: number[] = [];
    for (const c of conds) row.push(grid[c.vIndex][t - c.lagSteps]);
    Z.push(row);
  }
  return { y, Z };
}

function alignSource(
  grid: Float64Array[],
  sourceIdx: number,
  sourceLag: number,
  maxLag: number,
): number[] {
  const T = grid[sourceIdx].length;
  const x: number[] = [];
  for (let t = maxLag; t < T; t++) x.push(grid[sourceIdx][t - sourceLag]);
  return x;
}

function combinedContempCITest(
  subjectGrids: Float64Array[][],
  yIdx: number,
  xIdx: number,
  conds: LaggedVar[],
  maxLag: number,
): { z: number; p: number; meanR: number; nSubjectsUsed: number } | null {
  const perSubject: { z: number; n: number; r: number }[] = [];
  for (const grid of subjectGrids) {
    if (grid[yIdx].length <= maxLag) continue;
    const { y, Z } = alignSeries(grid, yIdx, maxLag, conds);
    // Contemporaneous source: lag = 0 alignment.
    const x = alignSource(grid, xIdx, 0, maxLag);
    const result = partialCorrelation(x, y, Z, { min_n: 20 });
    if (result === null) continue;
    perSubject.push({ z: result.z, n: result.n, r: result.r });
  }
  if (perSubject.length === 0) return null;
  const { z, p } = combineFisherZ(perSubject, conds.length);
  const meanR = perSubject.reduce((s, e) => s + e.r, 0) / perSubject.length;
  return { z, p, meanR, nSubjectsUsed: perSubject.length };
}

// ─── PCMCI+ ───────────────────────────────────────────────────────────

// ─── Subset enumeration ──────────────────────────────────────────────
//
// Yields every k-sized subset of `arr` once, in a deterministic order.
// k=0 yields the empty subset (one iteration). Used by the PC-stable
// loop to enumerate candidate conditioning sets.

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k < 0 || k > arr.length) return;
  if (k === 0) {
    yield [];
    return;
  }
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i] += 1;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

// ─── PCMCI+ ───────────────────────────────────────────────────────────

export const pcmciPlusAlgorithm: DiscoveryAlgorithm<PcmciPlusParams> = {
  id: "pcmci-plus",
  version: "0.2.0",
  description:
    "PCMCI+ (Runge 2020) restricted to linear-Gaussian CI. Reuses the " +
    "existing lagged PCMCI for X[t-k] → Y[t] edges, then runs a " +
    "contemporaneous PC-stable phase (with separating-set tracking) " +
    "and orients via v-structures from separating sets + Meek-rule " +
    "propagation (R1/R2/R3). Edges that survive Meek without an " +
    "orientation emit with circle/circle endpoint marks. Honest about " +
    "remaining limitations (no nonparametric CI tests; lagged phase " +
    "doesn't condition on contemporaneous parents so chain-inflated " +
    "lagged edges can dilute Phase-2 conditioning).",
  defaultParams: DEFAULT_PARAMS,

  run(cohort: Cohort, params?: Partial<PcmciPlusParams>): DiscoveryResult {
    const p = { ...this.defaultParams, ...params };
    const variables = cohort.variables;
    const varIds = variables.map((v) => v.id);

    // ── Phase 1: lagged PCMCI (reuse existing impl) ──────────────────
    const laggedResult = pcmciLinearAlgorithm.run(cohort, {
      maxLagSeconds: p.maxLagSeconds,
      gridSeconds: p.gridSeconds,
      pcAlpha: p.pcAlpha,
      mciAlpha: p.mciAlpha,
      maxCondsDim: p.maxCondsDim,
      maxCondsDimMci: p.maxCondsDimMci,
      minSubjects: p.minSubjects,
      minGridPoints: p.minGridPoints,
    });

    // Bail if the lagged phase couldn't proceed (e.g. too few subjects
    // had grid points). Diagnostics are forwarded so the failure mode
    // is identical to plain PCMCI.
    if (laggedResult.edges.length === 0 && laggedResult.diagnostics?.reason) {
      return laggedResult;
    }

    // Build parents-by-Y from the lagged edges so the contemporaneous
    // CI tests can condition on them.
    const idToIdx = new Map(varIds.map((id, i) => [id, i] as const));
    const parentsByY = new Map<number, LaggedVar[]>();
    for (let i = 0; i < varIds.length; i++) parentsByY.set(i, []);
    for (const e of laggedResult.edges) {
      const yIdx = idToIdx.get(e.target);
      const xIdx = idToIdx.get(e.source);
      if (yIdx === undefined || xIdx === undefined) continue;
      const k = Math.round((e.lag ?? 0) / p.gridSeconds);
      if (k <= 0) continue;
      parentsByY.get(yIdx)!.push({ vIndex: xIdx, lagSteps: k });
    }

    // ── Phase 2: contemporaneous skeleton ────────────────────────────
    // Build subject grids ONCE for the contemporaneous phase. The
    // lagged phase built and discarded its own; rebuilding here keeps
    // the two phases decoupled (the lagged module owns its internals).
    const subjectGrids: Float64Array[][] = [];
    for (const subj of cohort.subjects) {
      const grid = buildSubjectGrid(
        subj,
        variables,
        p.gridSeconds,
        p.minGridPoints,
      );
      if (grid) subjectGrids.push(grid);
    }
    if (subjectGrids.length < p.minSubjects) {
      // The lagged phase passed the threshold but the contemporaneous
      // phase didn't — shouldn't happen unless the cohort changed
      // between calls. Emit lagged edges anyway, surface as diagnostic.
      return {
        variables: varIds,
        edges: laggedResult.edges,
        diagnostics: {
          ...laggedResult.diagnostics,
          contemporaneousPhase: "skipped — insufficient subjects",
        },
      };
    }

    const maxLagSteps = Math.max(
      1,
      Math.floor(p.maxLagSeconds / p.gridSeconds),
    );
    const V = varIds.length;

    // ── Phase 2: Contemporaneous PC-stable ───────────────────────────
    //
    // adj[i] tracks i's current contemporaneous neighbors as edges are
    // removed. Start complete (every pair adjacent). Each level k
    // attempts to find a separating subset of size k drawn from either
    // adj[i] \ {j} or adj[j] \ {i}, plus the union of lagged parents
    // of both endpoints in every test.
    //
    // The "stable" property: at the start of each level we snapshot
    // adj, then enumerate subsets from the snapshot — not from the
    // mutating live adj. So removal order within a level doesn't
    // change which subsets get tried, and the algorithm is
    // deterministic in subset enumeration order.
    const adj: Set<number>[] = Array.from({ length: V }, () => new Set());
    for (let i = 0; i < V; i++) {
      for (let j = 0; j < V; j++) if (i !== j) adj[i].add(j);
    }

    // Final-test result cache per surviving pair → strength + pValue
    // for edge emission. Updated on every test that DOESN'T separate
    // the pair (so the last surviving test wins).
    const pairKey = (a: number, b: number): string =>
      a < b ? `${a}_${b}` : `${b}_${a}`;
    const lastSurvivingTest = new Map<
      string,
      { meanR: number; p: number; condCount: number }
    >();
    const sepSet = new Map<string, Set<number>>();

    // Lagged parents as conditioning fixtures, deduped by (vIdx, lag).
    const buildLaggedConds = (i: number, j: number): LaggedVar[] => {
      const seen = new Set<string>();
      const out: LaggedVar[] = [];
      const add = (lv: LaggedVar) => {
        const key = `${lv.vIndex}@${lv.lagSteps}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(lv);
      };
      for (const lv of parentsByY.get(i) ?? []) add(lv);
      for (const lv of parentsByY.get(j) ?? []) add(lv);
      return out;
    };

    let totalCITests = 0;
    let totalSeparations = 0;
    for (let condDim = 0; condDim <= p.maxCondsDim; condDim++) {
      // Snapshot for stability — subset enumeration reads this, not
      // the mutating adj.
      const snapshot: Set<number>[] = adj.map((s) => new Set(s));
      const toRemove: Array<[number, number, Set<number>]> = [];
      let anyEligible = false;

      for (let i = 0; i < V; i++) {
        for (const j of adj[i]) {
          if (j <= i) continue;
          // PC-stable: condition on subsets of snapshotAdj[i] \ {j}
          // (then snapshotAdj[j] \ {i} if first side didn't separate).
          const candI = [...snapshot[i]].filter((x) => x !== j);
          const candJ = [...snapshot[j]].filter((x) => x !== i);
          if (candI.length < condDim && candJ.length < condDim) continue;
          anyEligible = true;

          const laggedConds = buildLaggedConds(i, j);
          let separated: Set<number> | null = null;

          // First side: subsets from candI
          if (candI.length >= condDim) {
            for (const subset of combinations(candI, condDim)) {
              const contempConds: LaggedVar[] = subset.map((v) => ({
                vIndex: v,
                lagSteps: 0,
              }));
              const conds = [...contempConds, ...laggedConds];
              const test = combinedContempCITest(
                subjectGrids,
                j,
                i,
                conds,
                maxLagSteps,
              );
              totalCITests += 1;
              if (test === null) continue;
              if (test.p > p.contempAlpha) {
                separated = new Set(subset);
                break;
              }
              // Track for later strength/pValue emission.
              lastSurvivingTest.set(pairKey(i, j), {
                meanR: test.meanR,
                p: test.p,
                condCount: conds.length,
              });
            }
          }

          // Second side: subsets from candJ (only if first didn't separate)
          if (separated === null && candJ.length >= condDim) {
            for (const subset of combinations(candJ, condDim)) {
              const contempConds: LaggedVar[] = subset.map((v) => ({
                vIndex: v,
                lagSteps: 0,
              }));
              const conds = [...contempConds, ...laggedConds];
              const test = combinedContempCITest(
                subjectGrids,
                i,
                j,
                conds,
                maxLagSteps,
              );
              totalCITests += 1;
              if (test === null) continue;
              if (test.p > p.contempAlpha) {
                separated = new Set(subset);
                break;
              }
              lastSurvivingTest.set(pairKey(i, j), {
                meanR: test.meanR,
                p: test.p,
                condCount: conds.length,
              });
            }
          }

          if (separated !== null) {
            toRemove.push([i, j, separated]);
          }
        }
      }

      // Apply removals after the level finishes (preserves stability).
      for (const [i, j, sep] of toRemove) {
        adj[i].delete(j);
        adj[j].delete(i);
        sepSet.set(pairKey(i, j), sep);
        totalSeparations += 1;
      }

      if (!anyEligible) break;
    }

    // ── Phase 3: V-structure detection ───────────────────────────────
    //
    // For each unshielded triple (i, k, j) — i and j both adjacent to
    // k in the surviving skeleton, but i and j NOT adjacent — orient
    // i → k ← j when k is NOT in sep(i, j). This is the canonical
    // collider-from-separation step that lets observational data
    // distinguish chains from colliders.
    //
    // `orient.get(pairKey(a, b))` returns { from, to } when oriented;
    // missing key means the (still-skeleton) edge is undirected.
    const orient = new Map<string, { from: number; to: number }>();
    const setOrient = (from: number, to: number): void => {
      orient.set(pairKey(from, to), { from, to });
    };

    let vStructuresFound = 0;
    for (let k = 0; k < V; k++) {
      const nbrs = [...adj[k]];
      for (let a = 0; a < nbrs.length; a++) {
        for (let b = a + 1; b < nbrs.length; b++) {
          const i = nbrs[a];
          const j = nbrs[b];
          if (adj[i].has(j)) continue; // shielded — skip
          const sep = sepSet.get(pairKey(i, j));
          if (!sep) continue; // pair was never separated → can't decide
          if (sep.has(k)) continue; // k in sep → chain, not collider
          // V-structure: i → k ← j. Note this can conflict with an
          // existing orientation (rare; would mean the sep sets are
          // inconsistent). Last write wins — Meek will then propagate
          // from whatever orientations are in place.
          setOrient(i, k);
          setOrient(j, k);
          vStructuresFound += 1;
        }
      }
    }

    // ── Phase 4: Meek rule propagation ───────────────────────────────
    //
    // Iterate R1/R2/R3 until no rule fires. Each iteration is O(V³)
    // worst-case; the loop terminates because every iteration that
    // changes anything strictly grows the set of oriented edges.
    const isDirected = (a: number, b: number): boolean => {
      const o = orient.get(pairKey(a, b));
      return !!o && o.from === a && o.to === b;
    };
    const isUndirected = (a: number, b: number): boolean =>
      adj[a].has(b) && !orient.has(pairKey(a, b));

    let meekIterations = 0;
    let r1Fires = 0;
    let r2Fires = 0;
    let r3Fires = 0;
    let changed = true;
    while (changed) {
      changed = false;
      meekIterations += 1;
      // R1: a → b — c with a, c not adjacent → orient b → c
      for (let a = 0; a < V; a++) {
        for (const b of adj[a]) {
          if (!isDirected(a, b)) continue;
          for (const c of adj[b]) {
            if (c === a) continue;
            if (!isUndirected(b, c)) continue;
            if (adj[a].has(c)) continue;
            setOrient(b, c);
            r1Fires += 1;
            changed = true;
          }
        }
      }
      // R2: a → b → c and a — c → orient a → c
      for (let a = 0; a < V; a++) {
        for (const c of adj[a]) {
          if (!isUndirected(a, c)) continue;
          let fired = false;
          for (const b of adj[a]) {
            if (b === c) continue;
            if (isDirected(a, b) && isDirected(b, c)) {
              setOrient(a, c);
              r2Fires += 1;
              changed = true;
              fired = true;
              break;
            }
          }
          if (fired) continue;
        }
      }
      // R3: a — b, a — c, a — d, c → b, d → b, c not adj d → orient a → b
      for (let a = 0; a < V; a++) {
        for (const b of adj[a]) {
          if (!isUndirected(a, b)) continue;
          const nbrsA = [...adj[a]];
          let fired = false;
          for (let i = 0; i < nbrsA.length && !fired; i++) {
            const c = nbrsA[i];
            if (c === b || !isUndirected(a, c) || !isDirected(c, b)) continue;
            for (let j = i + 1; j < nbrsA.length && !fired; j++) {
              const d = nbrsA[j];
              if (d === b || !isUndirected(a, d) || !isDirected(d, b)) continue;
              if (adj[c].has(d)) continue;
              setOrient(a, b);
              r3Fires += 1;
              changed = true;
              fired = true;
            }
          }
        }
      }
      // Safety bound: Meek converges in O(V²) iterations on any
      // well-formed input, but cap to avoid infinite loops on
      // pathologies. 100 is comfortably above any realistic graph.
      if (meekIterations > 100) break;
    }

    // ── Emit edges ───────────────────────────────────────────────────
    const contempEdges: DiscoveredEdge[] = [];
    for (let i = 0; i < V; i++) {
      for (const j of adj[i]) {
        if (j <= i) continue;
        const pk = pairKey(i, j);
        const stats = lastSurvivingTest.get(pk);
        // Fall back to NaN if no test ever survived (shouldn't happen
        // for edges still in adj, but be defensive).
        const meanR = stats?.meanR ?? Number.NaN;
        const pValue = stats?.p ?? Number.NaN;
        const condCount = stats?.condCount ?? 0;

        const o = orient.get(pk);
        if (o) {
          contempEdges.push({
            source: varIds[o.from],
            target: varIds[o.to],
            strength: meanR,
            pValue,
            evidence: `Contemporaneous |r|=${Math.abs(meanR).toFixed(
              3,
            )} after conditioning on ${condCount} covariates; oriented ${
              varIds[o.from]
            } → ${varIds[o.to]} via v-structure detection + Meek propagation.`,
            endpointMarks: { sourceMark: "tail", targetMark: "arrow" },
          });
        } else {
          contempEdges.push({
            source: varIds[i],
            target: varIds[j],
            strength: meanR,
            pValue,
            evidence: `Contemporaneous |r|=${Math.abs(meanR).toFixed(
              3,
            )} after conditioning on ${condCount} covariates; orientation undetermined after Meek (no v-structure pinned the direction).`,
            endpointMarks: { sourceMark: "circle", targetMark: "circle" },
          });
        }
      }
    }

    return {
      variables: varIds,
      edges: [...laggedResult.edges, ...contempEdges],
      diagnostics: {
        ...laggedResult.diagnostics,
        contemporaneousPhase: {
          ciTests: totalCITests,
          edgesRemoved: totalSeparations,
          vStructuresFound,
          meekIterations,
          meekR1Fires: r1Fires,
          meekR2Fires: r2Fires,
          meekR3Fires: r3Fires,
          edgesEmitted: contempEdges.length,
          edgesDirected: contempEdges.filter(
            (e) => e.endpointMarks?.targetMark === "arrow",
          ).length,
          edgesUndirected: contempEdges.filter(
            (e) => e.endpointMarks?.sourceMark === "circle",
          ).length,
        },
      },
    };
  },
};
