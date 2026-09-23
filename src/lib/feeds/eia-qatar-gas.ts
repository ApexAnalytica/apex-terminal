/**
 * EIA Qatar dry-natural-gas production feed — drives the upstream
 * North Field gas-source nodes with annual production data.
 *
 * Source: EIA v2 international/data with productId=26 (Dry natural
 * gas), activityId=1 (Production), country=QAT. EIA publishes this
 * series annually only (no monthly partition), and returns two rows
 * per period — one in BCM (billion cubic metres) and one in BCF
 * (billion cubic feet). We prefer the BCM row for a cleaner
 * international-standard magnitude and fall back to BCF→BCM if only
 * BCF is present.
 *
 * Why this is the right proxy: the North Field is the source of
 * essentially all Qatari dry-gas output, so national dry-gas
 * production is a direct observed proxy for North Field deliverability
 * — the variable that bounds every downstream QatarEnergy / QAFCO node
 * (LNG trains, GTL plants, Barzan, ammonia/urea feedstock). This is the
 * same "aggregate national production drives the physical-asset cluster"
 * shape as `eia-saudi-crude.ts`; the moat is per-asset data, not
 * national aggregates, and the aggregate is the strongest free signal.
 *
 * Capacity = 220 BCM/yr — post-North-Field-Expansion (NFE + NFS)
 * medium-term ceiling. Current production (~170 BCM/yr) sits on the
 * pre-expansion plateau that held 2022-2024; NFE (first LNG ~2026,
 * 77→126 MTPA) and NFS (~2030, →142 MTPA) lift the gas envelope. The
 * 220 figure is a disclosed engineering estimate (≈ +29% over the
 * current plateau, scaled to the incremental gas behind the LNG ramp),
 * not an official nameplate — it exists so the severity ratio
 * (value/capacity) reads "high utilisation, approaching expansion
 * ceiling" (~0.77) rather than a meaningless absolute.
 */
import type { LiveDataPoint } from "@/lib/types";

const PRODUCT_ID = "26"; // Dry natural gas
const ACTIVITY_ID = "1"; // Production
const COUNTRY_ID = "QAT";

/** BCF → BCM conversion factor (1 cubic foot = 0.0283168 m³). */
const BCF_TO_BCM = 0.0283168;

/** Qatar post-NFE/NFS medium-term production ceiling (BCM/yr). See
 *  module header for the basis — disclosed estimate, not a nameplate. */
export const QATAR_GAS_CAPACITY_BCM = 220;

export interface EiaQatarGasFeed extends LiveDataPoint {
  /** Period (YYYY) of the latest observation — annual cadence. */
  period: string;
}

/** Build the EIA v2 international/data URL for Qatar dry-gas
 *  production, annual, sorted period descending so the latest year is
 *  first. We don't filter by unit server-side (the unitId facet value
 *  isn't the display string), so both BCM + BCF rows come back and the
 *  parser picks. */
export function buildEiaQatarGasUrl(apiKey: string): string {
  const base = "https://api.eia.gov/v2/international/data/";
  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("frequency", "annual");
  params.append("data[0]", "value");
  params.append("facets[productId][]", PRODUCT_ID);
  params.append("facets[activityId][]", ACTIVITY_ID);
  params.append("facets[countryRegionId][]", COUNTRY_ID);
  params.append("sort[0][column]", "period");
  params.append("sort[0][direction]", "desc");
  params.set("offset", "0");
  // 6 = a couple of years of headroom; each year has BCM + BCF rows so
  // this is ~3 distinct periods.
  params.set("length", "6");
  return `${base}?${params.toString()}`;
}

interface EiaResponseRow {
  period?: string;
  value?: number | string | null;
  unit?: string;
}

interface EiaResponseEnvelope {
  response?: { data?: EiaResponseRow[] };
}

function finiteValue(v: number | string | null | undefined): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Parse the EIA response → latest finite period → BCM LiveDataPoint.
 *  Rows are period-desc; we prefer the BCM unit row, falling back to a
 *  BCF row scaled to BCM when BCM is absent for the latest period. */
export function parseEiaQatarGasResponse(raw: unknown): EiaQatarGasFeed {
  const envelope = raw as EiaResponseEnvelope;
  const rows = envelope?.response?.data ?? [];
  if (rows.length === 0) throw new Error("EIA Qatar gas response had no data rows");

  // First pass: latest period with a finite BCM value (rows are desc).
  let chosen: { period: string; valueBcm: number } | null = null;
  for (const row of rows) {
    if (!row.period || row.unit !== "BCM") continue;
    const v = finiteValue(row.value);
    if (v === null) continue;
    chosen = { period: row.period, valueBcm: v };
    break;
  }

  // Fallback: latest period with a finite BCF value, scaled to BCM.
  if (!chosen) {
    for (const row of rows) {
      if (!row.period || row.unit !== "BCF") continue;
      const v = finiteValue(row.value);
      if (v === null) continue;
      chosen = { period: row.period, valueBcm: +(v * BCF_TO_BCM).toFixed(3) };
      break;
    }
  }

  if (!chosen) throw new Error("EIA Qatar gas response: no finite BCM/BCF value in window");

  return {
    kind: "production",
    value: +chosen.valueBcm.toFixed(3),
    capacity: QATAR_GAS_CAPACITY_BCM,
    unit: "BCM/yr",
    observedAt: periodToIso(chosen.period),
    source: `EIA v2 / Qatar dry natural gas production (period ${chosen.period})`,
    period: chosen.period,
  };
}

/** Mock feed — used when EIA_API_KEY is unset or upstream errors.
 *  ~170 BCM/yr is the 2022-2024 plateau; ratio ~77% of the disclosed
 *  expansion ceiling. */
export function mockEiaQatarGasFeed(): EiaQatarGasFeed {
  const observedAt = new Date().toISOString();
  return {
    kind: "production",
    value: 170,
    capacity: QATAR_GAS_CAPACITY_BCM,
    unit: "BCM/yr",
    observedAt,
    source: "EIA v2 / Qatar dry natural gas production (mock — EIA_API_KEY unset)",
    period: "mock",
  };
}

/** EIA annual periods are bare years ("2024"); monthly would be
 *  "YYYY-MM". Handle both defensively. */
function periodToIso(period: string): string {
  const monthly = /^(\d{4})-(\d{2})$/.exec(period);
  if (monthly) {
    return new Date(`${monthly[1]}-${monthly[2]}-01T00:00:00Z`).toISOString();
  }
  const annual = /^(\d{4})$/.exec(period);
  if (annual) {
    return new Date(`${annual[1]}-01-01T00:00:00Z`).toISOString();
  }
  return new Date().toISOString();
}
