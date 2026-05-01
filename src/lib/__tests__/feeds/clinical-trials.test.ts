import { describe, it, expect } from "vitest";
import {
  CLINICAL_TRIALS_QUERIES,
  buildClinicalTrialsUrl,
  mockClinicalTrialsFeed,
  parseClinicalTrialsResponse,
} from "@/lib/feeds/clinical-trials";
import { clinicalTrialsProvider } from "@/lib/feeds/providers/clinical-trials";
import { makeNode } from "../fixtures/graph-fixtures";

describe("buildClinicalTrialsUrl", () => {
  it("builds a CT v2 URL with countTotal + status field", () => {
    const cfg = CLINICAL_TRIALS_QUERIES.find((q) => q.id === "teplizumab")!;
    const url = buildClinicalTrialsUrl(cfg);
    expect(url).toContain("clinicaltrials.gov/api/v2/studies");
    expect(url).toContain("query.term=teplizumab");
    expect(url).toContain("countTotal=true");
    expect(url).toContain("statusModule.overallStatus");
  });
});

describe("parseClinicalTrialsResponse", () => {
  const cfg = CLINICAL_TRIALS_QUERIES.find((q) => q.id === "teplizumab")!;

  it("parses totalCount + recruiting subset", () => {
    const raw = {
      totalCount: 18,
      studies: [
        { protocolSection: { statusModule: { overallStatus: "RECRUITING" } } },
        { protocolSection: { statusModule: { overallStatus: "RECRUITING" } } },
        { protocolSection: { statusModule: { overallStatus: "COMPLETED" } } },
      ],
    };
    const obs = parseClinicalTrialsResponse(raw, cfg);
    expect(obs).not.toBeNull();
    expect(obs!.value).toBe(18);
    expect(obs!.recruitingCount).toBe(2);
    expect(obs!.source).toContain("2 recruiting / 18 total");
  });

  it("returns null when totalCount is missing", () => {
    expect(parseClinicalTrialsResponse({}, cfg)).toBeNull();
    expect(parseClinicalTrialsResponse({ totalCount: "x" }, cfg)).toBeNull();
  });

  it("counts recruiting as 0 when studies array is missing", () => {
    const obs = parseClinicalTrialsResponse({ totalCount: 5 }, cfg);
    expect(obs!.recruitingCount).toBe(0);
  });
});

describe("mockClinicalTrialsFeed", () => {
  it("emits one observation per registered query, all tagged (mock)", () => {
    const feed = mockClinicalTrialsFeed();
    expect(feed.observations).toHaveLength(CLINICAL_TRIALS_QUERIES.length);
    for (const obs of feed.observations) {
      expect(obs.source).toContain("(mock");
    }
  });
});

describe("clinicalTrialsProvider.matchPayload", () => {
  it("attaches an indicator signal to drug nodes whose label matches", () => {
    const nodes = [
      makeNode({ id: "tep", label: "Teplizumab (anti-CD3)" }),
      makeNode({ id: "vx", label: "VX-880 Infusion Dose (cells/kg)" }),
      makeNode({ id: "neutral", label: "Other" }),
    ];
    const feed = mockClinicalTrialsFeed();
    const batch = clinicalTrialsProvider.matchPayload(feed, nodes);

    expect(batch.providerId).toBe("clinical-trials");
    const matchedIds = batch.updates.map((u) => u.nodeId).sort();
    expect(matchedIds).toContain("tep");
    expect(matchedIds).toContain("vx");
    expect(matchedIds).not.toContain("neutral");
  });

  it("emits no event when no nodes match", () => {
    const feed = mockClinicalTrialsFeed();
    const batch = clinicalTrialsProvider.matchPayload(feed, [makeNode({ id: "x", label: "Generic" })]);
    expect(batch.updates).toHaveLength(0);
    expect(batch.event).toBeUndefined();
  });
});
