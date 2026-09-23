// @vitest-environment node
//
// End-to-end verification that selecting the AI Safety / IDS domain in
// the DomainSelector produces a renderable, non-empty graph.
//
// Catches the regression class where any of these silently breaks:
//   - DOMAIN_CARDS entry missing
//   - DOMAIN_MAP id → domain-string mapping mismatched
//   - graph-data.ts missing the ais_* nodes
//   - PROFILES_BY_DOMAIN_ID lookup mismatched
//   - cross-domain bridge edges severed by the useFilteredGraph filter

import { describe, it, expect } from "vitest";
import { buildGraphFromDomains } from "@/lib/build-domain-graph";
import { DOMAIN_MAP } from "@/lib/domains";
import { resolveDomainProfile } from "@/lib/domain-profiles";

describe("AI Safety / IDS — end-to-end domain render", () => {
  it("buildGraphFromDomains([ai-safety-ids]) returns the main graph including ais_* nodes", () => {
    const g = buildGraphFromDomains(["ai-safety-ids"]);
    const aisNodes = g.nodes.filter((n) => n.id.startsWith("ais_"));
    expect(aisNodes.length).toBe(17);
    expect(aisNodes.every((n) => n.domain === "AI Safety / IDS")).toBe(true);
  });

  it("DOMAIN_MAP['ai-safety-ids'] matches the actual domain string on the nodes", () => {
    const target = DOMAIN_MAP["ai-safety-ids"];
    expect(target).toEqual(["AI Safety / IDS"]);

    const g = buildGraphFromDomains(["ai-safety-ids"]);
    // Every domain string a node carries must be one the filter would keep.
    const aisNodeDomains = new Set(
      g.nodes.filter((n) => n.id.startsWith("ais_")).map((n) => n.domain),
    );
    for (const d of aisNodeDomains) {
      expect(target).toContain(d);
    }
  });

  it("resolveDomainProfile picks AI_SAFETY_PROFILE when ai-safety-ids is selected", () => {
    const p = resolveDomainProfile(["ai-safety-ids"]);
    expect(p.id).toBe("ai-safety");
    expect(p.displayName).toBe("AI Safety / Endogenous Catastrophe");
    // Pareto criticality strip = four time-series estimators only.
    // The dissertation's snapshot estimators (cvar-w1, chi-star) are
    // surfaced in SnapshotDiagnostics + canvas halos + the system-
    // metrics strip — see registry-profile-coverage's
    // EXEMPT_READY_ESTIMATORS for the rationale.
    expect(p.criticalityEstimators).toEqual(["csd", "ph", "lppls", "bocpd"]);
  });

  it("internal AI Safety edges all resolve when filtered to ai-safety-ids only", () => {
    const g = buildGraphFromDomains(["ai-safety-ids"]);
    const allowed = new Set(["AI Safety / IDS"]);
    const keptNodeIds = new Set(
      g.nodes.filter((n) => allowed.has(n.domain)).map((n) => n.id),
    );
    // Edges where BOTH endpoints survive filtering (mirrors useFilteredGraph).
    const internalAisEdges = g.edges.filter(
      (e) =>
        keptNodeIds.has(e.source) &&
        keptNodeIds.has(e.target) &&
        (e.source.startsWith("ais_") || e.target.startsWith("ais_")),
    );
    // PR #275 shipped 18 internal edges (9 containment + 3 training-input
    // + 6 architecture, including 2 temporal feedback loops).
    expect(internalAisEdges.length).toBe(18);
  });

  it("3 cross-domain edges from AI Safety target nodes that exist in the main graph (PR #276 invariant)", () => {
    const g = buildGraphFromDomains(["ai-safety-ids"]);
    const nodeIds = new Set(g.nodes.map((n) => n.id));

    // Both endpoints must exist for the bridge to be meaningful, even
    // though useFilteredGraph would strip these in a single-domain
    // selection (their target nodes live in different domains).
    const expected: [string, string][] = [
      ["ais_attack_ddos", "ic_telecom_egypt"],
      ["ais_attack_ddos", "ic_latency_risk"],
      ["ais_attack_mitm", "fc_cross_border_banking"],
    ];
    for (const [src, tgt] of expected) {
      expect(nodeIds.has(src), `source ${src} missing from main graph`).toBe(
        true,
      );
      expect(nodeIds.has(tgt), `target ${tgt} missing from main graph`).toBe(
        true,
      );
      const edge = g.edges.find(
        (e) => e.source === src && e.target === tgt,
      );
      expect(
        edge,
        `cross-domain edge ${src} → ${tgt} from PR #276 not found in MAIN_GRAPH`,
      ).toBeDefined();
    }
  });
});
