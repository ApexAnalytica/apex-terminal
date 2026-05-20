/**
 * Display utilities for live-data signals — shared by the per-card live rows
 * in `RiskPropagationFlow` and the global summary in its header.
 *
 * Adding a new feed:
 *   1. Server proxy at /api/feeds/<provider>/...
 *   2. Hook + store action that writes `liveData[]` with a new `kind`.
 *   3. (Optional) add a `KIND_FORMATTERS` entry below if the default
 *      "value unit" rendering doesn't read well; otherwise everything just
 *      works.
 */
import type { LiveDataPoint } from "@/lib/types";

export type FeedMode = "live" | "mock" | "mock-fallback" | "stale";

export interface FormattedLiveSignal {
  /** Short provider name, e.g. "EIA", "OFAC". Extracted from `source` if no
   *  per-kind override applies. */
  shortLabel: string;
  /** Primary value display, e.g. "18.50 mb/d", "Iran" */
  primaryValue: string;
  /** Optional secondary qualifier, e.g. "88%", "4 prog" */
  qualifier?: string;
}

const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Parse a `LiveDataPoint.source` string into a FeedMode. The proxies tag
 * mock data explicitly:
 *   - "...(mock — EIA_API_KEY unset)" / "...(mock — upstream unreachable)"
 *   - "...(period 2025-XX)" → live
 */
export function feedModeFromSource(source: string, observedAt: string): FeedMode {
  const lower = source.toLowerCase();
  if (lower.includes("mock — upstream") || lower.includes("(mock-fallback")) return "mock-fallback";
  if (lower.includes("(mock")) return "mock";
  return Date.now() - new Date(observedAt).getTime() > STALE_AFTER_MS && lower.includes("now")
    ? "stale"
    : "live";
}

export function timeAgoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** First whitespace/dash/paren-delimited token of `source`. */
export function shortLabelFromSource(source: string): string {
  const first = source.split(/[\s—(]/).filter(Boolean)[0];
  return first || "feed";
}

/** Tight units that are pre-fixed/post-fixed without a space, e.g. "5.25%". */
const TIGHT_UNITS = new Set(["%", "K", "M", "B", "$", "°C", "°F", ""]);

function formatValueWithUnit(value: number, unit: string): string {
  const v = Number.isInteger(value) ? value.toString() : value.toFixed(2);
  if (!unit) return v;
  if (TIGHT_UNITS.has(unit)) return `${v}${unit}`;
  return `${v} ${unit}`;
}

const KIND_FORMATTERS: Record<string, (p: LiveDataPoint) => FormattedLiveSignal> = {
  throughput: (p) => {
    const ratio = p.capacity > 0 ? p.value / p.capacity : 0;
    return {
      shortLabel: shortLabelFromSource(p.source),
      primaryValue: `${p.value.toFixed(2)} ${p.unit}`,
      qualifier: ratio > 0 ? `${(ratio * 100).toFixed(0)}%` : undefined,
    };
  },
  sanctions: (p) => {
    // source format: "OFAC SDN — Iran: IRAN, IRAN-EO13599, …"
    const countryMatch = /—\s*([^:]+):/.exec(p.source);
    const country = countryMatch?.[1]?.trim() ?? "active";
    return {
      shortLabel: shortLabelFromSource(p.source),
      primaryValue: country,
      qualifier: `${p.value} prog`,
    };
  },
  /** Generic macro/financial indicator. Renders "5.25%", "1430K", "102.4"
   *  with smart unit spacing; qualifier shown when capacity is meaningful. */
  indicator: (p) => {
    const ratio = p.capacity > 0 ? p.value / p.capacity : 0;
    return {
      shortLabel: shortLabelFromSource(p.source),
      primaryValue: formatValueWithUnit(p.value, p.unit),
      qualifier: ratio > 0 && ratio < 2 ? `${(ratio * 100).toFixed(0)}%` : undefined,
    };
  },
  /** WGI governance score (Rule of Law, etc.). Scale runs ~-2.5..+2.5;
   *  capacity=0 represents the world average. Qualifier reports the sign
   *  relative to the world average so the card reads "−0.40 WGI · below avg"
   *  rather than a meaningless percentage. */
  governance: (p) => {
    const signed = p.value >= 0 ? `+${p.value.toFixed(2)}` : p.value.toFixed(2);
    return {
      shortLabel: shortLabelFromSource(p.source),
      primaryValue: `${signed} ${p.unit}`,
      qualifier: p.value < 0 ? "below avg" : "above avg",
    };
  },
  /** NOAA NHC active tropical-cyclone observation. `value` is max
   *  sustained wind in knots for the strongest storm in the basin;
   *  `capacity` is the hurricane threshold (64 kt). Qualifier classifies
   *  the strongest storm so the card reads "80 kt · hurricane" instead
   *  of "80 kt · 125%". */
  storm: (p) => {
    let qualifier: string;
    if (p.value >= 96) qualifier = "major hurricane";
    else if (p.value >= 64) qualifier = "hurricane";
    else if (p.value >= 34) qualifier = "tropical storm";
    else qualifier = "depression";
    return {
      shortLabel: shortLabelFromSource(p.source),
      primaryValue: `${Math.round(p.value)} ${p.unit}`,
      qualifier,
    };
  },
};

/**
 * Render a `LiveDataPoint` as a `{shortLabel, primaryValue, qualifier?}`
 * triple. Per-kind overrides registered in `KIND_FORMATTERS`; unknown kinds
 * fall through to a generic "value unit" + ratio rendering.
 */
export function formatLiveSignal(p: LiveDataPoint): FormattedLiveSignal {
  const formatter = KIND_FORMATTERS[p.kind];
  if (formatter) return formatter(p);
  const ratio = p.capacity > 0 ? p.value / p.capacity : 0;
  return {
    shortLabel: shortLabelFromSource(p.source),
    primaryValue: `${p.value} ${p.unit}`.trim(),
    qualifier: ratio > 0 && ratio < 1.5 ? `${(ratio * 100).toFixed(0)}%` : undefined,
  };
}

/**
 * Aggregate live signals across a node list into a per-mode count, deduping
 * by `kind` so a single feed serving multiple nodes counts once.
 */
export function summarizeLiveFeeds(
  nodes: ReadonlyArray<{ liveData?: LiveDataPoint[] }>,
): Record<FeedMode, number> {
  const counts: Record<FeedMode, number> = { live: 0, mock: 0, "mock-fallback": 0, stale: 0 };
  const seenKinds = new Set<string>();
  for (const n of nodes) {
    if (!n.liveData) continue;
    for (const p of n.liveData) {
      if (seenKinds.has(p.kind)) continue;
      seenKinds.add(p.kind);
      counts[feedModeFromSource(p.source, p.observedAt)] += 1;
    }
  }
  return counts;
}

/** Tailwind class for the mode dot. */
export function feedDotClass(mode: FeedMode): string {
  return {
    live: "bg-accent-green",
    mock: "bg-text-muted",
    "mock-fallback": "bg-accent-amber",
    stale: "bg-text-muted/40",
  }[mode];
}

/** Hex stroke color for a sparkline plotting live-data history. Aligns
 *  with the chip-dot colors so a card with a green live row paints a
 *  green sparkline. */
export function feedSparklineColor(mode: FeedMode): string {
  return {
    live: "#00e676", // accent-green
    mock: "#9aa0a6",
    "mock-fallback": "#ffab00", // accent-amber
    stale: "#5f6368",
  }[mode];
}
