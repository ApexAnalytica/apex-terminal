/**
 * Data Protection — prevents casual extraction of graph data via DevTools console.
 * Deep-freezes graph objects and overrides toString/toJSON on sensitive structures.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const REDACTED = "[APEX PROPRIETARY — ACCESS RESTRICTED]";
const PROTECTED_FLAG = Symbol.for("apex.protected");

let consoleLogPatched = false;

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
 *
 * Idempotent: safe to call multiple times on the same graph (e.g. after a
 * component remount). Skips work on graphs that are already protected and
 * never re-defines the Symbol.toPrimitive trap, which would throw because
 * the original definition is non-configurable.
 */
export function protectGraphData(
  ...graphs: Array<{ nodes: any[]; edges: any[] }>
): void {
  if (typeof window === "undefined") return;
  // Only protect in production
  if (process.env.NODE_ENV !== "production") return;

  for (const graph of graphs) {
    // Skip graphs we've already protected (re-mounts, fast refresh, etc.)
    if ((graph as any)[PROTECTED_FLAG]) continue;

    // Override toString on each node and edge
    for (const item of [...graph.nodes, ...graph.edges]) {
      if (item && typeof item === "object") {
        // Defensive: skip items that already have the trap installed.
        const existing = Object.getOwnPropertyDescriptor(item, Symbol.toPrimitive);
        if (existing) continue;
        try {
          Object.defineProperty(item, Symbol.toPrimitive, {
            value: () => REDACTED,
            enumerable: false,
            configurable: false,
          });
        } catch {
          // Frozen or sealed — nothing to do.
        }
      }
    }

    // Deep freeze the graph
    try {
      deepFreeze(graph);
    } catch {
      // Some objects may already be frozen
    }

    // Mark as protected so subsequent calls short-circuit.
    try {
      Object.defineProperty(graph, PROTECTED_FLAG, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    } catch {
      // Object is already frozen — that's fine, the flag is just a fast path.
    }
  }

  // Disable console.log from dumping full objects in production (once).
  if (!consoleLogPatched) {
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
    consoleLogPatched = true;
  }
}
