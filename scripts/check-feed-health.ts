#!/usr/bin/env -S npx tsx
/**
 * Feed health check — hit the prod (or local) feed routes and report
 * for each registered series whether it's returning real upstream data
 * or falling back to mock.
 *
 *   npx tsx scripts/check-feed-health.ts                # against prod
 *   BASE=http://localhost:3000 npx tsx scripts/check-feed-health.ts
 *
 * Prod's /api/feeds/* routes are behind Supabase auth, so against prod
 * you need to pass a session cookie:
 *
 *   AUTH_COOKIE='sb-...=...; sb-...-auth-token=...' npm run check:feeds
 *
 * Grab the cookie from a logged-in browser session (DevTools → Application →
 * Cookies → manifold.apexanalytica.co → copy the sb-* entries).
 *
 * Reads no secrets — the FRED/WB keys live in the server's env. Useful
 * right after rotating FRED_API_KEY on Vercel to confirm the next deploy
 * flipped every series from mock → live.
 *
 * Exits 0 if at least one series is live and none are unexpectedly
 * absent; exits 1 otherwise so it's safe to drop into CI.
 */
import { FRED_SERIES } from "../src/lib/feeds/fred";
import { WB_SERIES } from "../src/lib/feeds/world-bank";

const BASE = process.env.BASE ?? "https://manifold.apexanalytica.co";
const AUTH_COOKIE = process.env.AUTH_COOKIE;

type Verdict = "LIVE" | "MOCK" | "MISS" | "STALE";
interface Row {
  feed: "FRED" | "WB";
  key: string;
  label: string;
  verdict: Verdict;
  source?: string;
  value?: number;
  observedAt?: string;
  ageDays?: number;
}

// Staleness thresholds — anything older than this with a non-mock source is
// flagged as STALE. The class of bug this catches: a FRED (or WB) series
// gets upstream-discontinued, but the API keeps returning the last-known
// value indefinitely. The series passes the LIVE check (real source string,
// non-mock value), so the canvas silently renders a years-old number as if
// current.
//
// Concrete case it would have caught: PPIFGS ("PPI Final Demand Goods")
// stopped publishing in 2015-12. As of 2026-05-22 it was 10 years stale
// but check:feeds reported it as LIVE.
//
// Thresholds chosen by upstream cadence:
//
//   FRED: most series publish at least monthly. Quarterly series at worst
//     run ~5 months behind. 1 year is the cap on "alive but slow"; older
//     than 365 days = upstream-discontinued.
//
//   WB: publishes annually with a 1-2 year reporting lag — fertilizer
//     consumption (kg/ha) is a classic example where the 2023 value is
//     the latest available in 2026 (3.4 years from observation date, but
//     the series is still alive). 5 years is the cap where we can say
//     the series is genuinely dead vs. just slow.
//
// Dry-run against prod (2026-05-22) with WB at 3y caught WB fertilizer
// as STALE, which was a false positive — these series are still alive,
// just slow. Bumped to 5y to filter out normal WB lag while still
// catching genuinely-dead series (PPIFGS at 10y, PPILFE at 10y).
const STALENESS_THRESHOLD_DAYS = {
  FRED: 365,
  WB: 365 * 5,
} as const;

function paint(v: Verdict): string {
  // ANSI: green/amber/red/red. Harmless if stdout is plain.
  if (v === "LIVE") return `\x1b[32m${v}\x1b[0m`;
  if (v === "MOCK") return `\x1b[33m${v}\x1b[0m`;
  if (v === "STALE") return `\x1b[35m${v}\x1b[0m`; // magenta — distinct from MOCK
  return `\x1b[31m${v}\x1b[0m`;
}

function daysSince(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function classifyWithFreshness(
  source: string | undefined,
  observedAt: string | undefined,
  feed: "FRED" | "WB",
): { verdict: Verdict; ageDays?: number } {
  if (!source) return { verdict: "MISS" };
  if (source.toLowerCase().includes("(mock")) return { verdict: "MOCK" };
  const ageDays = daysSince(observedAt);
  if (ageDays !== undefined && ageDays > STALENESS_THRESHOLD_DAYS[feed]) {
    return { verdict: "STALE", ageDays };
  }
  return { verdict: "LIVE", ageDays };
}

async function fetchJson(path: string): Promise<unknown> {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    headers: AUTH_COOKIE ? { cookie: AUTH_COOKIE } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 307 || r.status === 302) {
    throw new Error(
      `${url} → HTTP ${r.status} → ${r.headers.get("location") ?? "?"}. ` +
        `The feed route is auth-gated; pass AUTH_COOKIE='sb-...-auth-token=...' ` +
        `(from a logged-in browser session) and retry.`,
    );
  }
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function checkFred(): Promise<Row[]> {
  const expected = new Map(
    FRED_SERIES.map((s) => [s.units ? `${s.id}_${s.units}` : s.id, s.label]),
  );
  const raw = (await fetchJson("/api/feeds/fred/series")) as {
    observations?: Array<{
      seriesId: string;
      source?: string;
      value?: number;
      observedAt?: string;
    }>;
  };
  const obs = raw.observations ?? [];
  const seen = new Map<
    string,
    { source?: string; value?: number; observedAt?: string }
  >();
  for (const o of obs)
    seen.set(o.seriesId, {
      source: o.source,
      value: o.value,
      observedAt: o.observedAt,
    });
  const rows: Row[] = [];
  for (const [key, label] of expected) {
    const hit = seen.get(key);
    const { verdict, ageDays } = hit
      ? classifyWithFreshness(hit.source, hit.observedAt, "FRED")
      : { verdict: "MISS" as Verdict, ageDays: undefined };
    rows.push({
      feed: "FRED",
      key,
      label,
      verdict,
      source: hit?.source,
      value: hit?.value,
      observedAt: hit?.observedAt,
      ageDays,
    });
  }
  return rows;
}

async function checkWb(): Promise<Row[]> {
  const expected = new Map(
    WB_SERIES.map((s) => [`${s.country}/${s.indicator}`, s.label]),
  );
  const raw = (await fetchJson("/api/feeds/world-bank/series")) as {
    observations?: Array<{
      country: string;
      indicator: string;
      source?: string;
      value?: number;
      observedAt?: string;
    }>;
  };
  const obs = raw.observations ?? [];
  const seen = new Map<
    string,
    { source?: string; value?: number; observedAt?: string }
  >();
  for (const o of obs) {
    seen.set(`${o.country}/${o.indicator}`, {
      source: o.source,
      value: o.value,
      observedAt: o.observedAt,
    });
  }
  const rows: Row[] = [];
  for (const [key, label] of expected) {
    const hit = seen.get(key);
    const { verdict, ageDays } = hit
      ? classifyWithFreshness(hit.source, hit.observedAt, "WB")
      : { verdict: "MISS" as Verdict, ageDays: undefined };
    rows.push({
      feed: "WB",
      key,
      label,
      verdict,
      source: hit?.source,
      value: hit?.value,
      observedAt: hit?.observedAt,
      ageDays,
    });
  }
  return rows;
}

function summarize(rows: Row[], feed: string): void {
  const live = rows.filter((r) => r.verdict === "LIVE").length;
  const mock = rows.filter((r) => r.verdict === "MOCK").length;
  const miss = rows.filter((r) => r.verdict === "MISS").length;
  const stale = rows.filter((r) => r.verdict === "STALE").length;
  console.log(
    `\n=== ${feed} === ${rows.length} expected · ${paint("LIVE")} ${live} · ${paint("MOCK")} ${mock} · ${paint("STALE")} ${stale} · ${paint("MISS")} ${miss}\n`,
  );
  for (const r of rows) {
    const val = r.value !== undefined ? ` ${r.value}` : "";
    // For LIVE rows, show a faint age annotation so the operator can eyeball
    // freshness at a glance (e.g. "3d" / "47d" / "1.3y"). For STALE rows show
    // the age in bold red so it's unmissable.
    const ageNote = r.ageDays !== undefined
      ? r.verdict === "STALE"
        ? ` \x1b[31m\x1b[1m${formatAge(r.ageDays)}\x1b[0m`
        : ` \x1b[2m${formatAge(r.ageDays)}\x1b[0m`
      : "";
    const note = r.source ? ` ← ${r.source.slice(0, 60)}` : "";
    console.log(
      `  [${paint(r.verdict)}] ${r.key.padEnd(28)} ${r.label.slice(0, 38).padEnd(38)}${val}${ageNote}${note}`,
    );
  }
}

function formatAge(days: number): string {
  if (days < 60) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

async function main() {
  console.log(`Checking feeds at ${BASE} …`);
  const [fredRows, wbRows] = await Promise.all([checkFred(), checkWb()]);
  summarize(fredRows, "FRED");
  summarize(wbRows, "World Bank");
  const all = [...fredRows, ...wbRows];
  const live = all.filter((r) => r.verdict === "LIVE").length;
  const mock = all.filter((r) => r.verdict === "MOCK").length;
  const miss = all.filter((r) => r.verdict === "MISS").length;
  const stale = all.filter((r) => r.verdict === "STALE").length;
  console.log(
    `\nOverall: ${all.length} expected · ${live} live · ${mock} mock · ${stale} stale · ${miss} missing`,
  );
  if (mock > 0) {
    console.log(
      `\nNote: ${mock} series returned mock data. The most common cause is an unset API key in the\n` +
        `server environment. For FRED specifically: set FRED_API_KEY at https://fred.stlouisfed.org/\n` +
        `docs/api/api_key.html → Vercel project settings → Environment Variables → redeploy.`,
    );
  }
  if (stale > 0) {
    const staleRows = all.filter((r) => r.verdict === "STALE");
    console.log(
      `\nNote: ${stale} series have observations older than the staleness threshold ` +
        `(FRED ${STALENESS_THRESHOLD_DAYS.FRED}d, WB ${STALENESS_THRESHOLD_DAYS.WB}d). ` +
        `These are usually upstream-discontinued series — the API still returns the last-known\n` +
        `value indefinitely, so the canvas silently shows years-old data as if current. Investigate\n` +
        `each one: probe FRED/WB directly to confirm the series is dead, then either swap to a\n` +
        `current equivalent or delete the catalog entry. See PR #350 (WB PAK swap) and PR #391\n` +
        `(FRED PPIFGS swap) for the pattern.`,
    );
    for (const r of staleRows) {
      console.log(`    ⚠ ${r.feed} ${r.key} — observed ${r.observedAt ?? "?"} (${formatAge(r.ageDays ?? 0)} old)`);
    }
  }
  if (miss > 0) {
    console.log(
      `\nNote: ${miss} series were registered in FRED_SERIES / WB_SERIES but not returned by the\n` +
        `proxy. This usually means a deploy lag — the route is on an older build that doesn't know\n` +
        `about the new entries. Wait for the next deploy or push a dummy commit.`,
    );
    process.exit(1);
  }
  // STALE is a hard fail too — silently rendering 10-year-old data is the kind
  // of bug that should block a deploy until investigated.
  if (stale > 0) {
    process.exit(1);
  }
  if (live === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("check-feed-health failed:", err);
  process.exit(1);
});
