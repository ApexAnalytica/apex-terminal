/**
 * Screen-space box-select hit testing — shared by 3D and MAP shift+drag
 * handlers. Pure function so each surface can compute its own projected
 * coordinates (Three.js camera, MapLibre `project`) and forward the same
 * intersection logic.
 */

export interface ScreenRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ProjectedNode {
  id: string;
  screenX: number;
  screenY: number;
}

/**
 * Minimum drag distance (px) before a shift+drag counts as a box-select.
 * Anything smaller is treated as a click-equivalent and leaves the existing
 * selection alone.
 */
export const MIN_DRAG_PX = 5;

export function isTinyDrag(rect: ScreenRect, threshold = MIN_DRAG_PX): boolean {
  const w = Math.abs(rect.x2 - rect.x1);
  const h = Math.abs(rect.y2 - rect.y1);
  return w < threshold && h < threshold;
}

/**
 * Return the ids of all projected nodes whose screen position falls inside
 * the rectangle. Rectangle corners may be supplied in any order — the
 * helper normalizes to (min, max) before testing.
 */
export function nodesInsideRect(
  rect: ScreenRect,
  nodes: readonly ProjectedNode[],
): string[] {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);
  const ids: string[] = [];
  for (const node of nodes) {
    if (
      node.screenX >= minX &&
      node.screenX <= maxX &&
      node.screenY >= minY &&
      node.screenY <= maxY
    ) {
      ids.push(node.id);
    }
  }
  return ids;
}
