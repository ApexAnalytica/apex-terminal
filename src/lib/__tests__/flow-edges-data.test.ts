import { describe, it, expect } from "vitest";
import { MAIN_GRAPH } from "@/lib/graph-data";

// ─── Flow-edge data-integrity guard ──────────────────────────────
// `type: "flow"` is a CUSTOMER-FACING semantic claim: "physical
// material is actually moving along this edge" (Tier 1 — crude, gas,
// LPG, ammonia/urea/DAP product, ore). Mis-tagging a causal or
// price-signal edge as flow misrepresents the graph, so the curated
// set is locked here. If you intentionally add/remove a flow edge,
// update these expectations *and* re-confirm the material-transport
// semantics — don't just bump the count to make the test pass.
//
// Curation: 42 intra-system material-transport edges across Aramco
// crude/gas, Qatar LNG/GTL, QAFCO fertilizer chain, and Ma'aden
// phosphate, plus one cross-domain gas-supply edge
// (sa_master_gas_system → mn_natural_gas_feedstock_system).
describe("flow-edge data integrity", () => {
  const flowEdges = MAIN_GRAPH.edges.filter((e) => e.type === "flow");

  it("contains exactly the 42 curated Tier-1 material-transport edges", () => {
    expect(flowEdges.length).toBe(42);
  });

  it("every flow edge documents a physical transport mechanism", () => {
    for (const e of flowEdges) {
      expect(
        e.physicalMechanism && e.physicalMechanism.trim().length > 0,
        `flow edge ${e.id} is missing a physicalMechanism`,
      ).toBeTruthy();
    }
  });

  it("flow edges only connect physical-asset nodes, never abstract index nodes", () => {
    // Material flow moves between physical assets (sa_/qe_/qf_/mn_/si_
    // prefixes). It must never terminate at a price/macro index node
    // (sc_ = science/synthetic index, ip_ = index/price), which are
    // causal-signal targets, not places stuff physically arrives.
    const PHYSICAL_PREFIXES = ["sa_", "qe_", "qf_", "mn_", "si_"];
    const isPhysical = (id: string) =>
      PHYSICAL_PREFIXES.some((p) => id.startsWith(p));
    for (const e of flowEdges) {
      expect(
        isPhysical(e.source),
        `flow edge ${e.id} has non-physical source ${e.source}`,
      ).toBe(true);
      expect(
        isPhysical(e.target),
        `flow edge ${e.id} has non-physical target ${e.target}`,
      ).toBe(true);
    }
  });

  it("includes representative Tier-1 transport edges", () => {
    const ids = new Set(flowEdges.map((e) => e.id));
    // Crude pipeline, gas backbone injection, LNG export train, the
    // urea product chain, phosphate ore haul, and the one sanctioned
    // cross-domain gas-supply edge.
    const expectedIncluded = [
      "sa_east_west_pipeline__sa_yanbu_refinery",
      "sa_fadhili_gas_plant__sa_master_gas_system_mgs",
      "qe_export_trains__qe_ras_laffan_port",
      "qf_qafco_ammonia_product__qf_qafco_urea_product",
      "mn_hazm_al_jalamid_phosphate_mine__mn_ras_al_khair_phosphate_hub",
      "sa_master_gas_system__mn_natural_gas_feedstock_system",
    ];
    for (const id of expectedIncluded) {
      expect(ids.has(id), `expected ${id} to be a flow edge`).toBe(true);
    }
  });

  it("excludes capacity, membership, competition, and price-signal edges", () => {
    const ids = new Set(flowEdges.map((e) => e.id));
    // These were deliberately NOT tagged flow: capacity/capex relations,
    // membership-into-business-entity edges, a gas-allocation competition
    // edge, and edges terminating at price indices. Tagging any of these
    // as flow would assert material movement where there is none.
    const expectedExcluded = [
      "qf_qafco_complex__qf_qafco7_blue_ammonia",
      "qf_qafco7_blue_ammonia__qf_qafco_ammonia_product",
      "mn_bangladesh_agricultural_development_corp__mn_ma_aden_phosphate_business",
      "mn_phosphogypsum_stacks_recycling_complex__mn_ma_aden_phosphate_business",
      "mn_industrial_water_pipeline_system__mn_phosphate_3_mega_project",
      "mn_phosphate_3_mega_project__mn_ma_aden_phosphate_business",
      "mn_ras_al_khair_dap_plant__sc_fertilizer_price_index",
      "qe_barzan__qf_qatar_energy_feedstock",
      "sa_ras_tanura_terminal__ip_cpi_energy",
      "qe_ras_laffan_port__ip_ppi_energy",
    ];
    for (const id of expectedExcluded) {
      expect(ids.has(id), `${id} must NOT be tagged flow`).toBe(false);
    }
  });
});
