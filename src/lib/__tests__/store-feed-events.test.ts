import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";
import { eiaHormuzProvider } from "@/lib/feeds/providers/eia-hormuz";
import { ofacSdnProvider } from "@/lib/feeds/providers/ofac-sdn";
import type { EiaHormuzFeed } from "@/lib/feeds/eia-hormuz";
import type { OfacSdnFeed } from "@/lib/feeds/ofac-sdn";
import { makeNode, makeGraph, makeEdge } from "./fixtures/graph-fixtures";

const buildHormuzGraph = () =>
  makeGraph(
    [
      makeNode({ id: "hormuz", label: "Strait of Hormuz", domain: "Saudi Aramco Energy" }),
      makeNode({ id: "iran_node", label: "NIOC Iran Producer", domain: "Saudi Aramco Energy" }),
    ],
    [makeEdge({ id: "e1", source: "iran_node", target: "hormuz" })],
  );

const eiaPayload = (
  value: number,
  observedAt = "2025-01-01T00:00:00.000Z",
): EiaHormuzFeed => ({
  kind: "throughput",
  value,
  capacity: 21,
  unit: "mb/d",
  observedAt,
  source: "EIA v2 / Persian Gulf producers (period 2025-01)",
  breakdown: [],
});

const ofacPayload = (programCount: number, fetchedAt = "2025-01-15T00:00:00.000Z"): OfacSdnFeed => ({
  jurisdictions: {
    IR: {
      country: "Iran",
      programs: Array.from({ length: programCount }, (_, i) => `IRAN-${i}`),
      entryCount: 100,
    },
  },
  totalEntries: 100,
  fetchedAt,
  source: "OFAC SDN",
});

const seedStoreWithGraph = () => {
  useApexStore.setState({
    graphData: buildHormuzGraph(),
    truthFilter: "raw",
    enabledAxioms: new Set(),
    temporalData: {
      nodes: new Map(),
      edges: new Map(),
      events: [],
      rangeStart: new Date("2024-01-01"),
      rangeEnd: new Date("2025-12-31"),
    },
  });
};

describe("applyFeedBatch — EIA throughput", () => {
  beforeEach(() => seedStoreWithGraph());

  it("upserts liveData on chokepoint nodes and emits a TemporalEvent", () => {
    const nodes = useApexStore.getState().graphData.nodes;
    const batch = eiaHormuzProvider.matchPayload(eiaPayload(18.5), nodes);
    useApexStore.getState().applyFeedBatch(batch);

    const hormuz = useApexStore.getState().graphData.nodes.find((n) => n.id === "hormuz");
    expect(hormuz?.liveData?.[0].kind).toBe("throughput");
    expect(hormuz?.liveData?.[0].value).toBe(18.5);

    const events = useApexStore.getState().temporalData?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("eia-hormuz-2025-01-01T00:00:00.000Z");
    expect(events[0].description).toContain("18.50 mb/d");
    expect(events[0].affectedNodeIds).toContain("hormuz");
  });

  it("dedupes the event and short-circuits on identical re-fetch", () => {
    const nodes = useApexStore.getState().graphData.nodes;
    const batch = eiaHormuzProvider.matchPayload(eiaPayload(18.5), nodes);
    useApexStore.getState().applyFeedBatch(batch);
    useApexStore.getState().applyFeedBatch(batch);
    expect(useApexStore.getState().temporalData?.events ?? []).toHaveLength(1);
  });

  it("emits a new event when the upstream period changes", () => {
    const a = eiaHormuzProvider.matchPayload(eiaPayload(18.5, "2025-01-01T00:00:00.000Z"), useApexStore.getState().graphData.nodes);
    useApexStore.getState().applyFeedBatch(a);
    const b = eiaHormuzProvider.matchPayload(eiaPayload(19.2, "2025-02-01T00:00:00.000Z"), useApexStore.getState().graphData.nodes);
    useApexStore.getState().applyFeedBatch(b);
    expect(useApexStore.getState().temporalData?.events ?? []).toHaveLength(2);
  });

  it("is a no-op for events when temporalData is null (graph not loaded yet)", () => {
    useApexStore.setState({ temporalData: null });
    const batch = eiaHormuzProvider.matchPayload(eiaPayload(18.5), useApexStore.getState().graphData.nodes);
    useApexStore.getState().applyFeedBatch(batch);
    expect(useApexStore.getState().temporalData).toBeNull();
    const hormuz = useApexStore.getState().graphData.nodes.find((n) => n.id === "hormuz");
    expect(hormuz?.liveData?.[0].value).toBe(18.5);
  });
});

describe("applyFeedBatch — OFAC sanctions", () => {
  beforeEach(() => seedStoreWithGraph());

  it("attaches a sanctions signal to nodes whose jurisdiction matches", () => {
    const nodes = useApexStore.getState().graphData.nodes;
    const batch = ofacSdnProvider.matchPayload(ofacPayload(3), nodes);
    useApexStore.getState().applyFeedBatch(batch);

    const events = useApexStore.getState().temporalData?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("ofac-sdn-2025-01-15T00:00:00.000Z");
    expect(events[0].description).toContain("3 active programs");
    // "NIOC Iran Producer" matches via the "iran" keyword in label.
    expect(events[0].affectedNodeIds).toContain("iran_node");

    const iran = useApexStore.getState().graphData.nodes.find((n) => n.id === "iran_node");
    expect(iran?.liveData?.find((p) => p.kind === "sanctions")?.value).toBe(3);
  });

  it("dedupes the event for a repeated identical fetchedAt", () => {
    const at = "2025-01-15T00:00:00.000Z";
    const a = ofacSdnProvider.matchPayload(ofacPayload(3, at), useApexStore.getState().graphData.nodes);
    useApexStore.getState().applyFeedBatch(a);
    useApexStore.getState().applyFeedBatch(a);
    expect(useApexStore.getState().temporalData?.events ?? []).toHaveLength(1);
  });

  it("emits no event when no nodes match a sanctioned jurisdiction", () => {
    useApexStore.setState({
      graphData: makeGraph(
        [makeNode({ id: "neutral", label: "Neutral Asset", domain: "Saudi Aramco Energy" })],
        [],
      ),
    });
    const batch = ofacSdnProvider.matchPayload(ofacPayload(3), useApexStore.getState().graphData.nodes);
    useApexStore.getState().applyFeedBatch(batch);
    expect(useApexStore.getState().temporalData?.events ?? []).toHaveLength(0);
  });

  it("drops a stale sanctions signal when the node no longer matches", () => {
    // First tick: Iran has 3 programs; iran_node gets a sanctions signal.
    let batch = ofacSdnProvider.matchPayload(ofacPayload(3), useApexStore.getState().graphData.nodes);
    useApexStore.getState().applyFeedBatch(batch);
    const before = useApexStore.getState().graphData.nodes.find((n) => n.id === "iran_node");
    expect(before?.liveData?.some((p) => p.kind === "sanctions")).toBe(true);

    // Second tick: Iran has zero programs; iran_node no longer matches → signal lifts.
    batch = ofacSdnProvider.matchPayload(
      { ...ofacPayload(0, "2025-02-01T00:00:00.000Z"), jurisdictions: {} },
      useApexStore.getState().graphData.nodes,
    );
    useApexStore.getState().applyFeedBatch(batch);
    const after = useApexStore.getState().graphData.nodes.find((n) => n.id === "iran_node");
    expect(after?.liveData?.some((p) => p.kind === "sanctions")).toBe(false);
  });
});

describe("FeedProvider.matchPayload", () => {
  it("EIA: emits one update per chokepoint node", () => {
    const nodes = [
      makeNode({ id: "a", label: "Strait of Hormuz" }),
      makeNode({ id: "b", label: "Some Other Asset" }),
      makeNode({ id: "c", label: "Generic Chokepoint" }),
    ];
    const batch = eiaHormuzProvider.matchPayload(eiaPayload(18.5), nodes);
    expect(batch.providerId).toBe("eia-hormuz");
    expect(batch.signalKinds).toEqual(["throughput"]);
    expect(batch.updates.map((u) => u.nodeId).sort()).toEqual(["a", "c"]);
    expect(batch.event?.affectedNodeIds.sort()).toEqual(["a", "c"]);
  });

  it("OFAC: emits one update per node whose jurisdiction is in payload", () => {
    const nodes = [
      makeNode({ id: "iran1", label: "NIOC Iran Producer" }),
      makeNode({ id: "venezuela1", label: "PDVSA Venezuela Refinery" }),
      makeNode({ id: "neutral", label: "Generic Asset" }),
    ];
    const batch = ofacSdnProvider.matchPayload(ofacPayload(3), nodes);
    expect(batch.providerId).toBe("ofac-sdn");
    expect(batch.signalKinds).toEqual(["sanctions"]);
    // Only Iran is in the mock payload — Venezuela not present.
    expect(batch.updates.map((u) => u.nodeId)).toEqual(["iran1"]);
  });

  it("emits batch with empty updates and no event when no nodes match", () => {
    const batch = eiaHormuzProvider.matchPayload(eiaPayload(18.5), [
      makeNode({ id: "x", label: "Unrelated Asset" }),
    ]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
    expect(batch.signalKinds).toEqual(["throughput"]);
  });
});
