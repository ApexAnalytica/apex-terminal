import { describe, it, expect } from "vitest";
import { buildGraphFromDomains } from "@/lib/build-domain-graph";
import { weightedComposite } from "@/lib/omega-weighting";
import { AI_SAFETY_PROFILE } from "@/lib/domain-profiles";

// End-to-end through the REAL function the store calls when a domain is
// selected (useApexStore → buildGraphFromDomains(domainIds)). Both cards
// below resolve to the same `main` dataset (domains.ts), so they load the
// identical node set — the ONLY difference is the active profile's weighting.
// This is the integration point where the AI-Safety skew has to become
// visible (the card has no nodes of its own; it overlays `main`).

function meanComposite(nodes: { omegaFragility: { composite: number } }[]): number {
  return nodes.reduce((s, n) => s + n.omegaFragility.composite, 0) / Math.max(1, nodes.length);
}

describe("buildGraphFromDomains × profile weighting (integration)", () => {
  const geo = buildGraphFromDomains(["energy-systems"]); // GEOPOLITICAL, authored
  const ai = buildGraphFromDomains(["ai-safety-ids"]); // AI_SAFETY, recomputed (same `main` nodes)

  it("loads the same node set for both (ai-safety overlays the main graph)", () => {
    expect(ai.nodes.length).toBe(geo.nodes.length);
    expect(ai.nodes.length).toBeGreaterThan(0);
    expect(new Set(ai.nodes.map((n) => n.id))).toEqual(new Set(geo.nodes.map((n) => n.id)));
  });

  it("geopolitical (authored) leaves composites untouched — no baseline stamped", () => {
    for (const n of geo.nodes) {
      expect(n.omegaFragility.baselineComposite).toBeUndefined();
    }
  });

  it("ai-safety recomputes every composite from pillars × AI weights, preserving the authored baseline", () => {
    const geoById = new Map(geo.nodes.map((n) => [n.id, n.omegaFragility.composite]));
    for (const n of ai.nodes) {
      const o = n.omegaFragility;
      expect(o.composite).toBe(weightedComposite(o, AI_SAFETY_PROFILE.weights));
      // baseline === the authored (geopolitical-weighted) score for the same node
      expect(o.baselineComposite).toBe(geoById.get(n.id));
    }
  });

  it("the skew is actually visible — many node scores shift and the CDΩ mean moves", () => {
    const geoById = new Map(geo.nodes.map((n) => [n.id, n.omegaFragility.composite]));
    const shifted = ai.nodes.filter(
      (n) => n.omegaFragility.composite !== geoById.get(n.id),
    ).length;
    // The cascade+tail skew should move a substantial fraction of nodes.
    expect(shifted).toBeGreaterThan(ai.nodes.length * 0.25);
    // CDΩ header proxy (mean composite) should differ between the two profiles.
    expect(meanComposite(ai.nodes)).not.toBe(meanComposite(geo.nodes));
  });
});
