import { describe, it, expect } from "vitest";
import { deriveVisibleNodeIds } from "@/components/TimeSeriesOverlay";

describe("TimeSeriesOverlay — deriveVisibleNodeIds", () => {
  it("returns empty when nothing is selected or pinned", () => {
    expect(deriveVisibleNodeIds(null, [], [])).toEqual([]);
  });

  it("shows the single-selected node when nothing is pinned", () => {
    expect(deriveVisibleNodeIds("a", [], [])).toEqual(["a"]);
  });

  it("shows multi-select nodes alongside the single-select focus", () => {
    expect(deriveVisibleNodeIds("a", ["b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("dedupes when single-select is also in multi-select", () => {
    expect(deriveVisibleNodeIds("a", ["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("keeps manual pins visible when nothing is selected", () => {
    expect(deriveVisibleNodeIds(null, [], ["x", "y"])).toEqual(["x", "y"]);
  });

  it("orders selection before manual pins", () => {
    expect(deriveVisibleNodeIds("a", ["b"], ["x", "y"])).toEqual([
      "a",
      "b",
      "x",
      "y",
    ]);
  });

  it("dedupes when a selected node is also manually pinned", () => {
    // Pinned node stays visible after deselection — no duplicate row while
    // it's both selected and pinned.
    expect(deriveVisibleNodeIds("x", [], ["x", "y"])).toEqual(["x", "y"]);
  });

  it("preserves the user-supplied order of manual pins", () => {
    // Pin order is the order the user pinned in; selection-prefix doesn't
    // reorder the rest.
    expect(deriveVisibleNodeIds(null, [], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("handles a deselected user with surviving multi-select", () => {
    // setSelectedNode(null) clears the single focus; multi-select rows
    // (e.g. shift+drag set) should still drive the chart.
    expect(deriveVisibleNodeIds(null, ["b", "c"], [])).toEqual(["b", "c"]);
  });
});
