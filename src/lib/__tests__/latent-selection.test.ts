import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";

/**
 * The latent inspector rides a SEPARATE selection channel (selectedLatentId)
 * that must stay mutually exclusive with node + edge selection — otherwise a
 * latent overlay id could leak into the node-selection consumers.
 */
describe("latent selection channel (mutual exclusivity)", () => {
  beforeEach(() => {
    useApexStore.setState({
      selectedNode: null,
      selectedEdgeId: null,
      selectedLatentId: null,
    });
  });

  it("selecting a latent clears node + edge selection", () => {
    const s = useApexStore.getState();
    s.setSelectedNode("n1");
    s.setSelectedEdgeId("e1");
    useApexStore.getState().setSelectedLatentId("latent__x");
    const st = useApexStore.getState();
    expect(st.selectedLatentId).toBe("latent__x");
    expect(st.selectedNode).toBeNull();
    expect(st.selectedEdgeId).toBeNull();
  });

  it("selecting a real node clears the latent", () => {
    useApexStore.getState().setSelectedLatentId("latent__x");
    useApexStore.getState().setSelectedNode("n1");
    const st = useApexStore.getState();
    expect(st.selectedNode).toBe("n1");
    expect(st.selectedLatentId).toBeNull();
  });

  it("selecting an edge clears the latent", () => {
    useApexStore.getState().setSelectedLatentId("latent__x");
    useApexStore.getState().setSelectedEdgeId("e1");
    expect(useApexStore.getState().selectedLatentId).toBeNull();
  });

  it("clearing the latent (null) leaves node selection untouched", () => {
    useApexStore.getState().setSelectedNode("n1");
    useApexStore.getState().setSelectedLatentId(null);
    expect(useApexStore.getState().selectedNode).toBe("n1");
  });
});
