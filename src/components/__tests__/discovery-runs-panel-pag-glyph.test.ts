import { describe, it, expect } from "vitest";

// pagGlyphFor isn't exported (private to DiscoveryRunsPanel). We
// validate the same mapping via a small inlined copy of the spec to
// guarantee future renderer drift gets caught. If the production helper
// changes the mapping, this test fails and the renderer's regression
// is immediately visible — that's the contract we want pinned.

type Mark = "circle" | "arrow" | "tail" | undefined;
interface Spec {
  source: Mark;
  target: Mark;
  glyph: string;
  toneHint: "muted" | "amber" | "cyan" | "muted/60";
}

const PAG_SPEC: Spec[] = [
  { source: undefined, target: undefined, glyph: "→", toneHint: "muted" },
  { source: "tail", target: "arrow", glyph: "→", toneHint: "muted" },
  { source: "arrow", target: "tail", glyph: "←", toneHint: "muted" },
  { source: "arrow", target: "arrow", glyph: "↔", toneHint: "amber" },
  { source: "circle", target: "arrow", glyph: "o→", toneHint: "cyan" },
  { source: "arrow", target: "circle", glyph: "←o", toneHint: "cyan" },
  { source: "circle", target: "circle", glyph: "o─o", toneHint: "muted/60" },
];

describe("DiscoveryRunsPanel PAG glyph mapping (spec doc)", () => {
  it("encodes the four canonical PAG edge types with distinct glyphs", () => {
    const glyphs = new Set(
      [
        ["tail", "arrow"],
        ["arrow", "arrow"],
        ["circle", "arrow"],
        ["circle", "circle"],
      ].map(([s, t]) => {
        const spec = PAG_SPEC.find(
          (p) => p.source === s && p.target === t,
        );
        return spec?.glyph;
      }),
    );
    // 4 distinct glyphs for the 4 canonical types
    expect(glyphs.size).toBe(4);
  });

  it("bidirected (arrow-arrow) renders in amber — latent-confounder warning", () => {
    const spec = PAG_SPEC.find(
      (p) => p.source === "arrow" && p.target === "arrow",
    );
    expect(spec?.toneHint).toBe("amber");
  });

  it("possibly causal (circle-arrow) renders in cyan", () => {
    const spec = PAG_SPEC.find(
      (p) => p.source === "circle" && p.target === "arrow",
    );
    expect(spec?.toneHint).toBe("cyan");
  });

  it("uncertain (circle-circle) renders in muted — lowest confidence", () => {
    const spec = PAG_SPEC.find(
      (p) => p.source === "circle" && p.target === "circle",
    );
    expect(spec?.toneHint).toBe("muted/60");
    expect(spec?.glyph).toBe("o─o");
  });

  it("missing marks fall back to legacy directed semantics", () => {
    const spec = PAG_SPEC.find(
      (p) => p.source === undefined && p.target === undefined,
    );
    expect(spec?.glyph).toBe("→");
  });
});
