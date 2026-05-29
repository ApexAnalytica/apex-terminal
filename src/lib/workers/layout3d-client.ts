/**
 * Main-thread client for the layout Web Worker.
 *
 * Exposes two request functions:
 *   - `requestLayout3D` — d3-force-3d simulation + network metrics
 *   - `requestLayout2D` — d3-force-2d simulation + network metrics
 *
 * Both share a single worker instance (lazily spun up on first use)
 * and multiplex concurrent requests via a monotonic `nextId`. Stale
 * responses (whose epoch is older than the caller's latest issued id)
 * are dropped — this is what makes fast topology switches feel
 * snappy: each switch posts a new request, the worker's still
 * finishing the previous one, but by the time it does we already
 * don't care about that result.
 *
 * SSR fallback: when `window` is undefined (Next.js server render,
 * test env), fall back to a synchronous compute via dynamic import.
 * This module is imported from `CausalDAG3D` / `CausalDAG2D`, both
 * of which are themselves `next/dynamic({ ssr: false })`, so the
 * SSR branch shouldn't fire in production — but it keeps the
 * Promise contract honest under vitest jsdom.
 */
import type { NodePosition, NodeMetrics } from "@/lib/graph-layout";
import type { Position2D } from "@/lib/graph-layout-2d";
import type { CausalNode, CausalEdge } from "@/lib/types";

export interface LayoutResult {
  positions: NodePosition[];
  metrics: Record<string, NodeMetrics>;
}
export interface Layout2DResult {
  positions2d: Map<string, Position2D>;
  metrics: Record<string, NodeMetrics>;
}

interface WorkerResponse {
  id: number;
  kind: "layout3d" | "layout2d";
  positions?: NodePosition[];
  positions2d?: Map<string, Position2D>;
  metrics: Record<string, NodeMetrics>;
}

let worker: Worker | null = null;
let nextId = 0;
// Promise resolvers, keyed by request id. Untyped because we route on
// the response's `kind` field — the public API guarantees the right
// shape comes back per call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, (r: any) => void>();

/**
 * Slim projections sent across the worker boundary.
 *
 * Both `computeLayout3D` / `computeNetworkMetrics` (3D) and
 * `compute2DForceLayout` (2D) read only a tiny subset of CausalNode /
 * CausalEdge: `id` (+ `domain` for 3D's z-layering) per node, and
 * `source` / `target` / `weight` per edge. Everything else — `label`,
 * `shortLabel`, the `omegaFragility` object, `liveData` arrays (which
 * grow per live-feed tick), `physicalMechanism` natural-language
 * strings, etc — is dead weight to the worker.
 *
 * structuredClone is O(payload bytes) and routinely runs 5-20 ms per MB
 * for nested objects. On the default ~350-node graph the full payload
 * sits around 200-700 KB; the slim projection is ~30 KB. Stripping the
 * payload before postMessage cuts launch / domain-swap clone time by
 * roughly an order of magnitude.
 *
 * The slim objects are cast to CausalNode / CausalEdge so the existing
 * worker request types still typecheck without forcing a sweep of
 * compute*Layout / computeNetworkMetrics signatures. Safe at runtime
 * because those functions only touch the fields the slim type carries.
 */
function slimNodes(nodes: CausalNode[]): CausalNode[] {
  const out: { id: string; domain: string }[] = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    out[i] = { id: n.id, domain: n.domain };
  }
  return out as unknown as CausalNode[];
}

function slimEdges(edges: CausalEdge[]): CausalEdge[] {
  const out: { id: string; source: string; target: string; weight: number }[] =
    new Array(edges.length);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    out[i] = { id: e.id, source: e.source, target: e.target, weight: e.weight };
  }
  return out as unknown as CausalEdge[];
}

function ensureWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }
  if (worker) return worker;
  worker = new Worker(new URL("./layout3d-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { id, kind } = e.data;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    if (kind === "layout3d") {
      resolve({ positions: e.data.positions!, metrics: e.data.metrics });
    } else {
      resolve({ positions2d: e.data.positions2d!, metrics: e.data.metrics });
    }
  };
  worker.onerror = (err) => {
    console.error("[layout-worker] error:", err);
  };
  return worker;
}

/**
 * Compute 3D layout + network metrics, off the main thread.
 */
export function requestLayout3D(
  nodes: CausalNode[],
  edges: CausalEdge[],
  prev?: NodePosition[],
): Promise<LayoutResult> & { id: number } {
  const w = ensureWorker();
  const id = nextId++;
  if (!w) {
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
    w.postMessage({
      id,
      kind: "layout3d",
      nodes: slimNodes(nodes),
      edges: slimEdges(edges),
      prev,
    });
  });
  return Object.assign(promise, { id });
}

/**
 * Compute 2D layout + network metrics, off the main thread.
 *
 * 2D doesn't support a warm-start `prev` argument (its sim is
 * cheaper to run cold than to incrementally update for one
 * topology change), so the signature stays minimal.
 */
export function requestLayout2D(
  nodes: CausalNode[],
  edges: CausalEdge[],
): Promise<Layout2DResult> & { id: number } {
  const w = ensureWorker();
  const id = nextId++;
  if (!w) {
    const result = import("@/lib/graph-layout-2d").then(async ({ compute2DForceLayout }) => {
      const { computeNetworkMetrics } = await import("@/lib/graph-layout");
      return {
        positions2d: compute2DForceLayout(nodes, edges),
        metrics: computeNetworkMetrics(nodes, edges),
      };
    });
    return Object.assign(result, { id });
  }
  const promise = new Promise<Layout2DResult>((resolve) => {
    pending.set(id, resolve);
    w.postMessage({
      id,
      kind: "layout2d",
      nodes: slimNodes(nodes),
      edges: slimEdges(edges),
    });
  });
  return Object.assign(promise, { id });
}
