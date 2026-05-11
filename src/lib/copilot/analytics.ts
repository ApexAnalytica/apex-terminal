// ─── Copilot trace analytics ───────────────────────────────────
//
// Aggregations over an array of copilot_traces rows. Pure
// function — no I/O, no SQL knobs to twist. The API route fetches
// the rows (RLS-filtered per-user), passes them to summarize(),
// and returns the result.
//
// We do aggregation in TypeScript rather than SQL because:
//   - The dataset is small (hundreds to low thousands of rows for
//     the foreseeable future) and a Node aggregation is cheap.
//   - Testing pure functions is meaningfully cheaper than testing
//     against a real Postgres.
//   - If we ever need real scale, we can move this to a SQL CTE
//     or a materialized view without changing the response shape.

// ─── Input shape ────────────────────────────────────────────────

/** Subset of copilot_traces columns the aggregator needs.
 *  Decoupled from the API route's TraceListRow so the analytics
 *  module isn't pulled into the client bundle's API-route
 *  dependency graph. */
export interface AnalyticsInputRow {
  created_at: string;
  conversation_id: string;
  tool_calls: Array<{
    name: string;
    error: string | null;
    latency_ms: number;
  }>;
  model_provider: string | null;
  model_id: string | null;
}

// ─── Output shape ───────────────────────────────────────────────

export interface ToolStat {
  name: string;
  count: number;
  error_count: number;
  error_rate: number;
  mean_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
}

export interface ModelStat {
  provider: string;
  model_id: string;
  /** Turn count (one per row, not one per tool call). */
  count: number;
}

export interface AnalyticsSummary {
  total_turns: number;
  total_tool_calls: number;
  distinct_conversations: number;
  earliest_at: string | null;
  latest_at: string | null;
  /** Sorted by count desc. */
  by_tool: ToolStat[];
  /** Sorted by count desc. */
  by_model: ModelStat[];
}

// ─── Aggregation ────────────────────────────────────────────────

export function summarize(rows: AnalyticsInputRow[]): AnalyticsSummary {
  if (rows.length === 0) {
    return {
      total_turns: 0,
      total_tool_calls: 0,
      distinct_conversations: 0,
      earliest_at: null,
      latest_at: null,
      by_tool: [],
      by_model: [],
    };
  }

  // Per-tool latency buckets + error counts.
  const toolLatencies = new Map<string, number[]>();
  const toolErrors = new Map<string, number>();
  let totalToolCalls = 0;

  // Per-model turn counts.
  const modelKey = (p: string | null, m: string | null) => `${p ?? "?"}|${m ?? "?"}`;
  const modelCounts = new Map<string, ModelStat>();

  // Per-conversation dedup.
  const conversations = new Set<string>();

  // Created-at extremes.
  let earliest = rows[0].created_at;
  let latest = rows[0].created_at;

  for (const row of rows) {
    conversations.add(row.conversation_id);
    if (row.created_at < earliest) earliest = row.created_at;
    if (row.created_at > latest) latest = row.created_at;

    const mk = modelKey(row.model_provider, row.model_id);
    const existing = modelCounts.get(mk);
    if (existing) {
      existing.count += 1;
    } else {
      modelCounts.set(mk, {
        provider: row.model_provider ?? "?",
        model_id: row.model_id ?? "?",
        count: 1,
      });
    }

    for (const tc of row.tool_calls) {
      totalToolCalls += 1;
      const lat = toolLatencies.get(tc.name) ?? [];
      lat.push(tc.latency_ms);
      toolLatencies.set(tc.name, lat);
      if (tc.error !== null) {
        toolErrors.set(tc.name, (toolErrors.get(tc.name) ?? 0) + 1);
      }
    }
  }

  const by_tool: ToolStat[] = [];
  for (const [name, latencies] of toolLatencies.entries()) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((s, n) => s + n, 0);
    const errorCount = toolErrors.get(name) ?? 0;
    by_tool.push({
      name,
      count: sorted.length,
      error_count: errorCount,
      error_rate: sorted.length === 0 ? 0 : errorCount / sorted.length,
      mean_latency_ms: sum / sorted.length,
      p50_latency_ms: percentile(sorted, 0.5),
      p95_latency_ms: percentile(sorted, 0.95),
    });
  }
  by_tool.sort((a, b) => b.count - a.count);

  const by_model: ModelStat[] = [...modelCounts.values()].sort(
    (a, b) => b.count - a.count,
  );

  return {
    total_turns: rows.length,
    total_tool_calls: totalToolCalls,
    distinct_conversations: conversations.size,
    earliest_at: earliest,
    latest_at: latest,
    by_tool,
    by_model,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Compute a percentile from a pre-sorted ascending array.
 *  Returns 0 for empty arrays (defensive). Linear interpolation
 *  between adjacent samples — same shape as numpy's default. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}
