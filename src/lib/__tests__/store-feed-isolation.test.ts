import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";
import { makeNode, makeGraph, makeEdge } from "./fixtures/graph-fixtures";
import type { FeedDispatchBatch } from "@/lib/feeds/providers/types";
import type { LiveDataPoint } from "@/lib/types";

const indicator = (
  value: number,
  source: string,
  observedAt = "2025-04-01T00:00:00.000Z",
): LiveDataPoint => ({
  kind: "indicator",
  value,
  capacity: 100,
  unit: "%",
  observedAt,
  source,
});

const seedGraph = () => {
  useApexStore.setState({
    graphData: makeGraph(
      [
        makeNode({ id: "fed_funds", label: "Fed Funds Effective Rate", domain: "Macro" }),
        makeNode({ id: "currency_contagion", label: "Currency Contagion Channel", domain: "Macro" }),
        makeNode({ id: "neutral", label: "Neutral asset", domain: "Macro" }),
      ],
      [makeEdge({ id: "e1", source: "fed_funds", target: "currency_contagion" })],
    ),
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

describe("applyFeedBatch — cross-provider isolation (regression for indicator clobber bug)", () => {
  beforeEach(() => seedGraph());

  it("provider A's tick does not clobber provider B's signal on a different node", () => {
    // FRED-like provider writes indicator to fed_funds
    const fredBatch: FeedDispatchBatch = {
      providerId: "fred",
      signalKinds: ["indicator"],
      updates: [
        {
          nodeId: "fed_funds",
          point: indicator(5.25, "FRED · DFF (period 2025-04)"),
        },
      ],
    };
    useApexStore.getState().applyFeedBatch(fredBatch);

    // Derivations-like provider writes indicator to currency_contagion only
    // (does NOT match fed_funds). Before the fix, this batch's cleanup
    // would have dropped fred's indicator from fed_funds.
    const derivationsBatch: FeedDispatchBatch = {
      providerId: "derivations",
      signalKinds: ["indicator"],
      updates: [
        {
          nodeId: "currency_contagion",
          point: indicator(63, "Derived · mean EM FX stress"),
        },
      ],
    };
    useApexStore.getState().applyFeedBatch(derivationsBatch);

    const fed = useApexStore.getState().graphData.nodes.find((n) => n.id === "fed_funds")!;
    const cc = useApexStore.getState().graphData.nodes.find((n) => n.id === "currency_contagion")!;

    // FRED's signal must still be on fed_funds
    expect(fed.liveData?.length).toBe(1);
    expect(fed.liveData![0].kind).toBe("indicator");
    expect(fed.liveData![0].value).toBe(5.25);
    expect(fed.liveData![0].providerId).toBe("fred");

    // Derivations' signal lives on currency_contagion
    expect(cc.liveData?.length).toBe(1);
    expect(cc.liveData![0].providerId).toBe("derivations");
    expect(cc.liveData![0].value).toBe(63);
  });

  it("provider re-tick replaces only its own signal of that kind", () => {
    useApexStore.getState().applyFeedBatch({
      providerId: "fred",
      signalKinds: ["indicator"],
      updates: [{ nodeId: "fed_funds", point: indicator(5.25, "FRED · DFF (period 2025-03)") }],
    });
    useApexStore.getState().applyFeedBatch({
      providerId: "fred",
      signalKinds: ["indicator"],
      updates: [{ nodeId: "fed_funds", point: indicator(5.5, "FRED · DFF (period 2025-04)", "2025-04-15T00:00:00.000Z") }],
    });

    const fed = useApexStore.getState().graphData.nodes.find((n) => n.id === "fed_funds")!;
    expect(fed.liveData?.length).toBe(1);
    expect(fed.liveData![0].value).toBe(5.5);
    // History accumulates the previous value
    expect(fed.liveData![0].history).toBeDefined();
    expect(fed.liveData![0].history!.length).toBe(1);
    expect(fed.liveData![0].history![0].value).toBe(5.25);
  });

  it("provider A's empty cleanup does not drop provider B's signal even on the same node", () => {
    // Both providers write to fed_funds but with different kinds.
    useApexStore.getState().applyFeedBatch({
      providerId: "fred",
      signalKinds: ["indicator"],
      updates: [{ nodeId: "fed_funds", point: indicator(5.25, "FRED · DFF") }],
    });
    useApexStore.getState().applyFeedBatch({
      providerId: "openfda",
      signalKinds: ["events"],
      updates: [
        {
          nodeId: "fed_funds",
          point: { ...indicator(7, "OpenFDA mock"), kind: "events" },
        },
      ],
    });

    // OpenFDA's empty-cleanup-elsewhere-batch shouldn't touch fred's indicator.
    useApexStore.getState().applyFeedBatch({
      providerId: "openfda",
      signalKinds: ["events"],
      updates: [], // hit nothing this tick
    });

    const fed = useApexStore.getState().graphData.nodes.find((n) => n.id === "fed_funds")!;
    // FRED's indicator survives. OpenFDA's events was dropped (provider's own).
    const indicatorSignal = fed.liveData?.find((p) => p.kind === "indicator");
    const eventsSignal = fed.liveData?.find((p) => p.kind === "events");
    expect(indicatorSignal).toBeDefined();
    expect(indicatorSignal!.value).toBe(5.25);
    expect(eventsSignal).toBeUndefined();
  });
});
