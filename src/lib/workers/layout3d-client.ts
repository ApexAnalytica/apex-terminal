/**
 * Main-thread client for the layout-3D Web Worker.
 *
 * Spins up a single shared worker on first use, multiplexes
 * concurrent requests via a `nextId` epoch, and routes each
 * response to the right caller. Stale responses (whose epoch is
 * older than the latest issued one) are dropped — this is what
 * makes "fast-switching domains" feel snappy: each switch posts a
 * new request, the worker's still finishing the previous one, but
 * by the time it does we already don't care about that result.
 *
 * SSR fallback: when `window` is undefined (Next.js server render,
 * test env), fall back to a synchronous compute on the same module
 * so the API surface is identical. This module is imported from
 * `CausalDAG3D`, which is itself `next/dynamic({ ssr: false })`, so
 * the SSR branch shouldn't fire in production — but it keeps the
 * Promise contract honest for vitest and any future test that
 * exercises this client directly.
 */
import type { NodePosition, NodeMetrics } from "@/lib/graph-layout";
import type { CausalNode, CausalEdge } from "@/lib/types";

export interface LayoutResult {
  positions: NodePosition[];
  metrics: Record<string, NodeMetrics>;
}

interface WorkerResponse {
  id: number;
  positions: NodePosition[];
  metrics: Record<string, NodeMetrics>;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: LayoutResult) => void>();

function ensureWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }
  if (worker) return worker;
  // Standard module-worker URL pattern. Next.js / webpack 5 + Turbopack
  // both recognise `new URL(..., import.meta.url)` as a worker chunk
  // boundary and emit a separate bundle.
  worker = new Worker(new URL("./layout3d-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { id, positions, metrics } = e.data;
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve({ positions, metrics });
    }
  };
  worker.onerror = (err) => {
    // Surface in dev; the caller will keep waiting on the Promise. A
    // future iteration could reject pending Promises here, but for the
    // tight loop of "graph topology changed → re-layout" the safer
    // path on a transient worker error is to leave the previous
    // positions on screen.
    console.error("[layout3d-worker] error:", err);
  };
  return worker;
}

/**
 * Compute layout + network metrics for a graph, returning a Promise.
 *
 * Each invocation gets a monotonically-increasing `id`. The caller
 * can compare the resolved `id` against the latest issued id (kept
 * by `getLatestRequestId`) to detect stale responses, but the
 * simpler pattern — and what CausalDAG3D uses — is to track its
 * own "current request" ref and only apply the response if it
 * matches.
 */
export function requestLayout3D(
  nodes: CausalNode[],
  edges: CausalEdge[],
  prev?: NodePosition[],
): Promise<LayoutResult> & { id: number } {
  const w = ensureWorker();
  const id = nextId++;
  if (!w) {
    // SSR / test fallback — synchronous compute. The dynamic import
    // keeps the d3-force-3d dep out of the SSR bundle path.
    const result = import("@/lib/graph-layout").then(
      ({ computeLayout3D, computeNetworkMetrics }) => ({
        positions: computeLayout3D(nodes, edges, prev),
        metrics: computeNetworkMetrics(nodes, edges),
      }),
    );
    return Object.assign(result, { id });
  }
  const promise = new Promise<LayoutResult>((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, nodes, edges, prev });
  });
  return Object.assign(promise, { id });
}
