/**
 * Feed provider interface for the live-data registry. A provider declares:
 *   - where its server-side proxy route lives (`endpoint`)
 *   - how often the client should poll (`pollIntervalMs`)
 *   - which `liveData.kind`s it produces (so the store can clean up stale
 *     signals when a node no longer matches)
 *   - how to map a fetched payload to per-node `LiveDataPoint` updates
 *     (`matchPayload`)
 *   - optional event metadata for the TimeDial
 *
 * Adding a new provider: create one file under `src/lib/feeds/providers/`,
 * implement `FeedProvider`, and add the export to `src/lib/feeds/registry.ts`.
 * Adding a new node to live coverage of an existing provider: extend that
 * provider's `matchPayload` to recognise the node.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";

export interface FeedDispatchEvent {
  /** Stable id used to dedupe TemporalEvent entries on the dial. */
  id: string;
  /** Display label, e.g. "EIA · Hormuz throughput refresh". */
  label: string;
  /** Longer human-readable description for hover. */
  description: string;
  /** ISO timestamp the upstream observation was made. */
  observedAt: string;
  /** 0..1 severity bar on the dial marker. */
  severity: number;
  /** Nodes touched by this batch — surfaces the marker on those nodes. */
  affectedNodeIds: string[];
}

export interface FeedDispatchBatch {
  /** Provider that produced this batch — written through to the dispatch event. */
  providerId: string;
  /** Kinds this batch is authoritative for. Nodes carrying any of these
   *  kinds but absent from `updates` will have those kinds dropped. */
  signalKinds: string[];
  /** Per-node updates — at most one entry per nodeId. */
  updates: Array<{ nodeId: string; point: LiveDataPoint }>;
  /** Optional event for the TimeDial. Omit to skip event emission. */
  event?: FeedDispatchEvent;
}

export interface FeedProvider<TPayload = unknown> {
  /** Stable provider id (e.g. "eia-hormuz", "ofac-sdn"). */
  id: string;
  /** Display label (e.g. "EIA · Hormuz throughput"). */
  label: string;
  /** Server-side proxy endpoint the client polls. */
  endpoint: string;
  /** Polling cadence in ms. The server proxy holds its own cache TTL. */
  pollIntervalMs: number;
  /**
   * Map a fetched payload to per-node updates plus optional dial-event
   * metadata. Receives the *current* graph nodes — provider matching is
   * usually a string heuristic over node fields (label / domain /
   * globalConcentration / physicalConstraint).
   *
   * Returning an empty `updates` array is fine and means "nothing matched";
   * the store will still drop any stale `signalKinds` from previously-
   * matching nodes.
   */
  matchPayload(
    payload: TPayload,
    nodes: ReadonlyArray<CausalNode>,
  ): FeedDispatchBatch;
}
