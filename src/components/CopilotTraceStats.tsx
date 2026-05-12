"use client";

// ─── Copilot Trace Stats ────────────────────────────────────────
//
// Aggregate view of the authenticated user's recent trace data.
// Sits alongside <CopilotTraceHistory />'s per-row list — toggled
// via the STATS tab in the panel header.
//
// What you see:
//   - Top-level: total turns, tool calls, distinct conversations,
//     date range
//   - Per-tool breakdown: count, error rate, mean & p95 latency
//   - Per-model breakdown: turn count per (provider, model) pair
//
// The fetch loop matches CopilotTraceHistory's: fire on open,
// cancel on close, show loading/error/empty/loaded states.

import { useEffect, useState } from "react";
import type { AnalyticsSummary } from "@/lib/copilot/analytics";

interface Props {
  open: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; summary: AnalyticsSummary }
  | { kind: "error"; message: string };

export default function CopilotTraceStats({ open }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/copilot/traces/analytics", {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { summary: AnalyticsSummary };
        if (!cancelled) setState({ kind: "loaded", summary: data.summary });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  if (state.kind === "loading") {
    return <div className="text-[10px] font-mono text-text-muted">Loading…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="text-[10px] font-mono text-accent-amber">
        Couldn&apos;t load stats: {state.message}
      </div>
    );
  }
  if (state.kind === "idle") return null;

  const { summary } = state;
  if (summary.total_turns === 0) {
    return (
      <div className="text-[10px] font-mono text-text-muted leading-relaxed">
        No turns yet. Send a message to the copilot — stats will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TopLevel summary={summary} />
      <ToolBreakdown summary={summary} />
      <ModelBreakdown summary={summary} />
    </div>
  );
}

// ─── Top-level totals ───────────────────────────────────────────

function TopLevel({ summary }: { summary: AnalyticsSummary }) {
  const span =
    summary.earliest_at && summary.latest_at
      ? formatDateRange(summary.earliest_at, summary.latest_at)
      : null;
  return (
    <div className="space-y-0.5">
      <SectionHeader>OVERVIEW</SectionHeader>
      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
        <Cell label="turns" value={summary.total_turns} />
        <Cell label="tool calls" value={summary.total_tool_calls} />
        <Cell label="conversations" value={summary.distinct_conversations} />
      </div>
      {span && (
        <div className="text-[9px] font-mono text-text-muted/60 pt-0.5">{span}</div>
      )}
    </div>
  );
}

// ─── Per-tool breakdown ─────────────────────────────────────────

function ToolBreakdown({ summary }: { summary: AnalyticsSummary }) {
  if (summary.by_tool.length === 0) {
    return (
      <div>
        <SectionHeader>BY TOOL</SectionHeader>
        <div className="text-[10px] font-mono text-text-muted/70 leading-relaxed">
          No tool calls yet.
        </div>
      </div>
    );
  }
  const maxCount = summary.by_tool[0].count;
  return (
    <div className="space-y-0.5">
      <SectionHeader>BY TOOL</SectionHeader>
      <div className="space-y-1">
        {summary.by_tool.map((t) => (
          <div key={t.name} className="rounded border border-border bg-surface px-1.5 py-1 text-[10px] font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground truncate">{t.name}</span>
              <span className="shrink-0 text-text-muted/80">
                <span className="text-accent-cyan">{t.count}</span>
                {t.error_rate > 0 && (
                  <>
                    {" · "}
                    <span className={t.error_rate >= 0.1 ? "text-accent-amber" : "text-text-muted/70"}>
                      {(t.error_rate * 100).toFixed(0)}% err
                    </span>
                  </>
                )}
                {" · "}
                <span className="text-text-muted/70">
                  {Math.round(t.mean_latency_ms)}ms avg · {Math.round(t.p95_latency_ms)}ms p95
                </span>
              </span>
            </div>
            {/* Tiny count bar so the visual relativity reads at a glance. */}
            <div className="mt-1 h-0.5 bg-surface-elevated rounded overflow-hidden">
              <div
                className="h-full bg-accent-cyan/60"
                style={{ width: `${(t.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Per-model breakdown ────────────────────────────────────────

function ModelBreakdown({ summary }: { summary: AnalyticsSummary }) {
  return (
    <div className="space-y-0.5">
      <SectionHeader>BY MODEL</SectionHeader>
      <div className="space-y-0.5">
        {summary.by_model.map((m) => (
          <div
            key={`${m.provider}|${m.model_id}`}
            className="flex items-center justify-between text-[10px] font-mono px-1.5 py-0.5"
          >
            <span className="text-foreground truncate">
              <span className="text-accent-cyan">{m.provider}</span>
              <span className="text-text-muted/60"> / </span>
              <span className="text-text-muted">{m.model_id}</span>
            </span>
            <span className="text-text-muted">{m.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tiny primitives ────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
      {children}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-surface px-2 py-1">
      <div className="text-[14px] text-foreground tabular-nums leading-none">{value}</div>
      <div className="text-[8px] uppercase tracking-wider text-text-muted/70 mt-0.5">{label}</div>
    </div>
  );
}

function formatDateRange(earliest: string, latest: string): string {
  const a = new Date(earliest);
  const b = new Date(latest);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (a.toDateString() === b.toDateString()) return fmt(a);
  return `${fmt(a)} → ${fmt(b)}`;
}
