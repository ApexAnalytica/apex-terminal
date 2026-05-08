import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";

// Per-test reset of the two fields we care about. The store is a
// module-level singleton in zustand; without resetting the previous
// test's state would bleed into ours.
function resetSelection() {
  useApexStore.setState({ selectedNode: null, expandedPillar: null });
}

describe("expandedPillar store integration", () => {
  beforeEach(resetSelection);

  it("starts as null", () => {
    expect(useApexStore.getState().expandedPillar).toBeNull();
  });

  it("setExpandedPillar updates the field", () => {
    useApexStore.getState().setExpandedPillar("irreplaceability");
    expect(useApexStore.getState().expandedPillar).toBe("irreplaceability");
  });

  it("changes to selectedNode reset expandedPillar to null", () => {
    // Simulate the tour state machine: user selects node A, expands the
    // I pillar, then clicks node B. The explanation card should not
    // carry over from A — it would read against the previous node's
    // ΩF values.
    useApexStore.getState().setSelectedNode("node-a");
    useApexStore.getState().setExpandedPillar("cascadeLoad");
    expect(useApexStore.getState().expandedPillar).toBe("cascadeLoad");

    useApexStore.getState().setSelectedNode("node-b");
    expect(useApexStore.getState().expandedPillar).toBeNull();
  });

  it("setting selectedNode to its current value preserves expandedPillar", () => {
    // Re-clicking the same node (a no-op selection) should NOT reset
    // the explanation card — annoying flicker when the user just
    // clicks the inspector empty area or a re-render fires the same id.
    useApexStore.getState().setSelectedNode("node-a");
    useApexStore.getState().setExpandedPillar("tailDepth");
    useApexStore.getState().setSelectedNode("node-a");
    expect(useApexStore.getState().expandedPillar).toBe("tailDepth");
  });

  it("setSelectedNode(null) resets expandedPillar (deselection)", () => {
    useApexStore.getState().setSelectedNode("node-a");
    useApexStore.getState().setExpandedPillar("restorationLatency");
    useApexStore.getState().setSelectedNode(null);
    expect(useApexStore.getState().expandedPillar).toBeNull();
  });
});
