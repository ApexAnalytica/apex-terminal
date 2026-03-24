/**
 * Geographic coordinate mapping for causal graph nodes.
 * Resolves node location from: node ID → globalConcentration → domain → fallback.
 * Coordinates are [longitude, latitude].
 */

type LngLat = [number, number];

// ─── Specific node overrides (real-world known locations) ────────
const NODE_COORDINATES: Record<string, LngLat> = {
  // Saudi Aramco Energy — real infrastructure locations
  sa_east_west_pipeline: [42.5, 24.5],       // crosses Saudi Arabia E-W
  sa_ras_tanura_refinery: [50.17, 26.64],     // Ras Tanura
  sa_yanbu_refinery: [38.06, 24.09],          // Yanbu
  sa_abqaiq_plants: [49.66, 25.94],           // Abqaiq
  sa_master_gas_system_mgs: [48.5, 25.3],     // Central Saudi
  sa_fadhili_gas_plant: [49.5, 26.5],         // Fadhili
  sa_wasit_gas_plant: [50.1, 26.2],           // Wasit
  sa_hawiyah_gas_plant: [49.3, 24.2],         // Hawiyah
  sa_ras_tanura_terminal: [50.15, 26.67],     // Ras Tanura terminal
  sa_master_gas_system: [48.0, 25.0],         // Central Saudi
  sa_juaymah_crude_terminal: [49.97, 26.8],   // Ju'aymah
  sa_juaymah_lpg_terminal: [49.99, 26.82],    // Ju'aymah
  sa_hawiyah_gas_plant_storage_complex: [49.35, 24.25],
  sa_yanbu_ngl_fractionation_complex: [38.1, 24.05],

  // QatarEnergy LNG — Qatar
  qe_north_field_gas_field: [51.3, 26.1],     // offshore North Field
  qe_ras_laffan_industrial_city_rlic: [51.55, 25.93],
  qe_ras_laffan_port: [51.56, 25.92],
  qe_qatarenergy_lng_export_trains_qatargas_1: [51.54, 25.91],
  qe_north_field_expansion_nfe_nfs: [51.35, 26.0],
  qe_laffan_refinery_lr1_lr2_merged: [51.52, 25.9],
  qe_umm_said_mesaieed_refinery: [51.55, 24.98],
  qe_pearl_gtl_plant: [51.53, 25.89],
  qe_oryx_gtl_plant: [51.54, 25.0],
  qe_dolphin_pipeline_gas_exports_to_uae_oman: [52.5, 25.5],
  qe_barzan_gas_plant: [51.51, 25.88],

  // QAFCO Fertilizer — Qatar + global destinations
  qf_qafco_complex: [51.55, 24.99],
  qf_qafco7_blue_ammonia: [51.56, 25.01],
  qf_qatar_energy_feedstock: [51.5, 25.5],
  qf_north_field_gas: [51.3, 26.1],
  qf_mesaieed_industrial_city: [51.55, 24.97],
  qf_mesaieed_port: [51.57, 24.96],
  qf_qafco_urea_product: [51.58, 25.02],
  qf_qafco_ammonia_product: [51.59, 25.03],
  qf_qatar_melamine_company: [51.54, 24.98],
  qf_gulf_formaldehyde_company: [51.53, 24.99],
  qf_aqueous_ammonia_facility: [51.52, 25.0],
  qf_qafco_1_4_site: [51.51, 24.97],
  qf_qafco_5_6_site: [51.50, 24.96],
  qf_strait_of_hormuz: [56.3, 26.6],
  qf_india_fertilizer_market: [78.0, 22.0],
  qf_brazil_fertilizer_market: [-47.9, -15.8],
  qf_australia_fertilizer_market: [133.8, -25.3],
  qf_usa_fertilizer_market: [-95.7, 37.1],
  qf_global_food_prices: [12.5, 42.0],       // Rome (FAO HQ)

  // Ma'aden Phosphate — Saudi Arabia
  mn_ma_aden_phosphate_business: [46.7, 24.7],
  mn_phosphate_3_mega_project: [41.0, 31.0],
  mn_wa_ad_al_shamal_phosphate_hub: [41.2, 31.7],
  mn_ras_al_khair_phosphate_hub: [49.5, 27.1],
  mn_umm_wu_al_phosphate_mine: [41.5, 31.5],
  mn_hazm_al_jalamid_phosphate_mine: [40.5, 31.3],
  mn_north_south_railway: [44.0, 28.0],
  mn_ras_al_khair_ammonia_units: [49.45, 27.05],
  mn_blue_low_carbon_ammonia_export_program: [49.6, 27.15],
  mn_ras_al_khair_dap_plant: [49.48, 27.08],
  mn_phosphoric_acid_units: [49.47, 27.06],
  mn_sulfuric_acid_units: [49.46, 27.04],
  mn_phosphogypsum_stacks_recycling_complex: [49.44, 27.03],
  mn_industrial_water_pipeline_system: [47.0, 27.5],
  mn_natural_gas_feedstock_system: [48.5, 26.0],
  mn_bangladesh_agricultural_development_corp: [90.4, 23.7],
  mn_india_fertilizer_market: [78.0, 20.6],
  mn_brazil_fertilizer_market: [-49.3, -16.7],
  mn_african_import_dependent_markets: [20.0, 0.0],
  mn_strait_of_hormuz: [56.5, 26.5],
  mn_global_food_price_stress: [14.4, 40.8],  // near Rome

  // Financial Contagion — spread across key financial centers
  fc_em_fx_reserves: [28.0, 41.0],       // Istanbul region (EM hub)
  fc_external_debt_stock: [30.0, 38.0],
  fc_debt_to_gdp: [32.0, 36.0],
  fc_current_account: [34.0, 34.0],
  fc_fx_pressure: [36.0, 32.0],
  fc_cb_policy_rate: [38.0, 30.0],
  fc_blackrock_emd: [-74.0, 40.7],       // NYC
  fc_pimco_emd: [-117.8, 33.7],          // Newport Beach
  fc_fund_concentration: [-73.5, 40.8],
  fc_sovereign_default: [35.0, 33.0],
  fc_crisis_window: [37.0, 31.0],
  fc_cross_border_banking: [8.5, 47.4],  // Zurich
  fc_currency_contagion: [29.0, 41.0],
  fc_haircut_transmission: [31.0, 40.0],
  fc_turkey_fx: [32.9, 39.9],            // Ankara
  fc_argentina_fx: [-58.4, -34.6],       // Buenos Aires
  fc_south_africa_fx: [28.0, -26.2],     // Johannesburg
  fc_brazil_fx: [-43.2, -22.9],          // Rio

  // Sovereign Risk — China & Brazil
  sr_china_gdp: [116.4, 39.9],           // Beijing
  sr_china_employment: [121.5, 31.2],     // Shanghai
  sr_china_capital: [114.1, 22.4],        // Shenzhen
  sr_china_tfp: [113.3, 23.1],           // Guangzhou
  sr_china_mpk: [117.2, 39.1],           // Tianjin
  sr_china_kl: [118.8, 32.1],            // Nanjing
  sr_brazil_gdp: [-46.6, -23.6],         // Sao Paulo
  sr_brazil_employment: [-43.2, -22.9],   // Rio
  sr_brazil_capital: [-47.9, -15.8],      // Brasilia
  sr_brazil_tfp: [-49.3, -25.4],          // Curitiba
  sr_brazil_mpk: [-51.2, -30.0],          // Porto Alegre
  sr_brazil_kl: [-38.5, -12.97],          // Salvador

  // Supply Chain Food Security — MENA + global
  sc_bunge_global: [-73.96, 40.75],       // NYC (HQ)
  sc_almarai: [46.7, 24.7],              // Riyadh
  sc_mena_import_dependency: [36.3, 33.5], // Beirut region
  sc_global_wheat_price: [-87.6, 41.9],   // Chicago (CBOT)
  sc_fertilizer_price_index: [12.5, 41.9], // Rome
  sc_shipping_cost_index: [32.3, 30.0],   // Suez
  sc_strategic_reserves: [44.4, 33.3],    // Baghdad
  sc_food_price_inflation: [31.2, 30.0],  // Cairo
  sc_currency_depreciation: [35.2, 31.8], // Amman
  sc_subsidy_program: [45.4, 35.5],       // Erbil/northern Iraq

  // Undersea Cable Infrastructure
  ic_telecom_egypt: [31.2, 30.04],        // Cairo
  ic_orange_marine: [5.37, 43.3],         // Marseille
  ic_flag_europe_asia: [43.0, 34.0],      // along corridor
  ic_seamewe5: [67.0, 24.9],             // Karachi
  ic_seamewe6: [73.0, 22.0],             // Mumbai approach
  ic_aae1: [55.0, 12.0],                 // Djibouti area
  ic_2africa: [39.0, -6.8],              // Dar es Salaam
  ic_red_sea_exposure: [42.5, 13.5],      // Bab el-Mandeb
  ic_reroute_stress: [36.0, 1.0],         // East Africa backbone
  ic_repair_complexity: [50.0, 20.0],     // Arabian Sea
  ic_latency_risk: [60.0, 15.0],          // Indian Ocean
  ic_landing_station_concentration: [32.3, 31.3], // Port Said
};

// ─── Fallback: country centroids ─────────────────────────────────
const COUNTRY_COORDINATES: Record<string, LngLat> = {
  "Saudi Arabia": [45.1, 23.9],
  "Qatar": [51.2, 25.3],
  "China": [104.2, 35.9],
  "India": [78.9, 20.6],
  "Brazil": [-51.9, -14.2],
  "Turkey": [35.2, 38.9],
  "Argentina": [-63.6, -38.4],
  "South Africa": [22.9, -30.6],
  "United States": [-95.7, 37.1],
  "Egypt": [30.8, 26.8],
  "Bangladesh": [90.4, 23.7],
  "Australia": [133.8, -25.3],
  "Oman": [55.9, 21.5],
  "Iran": [53.7, 32.4],
};

// ─── Fallback: domain centroids ──────────────────────────────────
const DOMAIN_COORDINATES: Record<string, LngLat> = {
  "Saudi Aramco Energy": [47.0, 25.0],
  "QatarEnergy LNG": [51.4, 25.6],
  "QAFCO Fertilizer": [51.5, 25.0],
  "Ma'aden Phosphate": [45.0, 28.0],
  "Financial Contagion": [28.0, 38.0],
  "Sovereign Risk": [80.0, 15.0],
  "Supply Chain Food Security": [36.0, 30.0],
  "Undersea Cable Infrastructure": [45.0, 15.0],
};

/**
 * Resolve geographic coordinates for a node.
 * Priority: exact node ID → country from globalConcentration → domain centroid → world center
 */
export function getNodeCoordinates(
  nodeId: string,
  globalConcentration: string,
  domain: string,
): LngLat {
  // 1. Exact node match
  if (NODE_COORDINATES[nodeId]) return NODE_COORDINATES[nodeId];

  // 2. Extract country from globalConcentration
  const countryMatch = globalConcentration.match(/100%\s+(.+)/);
  if (countryMatch) {
    const country = countryMatch[1].split("—")[0].split("/")[0].trim();
    if (COUNTRY_COORDINATES[country]) {
      // Add small jitter to prevent exact overlap
      const base = COUNTRY_COORDINATES[country];
      const hash = hashString(nodeId);
      return [
        base[0] + ((hash % 100) / 100 - 0.5) * 4,
        base[1] + (((hash >> 8) % 100) / 100 - 0.5) * 4,
      ];
    }
  }

  // 3. Domain centroid with jitter
  if (DOMAIN_COORDINATES[domain]) {
    const base = DOMAIN_COORDINATES[domain];
    const hash = hashString(nodeId);
    return [
      base[0] + ((hash % 100) / 100 - 0.5) * 6,
      base[1] + (((hash >> 8) % 100) / 100 - 0.5) * 6,
    ];
  }

  // 4. Fallback: Middle East center with jitter
  const hash = hashString(nodeId);
  return [
    45 + ((hash % 100) / 100 - 0.5) * 10,
    25 + (((hash >> 8) % 100) / 100 - 0.5) * 10,
  ];
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
