import { describe, expect, it } from "vitest";

import {
  BUILTIN_EDGE_TYPE_IDS,
  getAllEdgeTypeMeta,
  getEdgeTypeMeta,
  isEdgeTypeRegistered,
  registerEdgeType,
  type EdgeTypeMeta,
} from "@/lib/edge-type-registry";

/**
 * The edge-type registry is the single source of truth for how every
 * canvas surface (3D / 2D / Map), the EdgeInspector, the per-type toggle
 * strip, and the legend PRESENT an edge type. These tests lock:
 *   - the four built-ins exist with their exact canonical canvas hues
 *     (a color regression here would silently desync the surfaces), and
 *   - the never-throw fallback + runtime-extension contract that lets a
 *     domain register a brand-new type without renderer edits.
 *
 * Vitest gives each test file its own module instance, so the
 * `registerEdgeType` mutations below don't leak into other suites.
 */
describe("edge-type-registry: built-ins", () => {
  it("ships the four built-in types", () => {
    expect([...BUILTIN_EDGE_TYPE_IDS].sort()).toEqual(
      ["confounded", "directed", "flow", "temporal"].sort(),
    );
    for (const id of BUILTIN_EDGE_TYPE_IDS) {
      expect(isEdgeTypeRegistered(id)).toBe(true);
    }
  });

  // Canonical canvas hues — a regression test locks these exact values so
  // a future edit can't silently shift a color on one surface.
  it("locks the canonical canvas colors", () => {
    expect(getEdgeTypeMeta("directed").color).toBe("#00e5ff");
    expect(getEdgeTypeMeta("temporal").color).toBe("#ffab00");
    expect(getEdgeTypeMeta("confounded").color).toBe("#ff6d00");
    expect(getEdgeTypeMeta("flow").color).toBe("#1de9b6");
  });

  it("dashes only the confounded type", () => {
    expect(getEdgeTypeMeta("confounded").dashed).toBe(true);
    expect(getEdgeTypeMeta("directed").dashed).toBe(false);
    expect(getEdgeTypeMeta("temporal").dashed).toBe(false);
    expect(getEdgeTypeMeta("flow").dashed).toBe(false);
  });

  it("animates only the temporal + flow types at rest", () => {
    expect(getEdgeTypeMeta("temporal").animated).toBe(true);
    expect(getEdgeTypeMeta("flow").animated).toBe(true);
    expect(getEdgeTypeMeta("directed").animated).toBe(false);
    expect(getEdgeTypeMeta("confounded").animated).toBe(false);
  });

  it("arrows every directional type except confounded", () => {
    expect(getEdgeTypeMeta("directed").arrow).toBe(true);
    expect(getEdgeTypeMeta("temporal").arrow).toBe(true);
    expect(getEdgeTypeMeta("flow").arrow).toBe(true);
    expect(getEdgeTypeMeta("confounded").arrow).toBe(false);
  });

  it("uppercases the inspector label and ships a non-empty description", () => {
    for (const id of BUILTIN_EDGE_TYPE_IDS) {
      const meta = getEdgeTypeMeta(id);
      expect(meta.label).toBe(meta.label.toUpperCase());
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("lists all built-ins via getAllEdgeTypeMeta in registration order", () => {
    const ids = getAllEdgeTypeMeta().map((m) => m.id);
    expect(ids.slice(0, 4)).toEqual([
      "directed",
      "temporal",
      "confounded",
      "flow",
    ]);
  });
});

describe("edge-type-registry: unknown-type fallback", () => {
  it("never throws — returns a neutral slate fallback for an unknown id", () => {
    const meta = getEdgeTypeMeta("nonexistent-domain-type");
    expect(meta.color).toBe("#42466a");
    expect(meta.id).toBe("nonexistent-domain-type");
    expect(meta.label).toBe("NONEXISTENT-DOMAIN-TYPE");
    expect(meta.arrow).toBe(true);
    expect(meta.dashed).toBe(false);
    expect(meta.animated).toBe(false);
  });

  it("reports an unknown id as not registered", () => {
    expect(isEdgeTypeRegistered("nonexistent-domain-type")).toBe(false);
  });

  it("degrades an empty type id without crashing", () => {
    const meta = getEdgeTypeMeta("");
    expect(meta.label).toBe("UNKNOWN");
    expect(meta.color).toBe("#42466a");
  });
});

describe("edge-type-registry: runtime registration", () => {
  const domainType: EdgeTypeMeta = {
    id: "metabolic",
    label: "METABOLIC",
    chipLabel: "METAB",
    color: "#7c4dff",
    dashed: false,
    animated: true,
    arrow: true,
    description: "T1D metabolic coupling between physiological signals.",
  };

  it("adds a domain type that then resolves + appears in the full list", () => {
    expect(isEdgeTypeRegistered("metabolic")).toBe(false);
    registerEdgeType(domainType);

    expect(isEdgeTypeRegistered("metabolic")).toBe(true);
    expect(getEdgeTypeMeta("metabolic")).toEqual(domainType);
    expect(getAllEdgeTypeMeta().map((m) => m.id)).toContain("metabolic");
    // Built-ins stay first; the domain type appends after them.
    expect(getAllEdgeTypeMeta().length).toBeGreaterThanOrEqual(5);
  });

  it("throws on a duplicate id so a domain can't clobber an existing type", () => {
    // metabolic was registered by the previous test in this file.
    expect(() => registerEdgeType(domainType)).toThrow(/already registered/);
  });

  it("throws when a domain tries to override a built-in", () => {
    expect(() =>
      registerEdgeType({ ...domainType, id: "directed" }),
    ).toThrow(/already registered/);
  });
});
