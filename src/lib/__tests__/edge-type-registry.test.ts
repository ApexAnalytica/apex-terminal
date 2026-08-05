import { describe, it, expect, afterEach } from "vitest";
import type { EdgeType } from "@/lib/types";
import {
  getEdgeTypeMeta,
  resolveEdgeTypeMeta,
  registerEdgeType,
  getAllEdgeTypeMeta,
  getBuiltinEdgeTypeMeta,
  __clearCustomEdgeTypes,
  type EdgeTypeMeta,
} from "@/lib/edge-type-registry";

// The four built-in types and their canonical encoding. These values are the
// single source of truth the four canvas surfaces (2D / 3D / Map) and the
// EdgeInspector all read from — locking them here is what prevents the drift
// that previously let a `flow` edge render teal on canvas yet show DIRECTED in
// the inspector. If a value changes intentionally, this table changes with it.
const EXPECTED: Record<EdgeType, Omit<EdgeTypeMeta, "type" | "description">> = {
  directed: {
    color: "#00e5ff",
    label: "DIRECTED",
    dashed: false,
    arrow: true,
    animated: false,
    animationCadence: "none",
  },
  temporal: {
    color: "#ffab00",
    label: "TEMPORAL",
    dashed: false,
    arrow: true,
    animated: true,
    animationCadence: "standard",
  },
  confounded: {
    color: "#ff6d00",
    label: "CONFOUNDED",
    dashed: true,
    arrow: false,
    animated: false,
    animationCadence: "none",
  },
  flow: {
    color: "#1de9b6",
    label: "FLOW",
    dashed: false,
    arrow: true,
    animated: true,
    animationCadence: "fast",
  },
};

describe("edge-type-registry — built-ins", () => {
  afterEach(() => __clearCustomEdgeTypes());

  it("exposes exactly the four built-in types, keyed by the EdgeType union", () => {
    const builtins = getBuiltinEdgeTypeMeta();
    expect(builtins).toHaveLength(4);
    expect(builtins.map((m) => m.type)).toEqual([
      "directed",
      "temporal",
      "confounded",
      "flow",
    ]);
  });

  it.each(Object.keys(EXPECTED) as EdgeType[])(
    "encodes %s with its canonical color/label/dashed/arrow/animation",
    (type) => {
      const meta = getEdgeTypeMeta(type);
      expect(meta.type).toBe(type);
      expect(meta.color).toBe(EXPECTED[type].color);
      expect(meta.label).toBe(EXPECTED[type].label);
      expect(meta.dashed).toBe(EXPECTED[type].dashed);
      expect(meta.arrow).toBe(EXPECTED[type].arrow);
      expect(meta.animated).toBe(EXPECTED[type].animated);
      expect(meta.animationCadence).toBe(EXPECTED[type].animationCadence);
      // Every type carries a one-line semantic description.
      expect(meta.description.length).toBeGreaterThan(0);
    }
  );

  it("flow is teal and confounded is the only dash-without-arrow type", () => {
    // Pin the two encodings that previously drifted / are semantically load-
    // bearing: flow's teal (the bug that motivated this registry) and the
    // confounder's no-direction dashed look (latent common cause).
    expect(getEdgeTypeMeta("flow").color).toBe("#1de9b6");
    const dashed = getBuiltinEdgeTypeMeta().filter((m) => m.dashed);
    expect(dashed.map((m) => m.type)).toEqual(["confounded"]);
    const noArrow = getBuiltinEdgeTypeMeta().filter((m) => !m.arrow);
    expect(noArrow.map((m) => m.type)).toEqual(["confounded"]);
  });
});

describe("edge-type-registry — resolveEdgeTypeMeta (loose accessor)", () => {
  afterEach(() => __clearCustomEdgeTypes());

  it("resolves a built-in type string to its built-in meta", () => {
    expect(resolveEdgeTypeMeta("flow")).toBe(getEdgeTypeMeta("flow"));
  });

  it("degrades an unrecognised type to the neutral UNKNOWN default (never throws)", () => {
    const meta = resolveEdgeTypeMeta("metabolic-not-yet-registered");
    expect(meta.type).toBe("unknown");
    expect(meta.label).toBe("UNKNOWN");
    expect(meta.color).toBe("#5a5e72");
  });
});

describe("edge-type-registry — registerEdgeType (forward-compat hook)", () => {
  afterEach(() => __clearCustomEdgeTypes());

  const metabolic: EdgeTypeMeta = {
    type: "metabolic",
    color: "#c51162",
    label: "METABOLIC",
    description: "Domain-declared T1D metabolic coupling.",
    dashed: false,
    arrow: true,
    animated: false,
    animationCadence: "none",
  };

  it("round-trips a runtime-registered custom type through resolveEdgeTypeMeta", () => {
    expect(resolveEdgeTypeMeta("metabolic").type).toBe("unknown"); // before
    registerEdgeType(metabolic);
    expect(resolveEdgeTypeMeta("metabolic")).toEqual(metabolic); // after
  });

  it("includes customs in getAllEdgeTypeMeta but not in getBuiltinEdgeTypeMeta", () => {
    registerEdgeType(metabolic);
    expect(getAllEdgeTypeMeta().map((m) => m.type)).toContain("metabolic");
    expect(getBuiltinEdgeTypeMeta().map((m) => m.type)).not.toContain(
      "metabolic"
    );
    // Built-ins stay exactly four regardless of custom registrations.
    expect(getBuiltinEdgeTypeMeta()).toHaveLength(4);
  });

  it("throws when a custom key collides with a built-in (no silent shadowing)", () => {
    expect(() =>
      registerEdgeType({ ...metabolic, type: "flow" })
    ).toThrowError(/collides with a built-in/);
    // The built-in flow is untouched by the rejected registration.
    expect(getEdgeTypeMeta("flow").color).toBe("#1de9b6");
  });

  it("__clearCustomEdgeTypes drops all runtime registrations", () => {
    registerEdgeType(metabolic);
    expect(resolveEdgeTypeMeta("metabolic").type).toBe("metabolic");
    __clearCustomEdgeTypes();
    expect(resolveEdgeTypeMeta("metabolic").type).toBe("unknown");
  });
});
