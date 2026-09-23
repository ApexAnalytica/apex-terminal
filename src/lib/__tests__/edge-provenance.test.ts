import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTHOR_SOURCE,
  EDGE_SOURCE_COLOR,
  EDGE_SOURCE_DESCRIPTION,
  EDGE_SOURCE_LABEL,
  hasProvenanceDetail,
  resolveEdgeAttributeSource,
} from "@/lib/edge-provenance";
import type {
  EdgeAttributeSource,
  EdgeAttributeSourceKind,
} from "@/lib/types";

describe("resolveEdgeAttributeSource", () => {
  it("returns the author default when the field is absent", () => {
    expect(resolveEdgeAttributeSource(undefined)).toEqual(
      DEFAULT_AUTHOR_SOURCE,
    );
    expect(resolveEdgeAttributeSource(undefined).kind).toBe("author");
  });

  it("passes through an explicit source unchanged", () => {
    const source: EdgeAttributeSource = {
      kind: "literature",
      citation: "NEJM 2024;391:1234",
    };
    expect(resolveEdgeAttributeSource(source)).toEqual(source);
  });

  it("returns the same frozen reference for the author default", () => {
    // Sharing one frozen sentinel keeps the GC pressure flat when
    // 348 edges all resolve to the same default at render time.
    const a = resolveEdgeAttributeSource(undefined);
    const b = resolveEdgeAttributeSource(undefined);
    expect(a).toBe(b);
  });

  it("does not let callers mutate the shared author default", () => {
    expect(() => {
      // @ts-expect-error — runtime guarantee, not a type guarantee
      DEFAULT_AUTHOR_SOURCE.kind = "literature";
    }).toThrow();
    expect(DEFAULT_AUTHOR_SOURCE.kind).toBe("author");
  });
});

describe("display tables", () => {
  const ALL_KINDS: EdgeAttributeSourceKind[] = [
    "author",
    "literature",
    "regression",
    "discovery",
    "tarski",
  ];

  it("covers every kind in label / color / description tables", () => {
    for (const kind of ALL_KINDS) {
      expect(EDGE_SOURCE_LABEL[kind]).toBeTruthy();
      expect(EDGE_SOURCE_COLOR[kind]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(EDGE_SOURCE_DESCRIPTION[kind]).toBeTruthy();
    }
  });

  it("uses distinct colors per kind so badges read distinctly", () => {
    const colors = ALL_KINDS.map((k) => EDGE_SOURCE_COLOR[k]);
    expect(new Set(colors).size).toBe(ALL_KINDS.length);
  });

  it("flags author as the not-yet-audited state in its description", () => {
    // The label is what tells the analyst this edge still needs work —
    // pin the language so a future polish pass doesn't accidentally
    // soften it and obscure the audit-pending signal.
    expect(EDGE_SOURCE_DESCRIPTION.author.toLowerCase()).toMatch(
      /audit|not.*validated/,
    );
  });
});

describe("hasProvenanceDetail", () => {
  it("false when no context fields are populated", () => {
    expect(hasProvenanceDetail({ kind: "author" })).toBe(false);
    expect(hasProvenanceDetail({ kind: "literature" })).toBe(false);
  });

  it("true when any context field is present", () => {
    expect(hasProvenanceDetail({ kind: "literature", citation: "x" })).toBe(
      true,
    );
    expect(hasProvenanceDetail({ kind: "discovery", estimator: "FCI" })).toBe(
      true,
    );
    expect(hasProvenanceDetail({ kind: "regression", rSquared: 0.81 })).toBe(
      true,
    );
    expect(hasProvenanceDetail({ kind: "author", note: "needs audit" })).toBe(
      true,
    );
  });

  it("treats rSquared 0 as a populated value (it's a real fit, just bad)", () => {
    // rSquared = 0 still means "we ran a regression and recorded the
    // result." A near-zero fit is itself a finding — surface it.
    expect(hasProvenanceDetail({ kind: "regression", rSquared: 0 })).toBe(
      true,
    );
  });

  it("empty string counts as no detail (avoids '' badges)", () => {
    // Hand-authored data sometimes ships citation:"" as a placeholder;
    // we don't want an empty badge row in the inspector for that case.
    expect(hasProvenanceDetail({ kind: "literature", citation: "" })).toBe(
      false,
    );
  });
});
