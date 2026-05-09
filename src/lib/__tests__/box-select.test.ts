import { describe, it, expect } from "vitest";
import {
  isTinyDrag,
  nodesInsideRect,
  MIN_DRAG_PX,
  type ProjectedNode,
} from "@/lib/box-select";

describe("isTinyDrag", () => {
  it("treats a zero-size rect as tiny (click-equivalent)", () => {
    expect(isTinyDrag({ x1: 100, y1: 100, x2: 100, y2: 100 })).toBe(true);
  });

  it("treats a 4×4 px rect as tiny", () => {
    expect(isTinyDrag({ x1: 0, y1: 0, x2: 4, y2: 4 })).toBe(true);
  });

  it(`treats a ${MIN_DRAG_PX}×0 rect as not-tiny`, () => {
    // Exactly MIN_DRAG_PX in width should clear the threshold even when
    // the height collapses to zero — matches the 3D handler.
    expect(isTinyDrag({ x1: 0, y1: 50, x2: MIN_DRAG_PX, y2: 50 })).toBe(false);
  });

  it("normalizes flipped corners (drag from bottom-right to top-left)", () => {
    expect(isTinyDrag({ x1: 200, y1: 200, x2: 0, y2: 0 })).toBe(false);
  });

  it("respects an override threshold", () => {
    expect(isTinyDrag({ x1: 0, y1: 0, x2: 10, y2: 10 }, 20)).toBe(true);
    expect(isTinyDrag({ x1: 0, y1: 0, x2: 30, y2: 30 }, 20)).toBe(false);
  });
});

describe("nodesInsideRect", () => {
  const nodes: ProjectedNode[] = [
    { id: "a", screenX: 50, screenY: 50 },
    { id: "b", screenX: 150, screenY: 150 },
    { id: "c", screenX: 250, screenY: 250 },
    { id: "d", screenX: 100, screenY: 200 },
  ];

  it("returns ids of nodes inside the rect", () => {
    const ids = nodesInsideRect(
      { x1: 0, y1: 0, x2: 200, y2: 200 },
      nodes,
    );
    expect(ids.sort()).toEqual(["a", "b", "d"].sort());
  });

  it("includes nodes on the edge of the rect (inclusive bounds)", () => {
    // Catching boundary nodes matches user expectation: "everything I
    // dragged the box around" — exclusive bounds drop nodes the user
    // visibly framed.
    const ids = nodesInsideRect(
      { x1: 50, y1: 50, x2: 150, y2: 150 },
      nodes,
    );
    expect(ids.sort()).toEqual(["a", "b"].sort());
  });

  it("returns empty for a rect that misses every node", () => {
    // Empty array is the contract that lets `setSelectedNodes(ids)` clear
    // a stale multi-selection — see the regression in the map handler.
    const ids = nodesInsideRect({ x1: 500, y1: 500, x2: 600, y2: 600 }, nodes);
    expect(ids).toEqual([]);
  });

  it("normalizes flipped corner drags", () => {
    // Drag from bottom-right to top-left should hit the same nodes as
    // the equivalent top-left to bottom-right drag.
    const forward = nodesInsideRect(
      { x1: 0, y1: 0, x2: 200, y2: 200 },
      nodes,
    );
    const backward = nodesInsideRect(
      { x1: 200, y1: 200, x2: 0, y2: 0 },
      nodes,
    );
    expect(backward.sort()).toEqual(forward.sort());
  });

  it("returns empty for an empty node list", () => {
    expect(
      nodesInsideRect({ x1: 0, y1: 0, x2: 100, y2: 100 }, []),
    ).toEqual([]);
  });
});
