/**
 * Layout-3D Web Worker.
 *
 * Owns the two heaviest synchronous computations the 3D canvas would
 * otherwise run on the main thread on every `topologyKey` change:
 *
 *   - `computeLayout3D` — d3-force-3d simulation, 200 iterations of
 *     many-body / link / centering forces. Cold-start cost on a 500-
 *     node CROSS-DOMAIN workspace was the bulk of the LAUNCH-WORKSPACE
 *     freeze the user reported back in this session.
 *   - `computeNetworkMetrics` — eigenvector centrality (30 power-
 *     iteration steps) + sampled Brandes' betweenness + clustering
 *     coefficient. O(V·E)-ish in the worst case.
 *
 * Both are pure (graph in → plain-data out), no DOM access, no React
 * — perfect worker fodder. Bundling them into a single call avoids
 * paying a second postMessage roundtrip when the canvas needs both
 * results to start rendering.
 *
 * Messages:
 *   Request:  { id, nodes, edges, prev? }
 *   Response: { id, positions, metrics }
 *
 * Caller-side cancellation lives in the client wrapper (see
 * `layout3d-client.ts`); the worker itself just answers every
 * request it receives.
 */
import {
  computeLayout3D,
  computeNetworkMetrics,
  type NodePosition,
  type NodeMetrics,
} from "@/lib/graph-layout";
import type { CausalNode, CausalEdge } from "@/lib/types";

interface LayoutRequest {
  id: number;
  nodes: CausalNode[];
  edges: CausalEdge[];
  prev?: NodePosition[];
}

interface LayoutResponse {
  id: number;
  positions: NodePosition[];
  metrics: Record<string, NodeMetrics>;
}

// Vite/Next worker entry: `self` is the dedicated worker scope.
self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const { id, nodes, edges, prev } = e.data;
  const positions = computeLayout3D(nodes, edges, prev);
  const metrics = computeNetworkMetrics(nodes, edges);
  const response: LayoutResponse = { id, positions, metrics };
  // Plain JSON — no transferable buffers to hand off.
  (self as unknown as Worker).postMessage(response);
};

// Re-export types so the client wrapper can stay strongly typed without
// duplicating the protocol shape. They're erased at runtime — the
// `export {}` keeps this file a module so the `self.onmessage` write
// doesn't leak into the global module's surface.
export type { LayoutRequest, LayoutResponse };
