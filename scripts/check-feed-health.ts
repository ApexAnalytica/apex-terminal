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

type Verdict = "LIVE" | "MOCK" | "MISS";
interface Row {
  feed: "FRED" | "WB";
  key: string;
  label: string;
  verdict: Verdict;
  source?: string;
  value?: number;
}

function paint(v: Verdict): string {
  // ANSI: green/yellow/red. Harmless if stdout is plain.
  if (v === "LIVE") return `\x1b[32m${v}\x1b[0m`;
  if (v === "MOCK") return `\x1b[33m${v}\x1b[0m`;
  return `\x1b[31m${v}\x1b[0m`;
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

function classify(source: string | undefined): Verdict {
  if (!source) return "MISS";
  return source.toLowerCase().includes("(mock") ? "MOCK" : "LIVE";
}

async function checkFred(): Promise<Row[]> {
  const expected = new Map(
    FRED_SERIES.map((s) => [s.units ? `${s.id}_${s.units}` : s.id, s.label]),
  );
  const raw = (await fetchJson("/api/feeds/fred/series")) as {
    observations?: Array<{ seriesId: string; source?: string; value?: number }>;
  };
  const obs = raw.observations ?? [];
  const seen = new Map<string, { source?: string; value?: number }>();
  for (const o of obs) seen.set(o.seriesId, { source: o.source, value: o.value });
  const rows: Row[] = [];
  for (const [key, label] of expected) {
    const hit = seen.get(key);
    rows.push({
      feed: "FRED",
      key,
      label,
      verdict: hit ? classify(hit.source) : "MISS",
      source: hit?.source,
      value: hit?.value,
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
    }>;
  };
  const obs = raw.observations ?? [];
  const seen = new Map<string, { source?: string; value?: number }>();
  for (const o of obs) {
    seen.set(`${o.country}/${o.indicator}`, { source: o.source, value: o.value });
  }
  const rows: Row[] = [];
  for (const [key, label] of expected) {
    const hit = seen.get(key);
    rows.push({
      feed: "WB",
      key,
      label,
      verdict: hit ? classify(hit.source) : "MISS",
      source: hit?.source,
      value: hit?.value,
    });
  }
  return rows;
}

function summarize(rows: Row[], feed: string): void {
  const live = rows.filter((r) => r.verdict === "LIVE").length;
  const mock = rows.filter((r) => r.verdict === "MOCK").length;
  const miss = rows.filter((r) => r.verdict === "MISS").length;
  console.log(
    `\n=== ${feed} === ${rows.length} expected · ${paint("LIVE")} ${live} · ${paint("MOCK")} ${mock} · ${paint("MISS")} ${miss}\n`,
  );
  for (const r of rows) {
    const val = r.value !== undefined ? ` ${r.value}` : "";
    const note = r.source ? ` ← ${r.source.slice(0, 65)}` : "";
    console.log(`  [${paint(r.verdict)}] ${r.key.padEnd(28)} ${r.label.slice(0, 42).padEnd(42)}${val}${note}`);
  }
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
  console.log(
    `\nOverall: ${all.length} expected · ${live} live · ${mock} mock · ${miss} missing`,
  );
  if (mock > 0) {
    console.log(
      `\nNote: ${mock} series returned mock data. The most common cause is an unset API key in the\n` +
        `server environment. For FRED specifically: set FRED_API_KEY at https://fred.stlouisfed.org/\n` +
        `docs/api/api_key.html → Vercel project settings → Environment Variables → redeploy.`,
    );
  }
  if (miss > 0) {
    console.log(
      `\nNote: ${miss} series were registered in FRED_SERIES / WB_SERIES but not returned by the\n` +
        `proxy. This usually means a deploy lag — the route is on an older build that doesn't know\n` +
        `about the new entries. Wait for the next deploy or push a dummy commit.`,
    );
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
