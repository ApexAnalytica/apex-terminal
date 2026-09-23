// ─── Cycle count — DAG integrity check ───────────────────────────────
//
// Counts the number of strongly-connected components (SCCs) with size
// > 1 — each non-trivial SCC contains at least one directed cycle.
// Real causal graphs are DAGs by construction, so any non-zero count
// is a structural violation worth surfacing immediately (it'd also
// trip Tarski's A-03 "DAG integrity" axiom but the calc is faster
// to scan visually).
//
// Uses Tarjan's SCC algorithm — O(|V| + |E|) with explicit-stack
// iteration so deep graphs don't blow the JS recursion budget.

import type { Calculation, CalculationResult } from "./types";

/**
 * Count cyclic strongly-connected components (size > 1 OR a self-
 * looping singleton) via iterative Tarjan SCC. Exported so the
 * Tarski scorer can read this feature without duplicating the
 * algorithm — keeps the calc and the relevance booster in sync.
 */
export function countCyclicSCCs(
  nodes: { id: string }[],
  edges: { source: string; target: string; isSevered?: boolean }[],
): number {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.isSevered) continue;
    const out = adj.get(e.source);
    if (out) out.push(e.target);
  }

  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;
  let cyclicCount = 0;

  // Iterative Tarjan with explicit work stack so we don't recurse —
  // production graphs aren't deep enough to matter today but a
  // stack-overflow risk on a 5k-node graph is real and free to avoid.
  for (const start of nodes) {
    if (indices.has(start.id)) continue;
    const work: { v: string; iter: number }[] = [{ v: start.id, iter: 0 }];
    indices.set(start.id, index);
    lowlinks.set(start.id, index);
    index += 1;
    stack.push(start.id);
    onStack.add(start.id);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const neighbours = adj.get(frame.v) ?? [];
      if (frame.iter < neighbours.length) {
        const w = neighbours[frame.iter];
        frame.iter += 1;
        if (!indices.has(w)) {
          indices.set(w, index);
          lowlinks.set(w, index);
          index += 1;
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, iter: 0 });
        } else if (onStack.has(w)) {
          lowlinks.set(frame.v, Math.min(lowlinks.get(frame.v)!, indices.get(w)!));
        }
      } else {
        // Post-order: contract child low-links into parent, pop SCC if
        // this is a root.
        const v = frame.v;
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1].v;
          lowlinks.set(parent, Math.min(lowlinks.get(parent)!, lowlinks.get(v)!));
        }
        if (lowlinks.get(v) === indices.get(v)) {
          let sccSize = 0;
          let hasSelfLoop = false;
          while (stack.length > 0) {
            const w = stack.pop()!;
            onStack.delete(w);
            sccSize += 1;
            if (w === v) {
              hasSelfLoop = (adj.get(w) ?? []).includes(w);
              break;
            }
          }
          // Cyclic SCC = size > 1 OR a single node with a self-loop.
          if (sccSize > 1 || hasSelfLoop) cyclicCount += 1;
        }
      }
    }
  }
  return cyclicCount;
}

export const cycleCountCalculation: Calculation = {
  id: "cycle-count",
  name: "Cycle count",
  description:
    "Number of cyclic strongly-connected components in the live graph. Causal graphs are DAGs by construction — any non-zero count is a structural violation (also flagged by Tarski A-03).",
  category: "structure",
  appliesWhen: (ctx) => ctx.graph.edges.length > 0,
  compute: (ctx): CalculationResult | null => {
    const count = countCyclicSCCs(ctx.graph.nodes, ctx.graph.edges);
    const tone = count > 0 ? "red" : "green";
    const detail =
      count === 0
        ? "graph is acyclic — DAG property holds"
        : count === 1
          ? "1 cyclic SCC — A-03 violation"
          : `${count} cyclic SCCs — A-03 violation`;
    return {
      value: { kind: "scalar", value: count, precision: 0 },
      detail,
      tone,
    };
  },
  toGraphSnapshot: (result) => {
    if (result.value.kind !== "scalar") return null;
    return { value: result.value.value };
  },
};
