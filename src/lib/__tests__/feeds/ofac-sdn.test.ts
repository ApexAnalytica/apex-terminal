import { describe, it, expect } from "vitest";
import {
  mockOfacSdnFeed,
  parseOfacSdnCsv,
  programToCountry,
  OFAC_SDN_URL,
} from "@/lib/feeds/ofac-sdn";

describe("OFAC_SDN_URL", () => {
  it("points at Treasury's canonical pipe-delimited SDN download", () => {
    expect(OFAC_SDN_URL).toContain("treasury.gov");
    expect(OFAC_SDN_URL.endsWith("sdn.csv")).toBe(true);
  });
});

describe("programToCountry", () => {
  it("maps direct program tokens to ISO-2 codes", () => {
    expect(programToCountry("IRAN")).toEqual({ code: "IR", country: "Iran" });
    expect(programToCountry("RUSSIA-EO14024")).toEqual({ code: "RU", country: "Russia" });
    expect(programToCountry("DPRK")).toEqual({ code: "KP", country: "North Korea" });
    expect(programToCountry("BELARUS-EO14038")).toEqual({ code: "BY", country: "Belarus" });
  });

  it("returns null for non-jurisdictional programs (terrorism, cyber, NPWMD)", () => {
    expect(programToCountry("SDGT")).toBeNull();
    expect(programToCountry("CYBER")).toBeNull();
    expect(programToCountry("NPWMD")).toBeNull();
    expect(programToCountry("CYBER2")).toBeNull();
  });

  it("matches case-insensitively and trims", () => {
    expect(programToCountry("  iran  ")).toEqual({ code: "IR", country: "Iran" });
    expect(programToCountry("russia-eo14024")).toEqual({ code: "RU", country: "Russia" });
  });

  it("treats Ukraine-related EOs as Russia (per OFAC convention)", () => {
    expect(programToCountry("UKRAINE-EO13662")).toEqual({ code: "RU", country: "Russia" });
  });
});

describe("parseOfacSdnCsv", () => {
  it("counts entries per jurisdiction and dedupes programs", () => {
    const csv = [
      `1| "Org A" |entity|"IRAN; IRAN-EO13599"|||||||||`,
      `2| "Org B" |entity|"IRAN"|||||||||`,
      `3| "Org C" |entity|"RUSSIA-EO14024"|||||||||`,
      `4| "Org D" |entity|"SDGT"|||||||||`, // generic — should be ignored
      `5| "Org E" |entity|"CUBA"|||||||||`,
    ].join("\n");

    const feed = parseOfacSdnCsv(csv);
    expect(feed.jurisdictions.IR.entryCount).toBe(2);
    expect(feed.jurisdictions.IR.programs).toContain("IRAN");
    expect(feed.jurisdictions.IR.programs).toContain("IRAN-EO13599");
    expect(feed.jurisdictions.RU.entryCount).toBe(1);
    expect(feed.jurisdictions.CU.entryCount).toBe(1);
    expect(feed.jurisdictions.SDGT).toBeUndefined();
    expect(feed.totalEntries).toBe(5); // all rows that had ANY program counted
  });

  it("does not double-count an entry with two programs in the same jurisdiction", () => {
    const csv = `1| "Org A" |entity|"IRAN; IRAN-EO13599; IRAN-EO13902"|||||||||`;
    const feed = parseOfacSdnCsv(csv);
    expect(feed.jurisdictions.IR.entryCount).toBe(1);
    expect(feed.jurisdictions.IR.programs).toHaveLength(3);
  });

  it("counts an entry with multiple jurisdictions once per jurisdiction", () => {
    const csv = `1| "Org A" |entity|"IRAN; RUSSIA-EO14024"|||||||||`;
    const feed = parseOfacSdnCsv(csv);
    expect(feed.jurisdictions.IR.entryCount).toBe(1);
    expect(feed.jurisdictions.RU.entryCount).toBe(1);
  });

  it("handles empty/malformed rows without crashing", () => {
    const csv = ["", "1|", "|||", `2| "Org" |entity|"IRAN"|||||||||`].join("\n");
    const feed = parseOfacSdnCsv(csv);
    expect(feed.jurisdictions.IR.entryCount).toBe(1);
  });
});

describe("mockOfacSdnFeed", () => {
  it("includes the major sanctioned jurisdictions and is tagged (mock)", () => {
    const feed = mockOfacSdnFeed();
    expect(feed.jurisdictions.IR).toBeDefined();
    expect(feed.jurisdictions.RU).toBeDefined();
    expect(feed.jurisdictions.KP).toBeDefined();
    expect(feed.totalEntries).toBeGreaterThan(0);
    expect(feed.source).toContain("mock");
  });
});
