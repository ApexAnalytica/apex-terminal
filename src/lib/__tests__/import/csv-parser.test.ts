import { describe, it, expect } from "vitest";
import { parseCSV } from "@/lib/import/parsers/csv-parser";
import {
  NODE_CSV,
  EDGE_CSV,
  ALIASED_HEADER_CSV,
  QUOTED_FIELDS_CSV,
  EDGE_CSV_WITH_FROM_TO,
  EMPTY_CSV,
  HEADER_ONLY_CSV,
  CSV_WITH_BOOLEANS,
} from "../fixtures/csv-samples";

describe("parseCSV", () => {
  it("parses a node CSV with standard headers", () => {
    const result = parseCSV(NODE_CSV);
    expect(result.format).toBe("csv");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].id).toBe("n1");
    expect(result.nodes[0].label).toBe("Node Alpha");
    expect(result.nodes[0].category).toBe("manufacturing");
  });

  it("hoists omega sub-fields into omegaFragility object", () => {
    const result = parseCSV(NODE_CSV);
    const n = result.nodes[0];
    expect(n.omegaFragility).toBeDefined();
    expect(n.omegaFragility!.composite).toBe(8.5);
    expect(n.omegaFragility!.irreplaceability).toBe(7.0);
    expect(n.omegaFragility!.cascadeLoad).toBe(9.0);
  });

  it("parses an edge CSV detecting source/target columns", () => {
    const result = parseCSV(EDGE_CSV);
    expect(result.edges).toHaveLength(2);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges[0].source).toBe("n1");
    expect(result.edges[0].target).toBe("n2");
    expect(result.edges[0].weight).toBe(0.8);
  });

  it("resolves aliased headers (node_id→id, name→label, omega→composite)", () => {
    const result = parseCSV(ALIASED_HEADER_CSV);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe("x1");
    expect(result.nodes[0].label).toBe("X Node");
    expect(result.nodes[0].omegaFragility!.composite).toBe(9.0);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const result = parseCSV(QUOTED_FIELDS_CSV);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].label).toBe("Node with, comma");
    expect(result.nodes[1].label).toBe('Node with "quotes"');
  });

  it("resolves from→source and to→target aliases in edge files", () => {
    const result = parseCSV(EDGE_CSV_WITH_FROM_TO);
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].source).toBe("a");
    expect(result.edges[0].target).toBe("b");
    expect(result.edges[1].type).toBe("temporal");
  });

  it("returns empty data with warning for header-only CSV", () => {
    const result = parseCSV(HEADER_ONLY_CSV);
    expect(result.nodes).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("no data"))).toBe(true);
  });

  it("coerces boolean values in CSV", () => {
    const result = parseCSV(CSV_WITH_BOOLEANS);
    expect(result.nodes[0].isConfounded).toBe(true);
    expect(result.nodes[0].isRestricted).toBe(false);
    expect(result.nodes[1].isConfounded).toBe(false);
    expect(result.nodes[1].isRestricted).toBe(true);
  });

  it("handles empty data rows after header", () => {
    const result = parseCSV(EMPTY_CSV);
    expect(result.nodes).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns about unmapped columns", () => {
    const csv = `id,label,custom_field\nn1,Alpha,foo`;
    const result = parseCSV(csv);
    expect(result.warnings.some((w) => w.includes("Unmapped"))).toBe(true);
  });
});
