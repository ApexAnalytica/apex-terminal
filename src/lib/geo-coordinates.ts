/**
 * Geographic coordinate mapping for causal graph nodes on the Map view.
 *
 * Resolution order:
 *   1. Exact node-ID match in `NODE_COORDINATES`
 *   2. City / institution name scan in `globalConcentration`
 *   3. Country match in `globalConcentration`:
 *        - "United States" / "USA" → spread across US_HUBS by hash bucket
 *          (used to be a single Kansas point — see the comment below)
 *        - Any other country → centroid + small jitter
 *   4. Domain centroid + jitter (last-ditch positional anchor)
 *   5. Final fallback (Middle East seed) when no domain match either
 *
 * Coordinates are [longitude, latitude].
 *
 * On geographic accuracy: where a node has a clear real-world location
 * (a refinery, a port, a corporate HQ, a research institution) it's
 * pinned to that. Where a node is genuinely conceptual (an attack
 * class in a dataset, a hormone biomarker, a network metric) it's
 * pinned to the dataset / lab / company that owns the concept, with
 * deterministic per-node hash jitter so co-located nodes don't all
 * stack on the same pixel.
 */

type LngLat = [number, number];

// ─── Specific node overrides (real-world known locations) ────────
const NODE_COORDINATES: Record<string, LngLat> = {
  // Saudi Aramco Energy — real infrastructure locations
  sa_east_west_pipeline: [42.5, 24.5],
  sa_ras_tanura_refinery: [50.17, 26.64],
  sa_yanbu_refinery: [38.06, 24.09],
  sa_master_gas_system_mgs: [48.5, 25.3],
  sa_fadhili_gas_plant: [49.5, 26.5],
  sa_wasit_gas_plant: [50.1, 26.2],
  sa_hawiyah_gas_plant: [49.3, 24.2],
  sa_ras_tanura_terminal: [50.15, 26.67],
  sa_master_gas_system: [48.0, 25.0],
  sa_juaymah_crude_terminal: [49.97, 26.8],
  sa_juaymah_lpg_terminal: [49.99, 26.82],
  sa_hawiyah_gas_plant_storage_complex: [49.35, 24.25],
  sa_yanbu_ngl_fractionation_complex: [38.1, 24.05],

  // QatarEnergy LNG — Qatar
  qe_north_field_gas_field: [51.3, 26.1],
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
  qf_india_fertilizer_market: [78.0, 22.0],
  qf_brazil_fertilizer_market: [-47.9, -15.8],
  qf_australia_fertilizer_market: [133.8, -25.3],
  qf_usa_fertilizer_market: [-95.7, 37.1],
  qf_global_food_prices: [12.5, 42.0], // Rome (FAO HQ)

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
  mn_global_food_price_stress: [14.4, 40.8],

  // Financial Contagion — financial centres + EM hubs
  fc_em_fx_reserves: [28.0, 41.0],
  fc_external_debt_stock: [30.0, 38.0],
  fc_debt_to_gdp: [32.0, 36.0],
  fc_current_account: [34.0, 34.0],
  fc_fx_pressure: [36.0, 32.0],
  fc_cb_policy_rate: [38.0, 30.0],
  fc_blackrock_emd: [-74.0, 40.7], // NYC
  fc_pimco_emd: [-117.8, 33.7],    // Newport Beach
  fc_fund_concentration: [-73.5, 40.8],
  fc_sovereign_default: [35.0, 33.0],
  fc_crisis_window: [37.0, 31.0],
  fc_cross_border_banking: [8.5, 47.4],  // Zurich
  fc_currency_contagion: [29.0, 41.0],
  fc_haircut_transmission: [31.0, 40.0],
  fc_turkey_fx: [32.9, 39.9],
  fc_argentina_fx: [-58.4, -34.6],
  fc_south_africa_fx: [28.0, -26.2],
  fc_brazil_fx: [-43.2, -22.9],

  // Sovereign Risk — China & Brazil
  sr_china_gdp: [116.4, 39.9],
  sr_china_employment: [121.5, 31.2],
  sr_china_capital: [114.1, 22.4],
  sr_china_tfp: [113.3, 23.1],
  sr_china_mpk: [117.2, 39.1],
  sr_china_kl: [118.8, 32.1],
  sr_brazil_gdp: [-46.6, -23.6],
  sr_brazil_employment: [-43.2, -22.9],
  sr_brazil_capital: [-47.9, -15.8],
  sr_brazil_tfp: [-49.3, -25.4],
  sr_brazil_mpk: [-51.2, -30.0],
  sr_brazil_kl: [-38.5, -12.97],

  // Supply Chain Food Security — MENA + global pricing hubs
  sc_bunge_global: [-73.96, 40.75],
  sc_almarai: [46.7, 24.7],
  sc_mena_import_dependency: [36.3, 33.5],
  sc_global_wheat_price: [-87.6, 41.9],     // Chicago CBOT
  sc_fertilizer_price_index: [12.5, 41.9],
  sc_shipping_cost_index: [32.3, 30.0],     // Suez
  sc_strategic_reserves: [44.4, 33.3],
  sc_food_price_inflation: [31.2, 30.0],
  sc_currency_depreciation: [35.2, 31.8],
  sc_subsidy_program: [45.4, 35.5],

  // Undersea Cable Infrastructure
  ic_telecom_egypt: [31.2, 30.04],
  ic_orange_marine: [5.37, 43.3],
  ic_flag_europe_asia: [43.0, 34.0],
  ic_seamewe5: [67.0, 24.9],
  ic_seamewe6: [73.0, 22.0],
  ic_aae1: [55.0, 12.0],
  ic_2africa: [39.0, -6.8],
  ic_red_sea_exposure: [42.5, 13.5],
  ic_reroute_stress: [36.0, 1.0],
  ic_repair_complexity: [50.0, 20.0],
  ic_latency_risk: [60.0, 15.0],
  ic_landing_station_concentration: [32.3, 31.3],

  // ─── Athena ISR / Defense ────────────────────────────────────────
  // Primary US defense / SATCOM ecosystem. ITAR-gated production
  // clusters in CA / VA / CO; satellite ops in CO + LA AFB; sensors
  // in Northeast defense corridor; classified compute around DC.
  drone_gpu_alloc: [-121.97, 37.35],        // NVIDIA HQ, Santa Clara
  edge_ai_inference: [-122.04, 37.37],      // Lockheed Martin Sunnyvale
  eoir_sensors: [-71.24, 42.37],            // Raytheon Waltham MA
  gpu_supply_itar: [-77.04, 38.89],         // Commerce Dept DC
  ground_terminals: [-104.52, 38.80],       // Schriever AFB Colorado Springs
  hitl_gate: [-77.06, 38.87],               // Pentagon
  itar_ear_gate: [-77.03, 38.89],           // BIS Commerce DC
  killchain_latency: [-77.05, 38.88],       // OSD DC
  leo_constellation: [-118.33, 33.92],      // SpaceX Hawthorne CA
  milsatcom_bw: [-118.34, 33.93],           // LA AFB / Space Force
  multiint_fusion: [-104.99, 39.74],        // Palantir Denver
  ooda_latency: [-77.07, 38.85],            // DoD operational DC
  onprem_cloud_decision: [-77.43, 38.93],   // AWS GovCloud Herndon VA
  radhard_fpga: [-121.89, 37.34],           // AMD/Xilinx San Jose
  scif_infra: [-77.06, 38.87],              // Pentagon SCIFs
  sigint_collection: [-76.77, 39.11],       // NSA Fort Meade MD
  swarm_mesh: [-117.92, 33.66],             // Anduril Costa Mesa CA
  classified_enclave: [-77.08, 38.89],      // DC area

  // ─── Macro Impact (BLS / BEA / Fed / Census) ─────────────────────
  // US macro signals. Most series originate in DC (BLS, BEA, Fed,
  // Treasury, Commerce) or NYC (NY Fed). Spread by series family so
  // the chart isn't a solid puddle on Pennsylvania Avenue.
  mi_nonfarm_payrolls: [-77.02, 38.89],     // BLS DC
  mi_unemployment_rate_u3: [-77.02, 38.89], // BLS DC
  mi_u6_underemployment: [-77.02, 38.89],   // BLS DC
  mi_lfpr: [-77.02, 38.89],                 // BLS DC
  mi_employment_pop_ratio: [-77.02, 38.89], // BLS DC
  mi_hiring_rate: [-77.03, 38.88],          // BLS JOLTS DC
  mi_manufacturing_payrolls: [-77.02, 38.88], // BLS DC
  mi_ahe_mom: [-77.02, 38.88],              // BLS DC
  mi_ahe_yoy: [-77.02, 38.88],              // BLS DC
  mi_eci: [-77.02, 38.88],                  // BLS DC
  mi_unit_labor_costs: [-77.02, 38.88],     // BLS DC
  mi_jolts_openings: [-77.03, 38.88],       // BLS JOLTS
  mi_jolts_quit_rate: [-77.03, 38.88],
  mi_jolts_layoff_rate: [-77.03, 38.88],
  mi_gdp_growth: [-77.03, 38.90],           // BEA DC
  mi_retail_sales: [-77.01, 38.89],         // Census
  mi_industrial_production: [-77.03, 38.91], // FRB DC
  mi_capacity_utilization: [-77.03, 38.91],
  mi_ism_manufacturing: [-87.65, 41.85],    // ISM Chicago
  mi_ism_services: [-87.65, 41.85],
  mi_housing_starts: [-77.01, 38.87],       // Census
  mi_building_permits: [-77.01, 38.87],
  mi_case_shiller_hpi: [-73.99, 40.73],     // S&P NYC
  mi_mortgage_rate_30y: [-77.04, 38.90],    // Freddie Mac McLean VA

  // ip_* = inflation/policy (CPI, PPI, PCE, Fed funds)
  ip_cpi_headline: [-77.02, 38.89],
  ip_cpi_core: [-77.02, 38.89],
  ip_cpi_services: [-77.02, 38.89],
  ip_cpi_food: [-77.02, 38.89],
  ip_cpi_oer: [-77.02, 38.89],
  ip_cpi_energy: [-77.02, 38.89],
  ip_ppi_all_commodities: [-77.02, 38.89],
  ip_ppi_core: [-77.02, 38.89],
  ip_pce_headline: [-77.03, 38.90],         // BEA
  ip_pce_core: [-77.03, 38.90],
  ip_breakeven_5y: [-77.04, 38.90],
  ip_fed_funds: [-77.04, 38.90],            // FRB
  ip_sofr: [-73.99, 40.71],                 // NY Fed

  // ─── T1D β-cell biology (Joslin / NIH / Lilly / Vertex) ─────────
  // Mostly clinical concepts. Co-located around the major US T1D
  // research clusters with hash jitter so they spread across the
  // BOS / NYC / IND / NIH / Stanford axis.
  t1d_autoantibodies: [-71.10, 42.34],      // Joslin Diabetes Center Boston
  t1d_treg_deficit: [-71.10, 42.34],        // Joslin Boston
  t1d_cd8_teff: [-71.11, 42.34],            // Harvard immunology
  t1d_er_stress: [-122.17, 37.43],          // Stanford diabetes
  t1d_beta_mass: [-71.11, 42.36],           // Vertex Boston (β-cell focus)
  t1d_c_peptide: [-71.10, 42.34],           // Joslin
  t1d_stem_cell_beta: [-71.11, 42.36],      // Vertex Boston
  t1d_teplizumab: [-72.59, 41.76],          // Provention Bio (now Sanofi)
  t1d_cgm_tir: [-117.16, 32.72],            // Dexcom San Diego
  t1d_realworld_tir: [-117.16, 32.72],      // Dexcom
  t1d_hypo_events: [-77.10, 39.00],         // NIDDK Bethesda
  t1d_population_hba1c: [-77.10, 39.00],    // NIDDK Bethesda
  t1d_dka: [-77.10, 39.00],                 // NIDDK Bethesda
  t1d_retinopathy: [-77.10, 39.00],
  t1d_dkd: [-77.10, 39.00],

  // ─── T1D VX-880 (Vertex stem-cell islet transplant trial) ───────
  // Vertex HQ + trial-endpoint nodes. All anchored at the Vertex
  // Boston site (Seaport) with hash jitter; trial endpoint codes
  // (e1..e21) read as a tight cluster, matching how the trial is
  // run from a single sponsor.
  vx880_dose: [-71.04, 42.35],              // Vertex HQ Seaport Boston
  vx880_autoantibody_load: [-71.04, 42.35],
  vx880_autoimmune_recur: [-71.04, 42.35],
  vx880_alloimmune_reject: [-71.04, 42.35],
  vx880_cgm_tir: [-71.04, 42.35],
  vx880_e1: [-71.04, 42.35], vx880_e2: [-71.04, 42.35],
  vx880_e3: [-71.04, 42.35], vx880_e4: [-71.04, 42.35],
  vx880_e5: [-71.04, 42.35], vx880_e6: [-71.04, 42.35],
  vx880_e7: [-71.04, 42.35], vx880_e8: [-71.04, 42.35],
  vx880_e9: [-71.04, 42.35], vx880_e10: [-71.04, 42.35],
  vx880_e11: [-71.04, 42.35], vx880_e12: [-71.04, 42.35],
  vx880_e13: [-71.04, 42.35], vx880_e14: [-71.04, 42.35],
  vx880_e15: [-71.04, 42.35], vx880_e16: [-71.04, 42.35],
  vx880_e17: [-71.04, 42.35], vx880_e18: [-71.04, 42.35],
  vx880_e19: [-71.04, 42.35], vx880_e20: [-71.04, 42.35],
  vx880_e21: [-71.04, 42.35],

  // ─── AI Safety / IDS (Ghauri 2025) ──────────────────────────────
  // Datasets at their owning institutions; ML components co-located
  // at UNB Canadian Institute for Cybersecurity (where the
  // dissertation work was done).
  ais_cicids_2017: [-66.64, 45.95],         // UNB CIC Fredericton
  ais_unsw_nb15: [151.23, -33.92],          // UNSW Sydney
  ais_awid_h23q: [26.55, 39.10],            // Aegean Univ., Greece
  ais_attack_brute_force: [-66.64, 45.95],
  ais_attack_ddos: [-66.64, 45.95],
  ais_attack_dos: [-66.64, 45.95],
  ais_attack_exploits: [-66.64, 45.95],
  ais_attack_fuzzers: [-66.64, 45.95],
  ais_attack_heartbleed: [-66.64, 45.95],
  ais_attack_mitm: [-66.64, 45.95],
  ais_attack_spoofing: [-66.64, 45.95],
  ais_attack_wireless_injection: [26.55, 39.10], // AWID dataset Greece
  ais_attention_layer: [-66.64, 45.95],
  ais_eval_harness: [-66.64, 45.95],
  ais_gat: [-66.64, 45.95],
  ais_replay_buffer: [-66.64, 45.95],
  ais_training_scheduler: [-66.64, 45.95],

  // ─── Frontier Science ───────────────────────────────────────────
  fs_axion_haloscope: [-122.30, 47.65],     // ADMX Univ. Washington
  fs_dark_matter_direct: [-103.75, 44.35],  // SURF Lab South Dakota (LZ)
  fs_gravitational_wave_obs: [-119.41, 46.45], // LIGO Hanford WA
  fs_hubble_tension: [-67.78, -22.96],      // ALMA Atacama Chile
  fs_neutrino_mass_hierarchy: [-88.27, 41.83], // Fermilab Batavia IL (DUNE)
  fs_proton_decay_search: [137.31, 36.43],  // Super-Kamiokande Japan
  si_hormuz_throughput: [56.3, 26.55],  // Strait of Hormuz centroid (was qf_/mn_strait_of_hormuz)
  si_abqaiq_throughput: [49.66, 25.94],  // Abqaiq Plants location (was sa_abqaiq_plants),
};

// ─── US hubs (replaces the single Kansas centroid) ───────────────
// Earlier the US fallback was [-95.7, 37.1] — the geographic centre
// of the country, in the middle of nowhere — and every "100% US"
// node hashed within ±2° of it. Visually that read as one solid
// blob over Oklahoma. Spreading across 10 hub-cities, picked by
// hash bucket, keeps US-tagged nodes distributed across the major
// economic / policy / tech corridors instead of stacked on Kansas.
const US_HUBS: LngLat[] = [
  [-73.99, 40.71],   // New York City (finance / media)
  [-77.04, 38.91],   // Washington DC (policy / defense)
  [-71.06, 42.36],   // Boston (biotech / academia)
  [-87.65, 41.85],   // Chicago (commodities / industrial)
  [-122.42, 37.78],  // San Francisco (tech)
  [-122.33, 47.61],  // Seattle (tech / aerospace)
  [-118.24, 34.05],  // Los Angeles (defense / media)
  [-95.37, 29.76],   // Houston (energy)
  [-84.39, 33.75],   // Atlanta (logistics / south hub)
  [-104.99, 39.74],  // Denver (defense / aerospace)
];

// ─── City / institution name scan ───────────────────────────────
// Scanned in `globalConcentration` (and falls through to the country
// regex if no city matches). Add new entries here when adding nodes
// with location-bearing strings the resolver should recognise.
const CITY_COORDINATES: Record<string, LngLat> = {
  // US metros
  "New York": [-73.99, 40.71], "NYC": [-73.99, 40.71],
  "Washington DC": [-77.04, 38.91], "Washington, DC": [-77.04, 38.91],
  "Boston": [-71.06, 42.36], "Cambridge MA": [-71.10, 42.37],
  "Chicago": [-87.65, 41.85], "San Francisco": [-122.42, 37.78],
  "Bay Area": [-122.10, 37.45], "Silicon Valley": [-122.10, 37.40],
  "Seattle": [-122.33, 47.61], "Los Angeles": [-118.24, 34.05],
  "Houston": [-95.37, 29.76], "Atlanta": [-84.39, 33.75],
  "Denver": [-104.99, 39.74], "Bethesda": [-77.10, 39.00],
  "Santa Clara": [-121.97, 37.35], "Sunnyvale": [-122.04, 37.37],
  "San Diego": [-117.16, 32.72], "Newport Beach": [-117.88, 33.62],
  "Costa Mesa": [-117.92, 33.66],
  // International hubs
  "London": [-0.13, 51.51], "Frankfurt": [8.68, 50.11],
  "Zurich": [8.54, 47.37], "Geneva": [6.14, 46.20],
  "Paris": [2.35, 48.86], "Amsterdam": [4.90, 52.37],
  "Tokyo": [139.69, 35.69], "Seoul": [126.98, 37.57],
  "Singapore": [103.82, 1.35], "Hong Kong": [114.17, 22.32],
  "Shanghai": [121.47, 31.23], "Beijing": [116.40, 39.91],
  "Mumbai": [72.88, 19.08], "Delhi": [77.10, 28.70],
  "Sydney": [151.21, -33.87], "Melbourne": [144.96, -37.81],
  "Toronto": [-79.38, 43.65], "Vancouver": [-123.12, 49.28],
  "Ottawa": [-75.70, 45.42], "Fredericton": [-66.64, 45.95],
  "Dubai": [55.30, 25.20], "Abu Dhabi": [54.37, 24.45],
  "Riyadh": [46.72, 24.71], "Tel Aviv": [34.78, 32.08],
  "Istanbul": [28.98, 41.01], "Cairo": [31.23, 30.04],
  "Lagos": [3.34, 6.52], "Johannesburg": [28.05, -26.20],
  "São Paulo": [-46.63, -23.55], "Sao Paulo": [-46.63, -23.55],
  "Mexico City": [-99.13, 19.43], "Buenos Aires": [-58.42, -34.61],
};

// ─── Country centroids ──────────────────────────────────────────
const COUNTRY_COORDINATES: Record<string, LngLat> = {
  "Saudi Arabia": [45.1, 23.9],
  "Qatar": [51.2, 25.3],
  "China": [104.2, 35.9],
  "India": [78.9, 20.6],
  "Brazil": [-51.9, -14.2],
  "Turkey": [35.2, 38.9],
  "Argentina": [-63.6, -38.4],
  "South Africa": [22.9, -30.6],
  "United States": [-98.6, 39.8], // unused for spread — see US_HUBS path
  "USA": [-98.6, 39.8],
  "US": [-98.6, 39.8],
  "Egypt": [30.8, 26.8],
  "Bangladesh": [90.4, 23.7],
  "Australia": [133.8, -25.3],
  "Oman": [55.9, 21.5],
  "Iran": [53.7, 32.4],
  "Canada": [-95.0, 56.1],
  "Mexico": [-102.5, 23.6],
  "United Kingdom": [-1.5, 52.4],
  "UK": [-1.5, 52.4],
  "Germany": [10.4, 51.2],
  "France": [2.2, 46.2],
  "Italy": [12.6, 41.9],
  "Spain": [-3.7, 40.4],
  "Netherlands": [5.3, 52.1],
  "Switzerland": [8.2, 46.8],
  "Japan": [138.3, 36.2],
  "South Korea": [127.8, 35.9],
  "Singapore": [103.8, 1.35],
  "Indonesia": [113.9, -2.5],
  "Greece": [21.8, 39.1],
  "Russia": [105.3, 61.5],
  "Nigeria": [8.7, 9.1],
};

// ─── Domain centroids (last-ditch positional anchor) ────────────
const DOMAIN_COORDINATES: Record<string, LngLat> = {
  "Saudi Aramco Energy": [47.0, 25.0],
  "QatarEnergy LNG": [51.4, 25.6],
  "QAFCO Fertilizer": [51.5, 25.0],
  "Ma'aden Phosphate": [45.0, 28.0],
  "Financial Contagion": [28.0, 38.0],
  "Sovereign Risk": [80.0, 15.0],
  "Supply Chain Food Security": [36.0, 30.0],
  "Undersea Cable Infrastructure": [45.0, 15.0],
  // New families — anchored over their headline region so a node
  // missing from NODE_COORDINATES still lands somewhere sensible.
  "Macro Impact: Labor, Growth & Housing": [-77.04, 38.91],
  "Macro Impact: Inflation & Policy": [-77.04, 38.91],
  "Drone Swarms": [-117.92, 33.66],
  "SATCOM": [-118.34, 33.93],
  "ISR Fusion": [-104.99, 39.74],
  "Chip Embargo": [-77.04, 38.89],
  "Secure Compute": [-77.43, 38.93],
  "Kill Chain": [-77.06, 38.87],
  "T1D Autoimmune": [-71.10, 42.34],
  "T1D β-cell Biology": [-71.11, 42.36],
  "T1D Metabolic": [-77.10, 39.00],
  "T1D Intervention": [-71.04, 42.35],
  "T1D Complications": [-77.10, 39.00],
  "T1D VX-880": [-71.04, 42.35],
  "AI Safety / IDS": [-66.64, 45.95],
  "Frontier Science": [-103.75, 44.35],
  "Geopolitical": [37.0, 24.0],
  "Energy Grid": [42.0, 24.0],
};

/**
 * Resolve geographic coordinates for a node.
 *
 * Order:
 *   1. Exact node-ID match
 *   2. City / institution name scan in globalConcentration
 *   3. Country match in globalConcentration
 *      - US → spread across US_HUBS by hash bucket
 *      - other → country centroid + ±2° jitter
 *   4. Domain centroid + ±3° jitter
 *   5. Final fallback (Middle East seed)
 */
export function getNodeCoordinates(
  nodeId: string,
  globalConcentration: string,
  domain: string,
): LngLat {
  // 1. Exact node match
  if (NODE_COORDINATES[nodeId]) return NODE_COORDINATES[nodeId];

  const concText = globalConcentration ?? "";

  // 2. City / institution scan. Match the first city name that appears
  // in globalConcentration. Pin to that city + small per-node jitter so
  // co-located nodes don't all stack on a single pixel.
  for (const city of Object.keys(CITY_COORDINATES)) {
    if (concText.includes(city)) {
      const base = CITY_COORDINATES[city];
      const h = hashString(nodeId);
      return [
        base[0] + ((h % 100) / 100 - 0.5) * 0.6,
        base[1] + (((h >> 8) % 100) / 100 - 0.5) * 0.6,
      ];
    }
  }

  // 3. Country match — try "100% (country)" first, then a general
  // mention. The previous regex only caught the "100%" form, which
  // missed plural strings like "60% US / 40% global".
  const country = extractCountry(concText);
  if (country) {
    // 3a. US → spread across hubs by hash bucket instead of stacking
    // on the geographic centre.
    if (country === "United States" || country === "USA" || country === "US") {
      const h = hashString(nodeId);
      const hub = US_HUBS[h % US_HUBS.length];
      return [
        hub[0] + ((h % 100) / 100 - 0.5) * 0.6,
        hub[1] + (((h >> 8) % 100) / 100 - 0.5) * 0.6,
      ];
    }
    if (COUNTRY_COORDINATES[country]) {
      const base = COUNTRY_COORDINATES[country];
      const h = hashString(nodeId);
      return [
        base[0] + ((h % 100) / 100 - 0.5) * 4,
        base[1] + (((h >> 8) % 100) / 100 - 0.5) * 4,
      ];
    }
  }

  // 4. Domain centroid + jitter
  if (DOMAIN_COORDINATES[domain]) {
    const base = DOMAIN_COORDINATES[domain];
    const h = hashString(nodeId);
    return [
      base[0] + ((h % 100) / 100 - 0.5) * 6,
      base[1] + (((h >> 8) % 100) / 100 - 0.5) * 6,
    ];
  }

  // 5. Final fallback: Middle East seed with jitter
  const h = hashString(nodeId);
  return [
    45 + ((h % 100) / 100 - 0.5) * 10,
    25 + (((h >> 8) % 100) / 100 - 0.5) * 10,
  ];
}

/**
 * Extract a country name from a globalConcentration string. Handles:
 *   - "100% China"           → "China"
 *   - "60% US / 40% global"  → "US"
 *   - "Headquartered in Saudi Arabia, exports global" → "Saudi Arabia"
 *   - "Diversified across US, India, Brazil"  → "US" (first hit)
 * Returns undefined when no recognised country is present.
 */
function extractCountry(text: string): string | undefined {
  if (!text) return undefined;
  // Try the explicit "<percent>% <country>" form first — strongest signal
  const pct = text.match(/\d+(?:\.\d+)?%\s+([A-Za-z][A-Za-z .'À-ſ]+?)(?:[/—,(]|$)/);
  if (pct) {
    const candidate = pct[1].trim();
    if (COUNTRY_COORDINATES[candidate]) return candidate;
    // Sometimes the matched fragment is "United States — defense" etc.
    // Strip trailing qualifier words.
    const head = candidate.split(/\s+/)[0];
    if (COUNTRY_COORDINATES[head]) return head;
  }
  // Then scan for any country name embedded in the text. Longer names
  // first so "United States" wins over "States".
  const countries = Object.keys(COUNTRY_COORDINATES).sort(
    (a, b) => b.length - a.length,
  );
  for (const c of countries) {
    if (text.includes(c)) return c;
  }
  return undefined;
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
