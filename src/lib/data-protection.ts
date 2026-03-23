/**
 * Data Protection — prevents casual extraction of graph data via DevTools console.
 * Deep-freezes graph objects and overrides toString/toJSON on sensitive structures.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const REDACTED = "[APEX PROPRIETARY — ACCESS RESTRICTED]";

function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const val = (obj as any)[prop];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  });
  return obj;
}

/**
 * Call once at app init to protect graph data objects from console inspection.
 */
export function protectGraphData(
  ...graphs: Array<{ nodes: any[]; edges: any[] }>
): void {
  if (typeof window === "undefined") return;
  // Only protect in production
  if (process.env.NODE_ENV !== "production") return;

  for (const graph of graphs) {
    // Override toString on each node and edge
    for (const item of [...graph.nodes, ...graph.edges]) {
      if (item && typeof item === "object") {
        Object.defineProperty(item, Symbol.toPrimitive, {
          value: () => REDACTED,
          enumerable: false,
          configurable: false,
        });
      }
    }

    // Deep freeze the graph
    try {
      deepFreeze(graph);
    } catch {
      // Some objects may already be frozen
    }
  }

  // Disable console.log from dumping full objects in production
  const origLog = console.log;
  console.log = (...args: any[]) => {
    const sanitized = args.map((a) => {
      if (a && typeof a === "object" && ("nodes" in a || "edges" in a)) {
        return REDACTED;
      }
      return a;
    });
    origLog.apply(console, sanitized);
  };
}
