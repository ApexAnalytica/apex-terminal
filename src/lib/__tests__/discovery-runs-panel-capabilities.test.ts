import { describe, it, expect } from "vitest";
import { CAPABILITY_BY_ALGORITHM } from "@/components/DiscoveryRunsPanel";
import { listAlgorithms } from "@/lib/discovery/algorithm-registry";

// ─── CAPABILITY_BY_ALGORITHM ↔ registry invariant ─────────────────────
//
// The DiscoveryRunsPanel renders a "live" badge on each discovery-run
// row based on a hardcoded map. Calibration algorithms (BOCPD / CSD)
// register through a separate channel and are NOT in the discovery
// registry's `listAlgorithms()` list, so they're allowed in the map
// without a corresponding registry entry. Every other entry must be
// either (a) one of the calibration ids, or (b) a registered discovery
// algorithm.
//
// Reverse: every registered discovery algorithm gets a badge entry.
// This catches drift when a new algorithm lands (NOTEARS-MLP was added
// in v0.1, and this test would have caught the missing capability
// mapping on that PR).

const CALIBRATION_IDS = new Set([
  "bocpd-hypo-calibration",
  "csd-fit-hypo-calibration",
]);

describe("DiscoveryRunsPanel CAPABILITY_BY_ALGORITHM", () => {
  it("covers every registered discovery algorithm", () => {
    const registered = listAlgorithms().map((a) => a.id);
    for (const id of registered) {
      expect(
        CAPABILITY_BY_ALGORITHM[id],
        `algorithm '${id}' is registered but missing from CAPABILITY_BY_ALGORITHM`,
      ).toBeDefined();
    }
  });

  it("every entry is either a registered algorithm or a known calibration id", () => {
    const registered = new Set(listAlgorithms().map((a) => a.id));
    for (const id of Object.keys(CAPABILITY_BY_ALGORITHM)) {
      const ok = registered.has(id) || CALIBRATION_IDS.has(id);
      expect(
        ok,
        `CAPABILITY_BY_ALGORITHM entry '${id}' is neither registered nor a known calibration id`,
      ).toBe(true);
    }
  });
});
