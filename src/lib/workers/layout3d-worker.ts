/**
 * Layout Web Worker — handles both the 3D force-directed layout
 * (`computeLayout3D` + `computeNetworkMetrics`) and the 2D force-
 * directed layout (`compute2DForceLayout` + `computeNetworkMetrics`).
 *
 * Both layouts run pure-data computes (no DOM, no React) so they're
 * perfect worker fodder. Bundling each layout's metrics into the same
 * response avoids a second postMessage roundtrip when the canvas
 * needs both to start rendering.
 *
 * Message kinds:
 *   - "layout3d" → { positions: NodePosition[], metrics }
 *   - "layout2d" → { positions2d: Map<id, Position2D>, metrics }
 *
 * Caller-side cancellation lives in the client wrapper
 * (`layout-client.ts`); the worker itself just answers every request.
 */
import {
  computeLayout3D,
  computeNetworkMetrics,
  type NodePosition,
  type NodeMetrics,
} from "@/lib/graph-layout";
import { compute2DForceLayout, type Position2D } from "@/lib/graph-layout-2d";
import type { CausalNode, CausalEdge } from "@/lib/types";

interface BaseRequest {
  id: number;
  nodes: CausalNode[];
  edges: CausalEdge[];
}
interface Layout3DRequest extends BaseRequest {
  kind: "layout3d";
  prev?: NodePosition[];
}
interface Layout2DRequest extends BaseRequest {
  kind: "layout2d";
}
type LayoutRequest = Layout3DRequest | Layout2DRequest;

interface Layout3DResponse {
  id: number;
  kind: "layout3d";
  positions: NodePosition[];
  metrics: Record<string, NodeMetrics>;
}
interface Layout2DResponse {
  id: number;
  kind: "layout2d";
  positions2d: Map<string, Position2D>;
  metrics: Record<string, NodeMetrics>;
}
type LayoutResponse = Layout3DResponse | Layout2DResponse;

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const req = e.data;
  const metrics = computeNetworkMetrics(req.nodes, req.edges);
  let response: LayoutResponse;
  if (req.kind === "layout3d") {
    response = {
      id: req.id,
      kind: "layout3d",
      positions: computeLayout3D(req.nodes, req.edges, req.prev),
      metrics,
    };
  } else {
    response = {
      id: req.id,
      kind: "layout2d",
      positions2d: compute2DForceLayout(req.nodes, req.edges),
      metrics,
    };
  }
  (self as unknown as Worker).postMessage(response);
};

export type { LayoutRequest, LayoutResponse, Layout3DResponse, Layout2DResponse };
