import { describe, it, expect } from "vitest";
import { getDataStatus } from "@/lib/types";
import { makeNode } from "./fixtures/graph-fixtures";
import type { LiveDataPoint } from "@/lib/types";

const livePoint = (kind: string): LiveDataPoint => ({
  kind,
  value: 1,
  capacity: 1,
  unit: "",
  observedAt: "2025-01-01T00:00:00.000Z",
  source: "test",
});

describe("getDataStatus — provenance derivation", () => {
  it("returns 'modeled' for a node with no liveData and no explicit dataStatus", () => {
    const node = makeNode({ id: "n1", label: "Plain node" });
    expect(getDataStatus(node)).toBe("modeled");
  });

  it("returns 'live' when at least one liveData entry is attached", () => {
    const node = makeNode({
      id: "n1",
      label: "Live-fed node",
      liveData: [livePoint("indicator")],
    });
    expect(getDataStatus(node)).toBe("live");
  });

  it("returns 'live' regardless of how many liveData entries are attached", () => {
    const node = makeNode({
      id: "n1",
      label: "Multi-feed node",
      liveData: [livePoint("throughput"), livePoint("sanctions")],
    });
    expect(getDataStatus(node)).toBe("live");
  });

  it("explicit 'blank-needs-data' overrides liveData absence", () => {
    const node = makeNode({
      id: "n1",
      label: "Category-C node",
      dataStatus: "blank-needs-data",
    });
    expect(getDataStatus(node)).toBe("blank-needs-data");
  });

  it("explicit 'modeled' overrides liveData presence (operator pin)", () => {
    // Edge case: data session decided this node's live signal is not
    // trustworthy and pinned it to modeled. The override sticks.
    const node = makeNode({
      id: "n1",
      label: "Pinned modeled",
      dataStatus: "modeled",
      liveData: [livePoint("indicator")],
    });
    expect(getDataStatus(node)).toBe("modeled");
  });

  it("explicit 'live' overrides empty liveData (operator pin)", () => {
    // Edge case: data session knows a feed will arrive shortly and wants
    // the node treated as live for downstream consumers.
    const node = makeNode({
      id: "n1",
      label: "Optimistic live",
      dataStatus: "live",
    });
    expect(getDataStatus(node)).toBe("live");
  });

  it("never returns 'blank-needs-data' from derivation alone", () => {
    // The Category-C label is exclusively explicit. Derivation never
    // assigns it — empty liveData maps to 'modeled'.
    for (const liveData of [undefined, [], [livePoint("x")]]) {
      const node = makeNode({ id: "n1", label: "X", liveData });
      expect(getDataStatus(node)).not.toBe("blank-needs-data");
    }
  });
});
