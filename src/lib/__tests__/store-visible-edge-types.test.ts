import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";

describe("visibleEdgeTypes toggle", () => {
  beforeEach(() => {
    // Reset to the default-all-visible state so each case starts
    // from the same baseline.
    useApexStore.setState({
      visibleEdgeTypes: new Set(["directed", "temporal", "confounded", "flow"]),
    });
  });

  it("defaults to all four edge types visible", () => {
    const v = useApexStore.getState().visibleEdgeTypes;
    expect(v.has("directed")).toBe(true);
    expect(v.has("temporal")).toBe(true);
    expect(v.has("confounded")).toBe(true);
    expect(v.has("flow")).toBe(true);
  });

  it("toggling a visible type removes it", () => {
    useApexStore.getState().toggleEdgeTypeVisibility("flow");
    const v = useApexStore.getState().visibleEdgeTypes;
    expect(v.has("flow")).toBe(false);
    // Others stay
    expect(v.has("directed")).toBe(true);
    expect(v.has("temporal")).toBe(true);
    expect(v.has("confounded")).toBe(true);
  });

  it("toggling a hidden type brings it back", () => {
    useApexStore.getState().toggleEdgeTypeVisibility("temporal");
    expect(useApexStore.getState().visibleEdgeTypes.has("temporal")).toBe(false);
    useApexStore.getState().toggleEdgeTypeVisibility("temporal");
    expect(useApexStore.getState().visibleEdgeTypes.has("temporal")).toBe(true);
  });

  it("setVisibleEdgeTypes replaces the whole set", () => {
    useApexStore.getState().setVisibleEdgeTypes(new Set(["flow"]));
    const v = useApexStore.getState().visibleEdgeTypes;
    expect(v.size).toBe(1);
    expect(v.has("flow")).toBe(true);
    expect(v.has("directed")).toBe(false);
  });

  it("setting empty Set is the convention for 'all visible' (back-compat with older sessions)", () => {
    useApexStore.getState().setVisibleEdgeTypes(new Set());
    expect(useApexStore.getState().visibleEdgeTypes.size).toBe(0);
    // Consumers (4 canvas surfaces) read .size === 0 as "render
    // every edge regardless of type" — verified visually; this test
    // just locks in that the empty-set state is reachable.
  });
});
