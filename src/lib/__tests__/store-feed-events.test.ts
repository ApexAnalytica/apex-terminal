import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";
import type { LiveDataPoint } from "@/lib/types";
import { makeNode, makeGraph, makeEdge } from "./fixtures/graph-fixtures";

const buildHormuzGraph = () =>
  makeGraph(
    [
      makeNode({ id: "hormuz", label: "Strait of Hormuz", domain: "Saudi Aramco Energy" }),
      makeNode({ id: "iran_node", label: "NIOC Iran Producer", domain: "Saudi Aramco Energy" }),
    ],
    [makeEdge({ id: "e1", source: "iran_node", target: "hormuz" })],
  );

const throughputPoint = (value: number, observedAt = "2025-01-01T00:00:00.000Z"): LiveDataPoint => ({
  kind: "throughput",
  value,
  capacity: 21,
  unit: "mb/d",
  observedAt,
  source: "EIA v2 / Persian Gulf producers (period 2025-01)",
});

const ofacJurisdictions = (programCount: number) => ({
  IR: { country: "Iran", programs: Array.from({ length: programCount }, (_, i) => `IRAN-${i}`), entryCount: 100 },
});

describe("applyHormuzLiveData → temporal events", () => {
  beforeEach(() => {
    useApexStore.setState({
      graphData: buildHormuzGraph(),
      truthFilter: "raw",
      enabledAxioms: new Set(),
    });
    // Seed temporalData with a minimal stub so appendFeedEvent has somewhere to write.
    useApexStore.setState({
      temporalData: {
        nodes: new Map(),
        edges: new Map(),
        events: [],
        rangeStart: new Date("2024-01-01"),
        rangeEnd: new Date("2025-12-31"),
      },
    });
  });

  it("appends a TemporalEvent on the first throughput reading", () => {
    useApexStore.getState().applyHormuzLiveData(throughputPoint(18.5));
    const events = useApexStore.getState().temporalData?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("eia-hormuz-2025-01-01T00:00:00.000Z");
    expect(events[0].label).toContain("Hormuz");
    expect(events[0].description).toContain("18.50 mb/d");
    expect(events[0].affectedNodeIds).toContain("hormuz");
    expect(events[0].severity).toBeCloseTo(18.5 / 21, 2);
  });

  it("does not duplicate the event for a repeated identical reading", () => {
    useApexStore.getState().applyHormuzLiveData(throughputPoint(18.5));
    useApexStore.getState().applyHormuzLiveData(throughputPoint(18.5));
    const events = useApexStore.getState().temporalData?.events ?? [];
    expect(events).toHaveLength(1);
  });

  it("emits a new event when the upstream period (observedAt) changes", () => {
    useApexStore.getState().applyHormuzLiveData(throughputPoint(18.5, "2025-01-01T00:00:00.000Z"));
    useApexStore.getState().applyHormuzLiveData(throughputPoint(19.2, "2025-02-01T00:00:00.000Z"));
    const events = useApexStore.getState().temporalData?.events ?? [];
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.id)).toContain("eia-hormuz-2025-02-01T00:00:00.000Z");
  });

  it("is a no-op when temporalData is null (graph not loaded yet)", () => {
    useApexStore.setState({ temporalData: null });
    useApexStore.getState().applyHormuzLiveData(throughputPoint(18.5));
    expect(useApexStore.getState().temporalData).toBeNull();
    // The liveData was still applied to the chokepoint node.
    const hormuz = useApexStore.getState().graphData.nodes.find((n) => n.id === "hormuz");
    expect(hormuz?.liveData?.[0].value).toBe(18.5);
  });
});

describe("applyOfacLiveData → temporal events", () => {
  beforeEach(() => {
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
  });

  it("appends a TemporalEvent listing matched nodes and program count", () => {
    useApexStore.getState().applyOfacLiveData(ofacJurisdictions(3), "2025-01-15T00:00:00.000Z", "OFAC SDN");
    const events = useApexStore.getState().temporalData?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("ofac-sdn-2025-01-15T00:00:00.000Z");
    expect(events[0].label).toContain("OFAC");
    expect(events[0].description).toContain("3 active programs");
    // "NIOC Iran Producer" matches via the "iran" keyword in label.
    expect(events[0].affectedNodeIds).toContain("iran_node");
  });

  it("does not duplicate the event for a repeated fetchedAt", () => {
    const at = "2025-01-15T00:00:00.000Z";
    useApexStore.getState().applyOfacLiveData(ofacJurisdictions(3), at, "OFAC SDN");
    useApexStore.getState().applyOfacLiveData(ofacJurisdictions(3), at, "OFAC SDN");
    expect(useApexStore.getState().temporalData?.events ?? []).toHaveLength(1);
  });

  it("is a no-op for events when no nodes match a sanctioned jurisdiction", () => {
    // Replace graph with non-sanctioned nodes only.
    useApexStore.setState({
      graphData: makeGraph(
        [makeNode({ id: "neutral", label: "Neutral Asset", domain: "Saudi Aramco Energy" })],
        [],
      ),
    });
    useApexStore.getState().applyOfacLiveData(ofacJurisdictions(3), "2025-01-15T00:00:00.000Z", "OFAC SDN");
    expect(useApexStore.getState().temporalData?.events ?? []).toHaveLength(0);
  });
});
