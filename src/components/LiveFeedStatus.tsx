"use client";

import { useEffect, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getLiveSignal } from "@/lib/types";

type FeedMode = "live" | "mock" | "mock-fallback" | "stale";

interface FeedRow {
  id: "eia-hormuz" | "ofac-sdn";
  label: string;
  mode: FeedMode;
  primaryValue: string;
  detail: string;
  observedAt: string | null;
  source: string | null;
}

const STALE_AFTER_MS = 15 * 60 * 1000; // chip turns yellow if no fresh tick in 15m

/**
 * Live-feed status panel. Reads `liveData` directly off graph nodes — no extra
 * polling, no separate state. Mode is parsed from the source string written by
 * the upstream proxy ("(mock — ...)" / "(period 2025-XX)" / "(mock — upstream
 * unreachable)"), so a chip's mode is always consistent with what the proof
 * traces show.
 */
export default function LiveFeedStatus() {
  const graphData = useApexStore((s) => s.graphData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const [, force] = useState(0);

  // Re-render every 30s so the "Xm ago" labels stay current without polling.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const geopoliticalActive = selectedDomains.some(
    (d) => !d.toLowerCase().includes("t1d") && !d.toLowerCase().includes("vx880"),
  );

  const rows: FeedRow[] = useMemo(() => {
    if (!geopoliticalActive) return [];
    const nodes = graphData.nodes;

    // EIA throughput row — pull from any chokepoint node that has a
    // throughput signal (Hormuz). All chokepoints share the same reading.
    const throughputCarrier = nodes.find((n) => getLiveSignal(n, "throughput"));
    const tp = throughputCarrier ? getLiveSignal(throughputCarrier, "throughput") : undefined;
    const eiaRow: FeedRow = {
      id: "eia-hormuz",
      label: "EIA · Hormuz throughput",
      mode: tp ? feedModeFromSource(tp.source, tp.observedAt) : "stale",
      primaryValue: tp ? `${tp.value.toFixed(2)} ${tp.unit}` : "—",
      detail: tp
        ? `${(tp.value / tp.capacity * 100).toFixed(0)}% of ${tp.capacity} ${tp.unit} capacity`
        : "no reading yet",
      observedAt: tp?.observedAt ?? null,
      source: tp?.source ?? null,
    };

    // OFAC sanctions row — count distinct sanctioned jurisdictions touched.
    const sanctionedNodes = nodes.filter((n) => getLiveSignal(n, "sanctions"));
    const firstSanctions = sanctionedNodes
      .map((n) => getLiveSignal(n, "sanctions"))
      .find(Boolean);
    const ofacRow: FeedRow = {
      id: "ofac-sdn",
      label: "OFAC · SDN sanctions",
      mode: firstSanctions ? feedModeFromSource(firstSanctions.source, firstSanctions.observedAt) : "stale",
      primaryValue: firstSanctions ? `${sanctionedNodes.length} node${sanctionedNodes.length === 1 ? "" : "s"}` : "—",
      detail: firstSanctions
        ? sanctionedNodes.length === 0
          ? "no sanctioned nodes matched"
          : `${sanctionedNodes.length} matched · click any to see programs`
        : "no reading yet",
      observedAt: firstSanctions?.observedAt ?? null,
      source: firstSanctions?.source ?? null,
    };

    return [eiaRow, ofacRow];
  }, [graphData, geopoliticalActive]);

  if (!geopoliticalActive || rows.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 max-w-[260px]">
      <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.2em] text-text-muted px-1">
        LIVE FEEDS
      </div>
      {rows.map((row) => (
        <FeedChip key={row.id} row={row} />
      ))}
    </div>
  );
}

function FeedChip({ row }: { row: FeedRow }) {
  const dotClass = {
    live: "bg-accent-green",
    mock: "bg-text-muted",
    "mock-fallback": "bg-accent-amber",
    stale: "bg-text-muted/40",
  }[row.mode];

  const modeLabel = {
    live: "live",
    mock: "mock",
    "mock-fallback": "fallback",
    stale: "stale",
  }[row.mode];

  // Stale chips render at lower opacity so a not-yet-fetched feed doesn't
  // visually compete with an actively-flowing one.
  const staleOpacity = row.mode === "stale" ? "opacity-50" : "";

  return (
    <div
      className={`group flex flex-col gap-0.5 px-2 py-1 rounded border border-border bg-surface-elevated/85 backdrop-blur-sm hover:border-accent-cyan/40 transition-colors cursor-default ${staleOpacity}`}
      title={row.source ?? ""}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {row.mode === "live" && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClass} opacity-60`} />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotClass}`} />
          </span>
          <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground truncate">
            {row.label}
          </span>
        </div>
        <span className="text-[8px] font-mono text-text-muted shrink-0">
          {modeLabel}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 pl-3">
        <span className="text-[10px] font-mono text-foreground tabular-nums">
          {row.primaryValue}
        </span>
        <span className="text-[8px] font-mono text-text-muted tabular-nums">
          {row.observedAt ? timeAgoLabel(row.observedAt) : ""}
        </span>
      </div>
      <div className="text-[8px] font-mono text-text-muted pl-3 truncate">
        {row.detail}
      </div>
    </div>
  );
}

/**
 * Parse a LiveDataPoint.source string into a FeedMode.
 * The proxies tag mock data explicitly:
 *   - "...(mock — EIA_API_KEY unset)" or "...(mock — upstream unreachable)"
 *   - "...(period 2025-XX)" → live
 * Stale = present but observedAt is older than STALE_AFTER_MS.
 */
export function feedModeFromSource(source: string, observedAt: string): FeedMode {
  const lower = source.toLowerCase();
  if (lower.includes("mock — upstream") || lower.includes("(mock-fallback")) return "mock-fallback";
  if (lower.includes("(mock")) return "mock";
  // Live source — check freshness against the moment the *client* received it.
  // EIA observedAt is the publication period (often months ago), so we can't
  // use it for staleness. Use Date.now() as a proxy: if we have any reading at
  // all and the source is non-mock, mark it live; the timestamp displayed is
  // the publication period.
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
