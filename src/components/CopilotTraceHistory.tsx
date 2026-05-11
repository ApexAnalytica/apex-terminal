"use client";

// ─── Copilot Trace History ──────────────────────────────────────
//
// Browse the authenticated user's recent copilot turns. Reads
// from /api/copilot/traces, which is RLS-protected — the server
// route only ever returns rows where auth.uid() = user_id.
//
// Surface goal: close the loop on the trace store. Today the data
// exists but you can only see it via SQL. With this panel you can
// scan recent turns, expand to see params + results, and (in a
// follow-up) one-click a turn into the eval seed set.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TraceListRow } from "@/app/api/copilot/traces/route";
import CopilotEvalCaseExporter from "@/components/CopilotEvalCaseExporter";
import CopilotTraceStats from "@/components/CopilotTraceStats";

type Tab = "list" | "stats";

interface Props {
  /** When true, fetch fresh on mount and on every reopen. */
  open: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; traces: TraceListRow[] }
  | { kind: "error"; message: string };

export default function CopilotTraceHistory({ open }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("list");

  useEffect(() => {
    // Only fetch the per-row list when its tab is showing — the
    // stats tab fetches its own data through CopilotTraceStats.
    if (!open || tab !== "list") return;
    let cancelled = false;
    // Wrap in an async IIFE so all setState calls happen inside
    // the awaited microtask, never synchronously in the effect
    // body (react-hooks/set-state-in-effect).
    void (async () => {
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/copilot/traces", {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { traces: TraceListRow[] };
        if (!cancelled) setState({ kind: "loaded", traces: data.traces });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  if (!open) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider">
          <TabButton active={tab === "list"} onClick={() => setTab("list")}>
            LIST
          </TabButton>
          <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
            STATS
          </TabButton>
        </div>
        {tab === "list" && state.kind === "loaded" && (
          <span className="text-[8px] font-mono text-text-muted/60 tracking-wider">
            {state.traces.length === 0
              ? "no rows"
              : `${state.traces.length} turn${state.traces.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {tab === "list" && (
        <>
          {state.kind === "loading" && (
            <div className="text-[10px] font-mono text-text-muted">Loading…</div>
          )}
          {state.kind === "error" && (
            <div className="text-[10px] font-mono text-accent-amber">
              Couldn&apos;t load history: {state.message}
            </div>
          )}
          {state.kind === "loaded" && state.traces.length === 0 && (
            <div className="text-[10px] font-mono text-text-muted leading-relaxed">
              No turns yet. Send a message to the copilot — it&apos;ll appear here.
            </div>
          )}
          {state.kind === "loaded" && state.traces.length > 0 && (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {state.traces.map((trace) => (
                <TraceRow
                  key={trace.id}
                  trace={trace}
                  expanded={expanded === trace.id}
                  onToggle={() => setExpanded(expanded === trace.id ? null : trace.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "stats" && <CopilotTraceStats open />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded transition-colors"
      style={{
        color: active ? "var(--accent-cyan)" : "var(--text-muted)",
        backgroundColor: active ? "rgba(0,229,255,0.08)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

// ─── Single row ─────────────────────────────────────────────────

function TraceRow({
  trace,
  expanded,
  onToggle,
}: {
  trace: TraceListRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const ts = new Date(trace.created_at);
  const tsLabel = `${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const userPreview = (trace.user_message ?? "").slice(0, 80) || "(no user message)";
  const nTools = trace.tool_calls.length;
  const provider = trace.model_provider ?? "?";

  return (
    <div className="rounded border border-border bg-surface text-[10px] font-mono">
      <button
        onClick={onToggle}
        className="w-full text-left px-2 py-1.5 flex items-start gap-2 hover:bg-surface-elevated transition-colors"
      >
        <span className="text-text-muted/60 shrink-0 w-[72px]">{tsLabel}</span>
        <span className="flex-1 text-foreground leading-snug truncate">{userPreview}</span>
        <span className="shrink-0 text-text-muted/60 flex items-center gap-1">
          <span className="text-accent-cyan">{provider}</span>
          {nTools > 0 && <span className="text-accent-green">·{nTools}🔧</span>}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            <div className="px-2 py-1.5 border-t border-border space-y-1.5">
              <Block label="user">{trace.user_message ?? "(none)"}</Block>
              <Block label="assistant">
                {(trace.display_text ?? trace.assistant_message ?? "(none)").slice(0, 800)}
                {(trace.display_text ?? trace.assistant_message ?? "").length > 800 && "…"}
              </Block>
              {trace.tool_calls.length > 0 && (
                <div>
                  <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-0.5">
                    TOOL CALLS
                  </div>
                  <ul className="space-y-1">
                    {trace.tool_calls.map((tc, i) => (
                      <li key={i} className="bg-surface-elevated rounded px-1.5 py-1">
                        <div className="flex items-center justify-between">
                          <span className={tc.error ? "text-accent-amber" : "text-accent-green"}>
                            {tc.name}
                          </span>
                          <span className="text-text-muted/60 text-[9px]">
                            {tc.latency_ms}ms
                          </span>
                        </div>
                        {Object.keys(tc.params).length > 0 && (
                          <div className="text-text-muted/80 text-[9px] truncate">
                            {JSON.stringify(tc.params)}
                          </div>
                        )}
                        {tc.error && (
                          <div className="text-accent-amber text-[9px] truncate">{tc.error}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-3 text-[9px] text-text-muted/60 pt-1 items-center">
                {trace.model_id && <span>{trace.model_id}</span>}
                {trace.dataset && <span>dataset: {trace.dataset}</span>}
                {trace.active_module && <span>module: {trace.active_module}</span>}
                <span className="flex-1" />
                {!exporting && (
                  <button
                    onClick={() => setExporting(true)}
                    className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:text-foreground transition-colors"
                    title="Generate a TestCase TS snippet for src/lib/copilot/eval/cases/seed.ts"
                  >
                    + EVAL CASE
                  </button>
                )}
              </div>

              {exporting && (
                <CopilotEvalCaseExporter
                  trace={{
                    user_message: trace.user_message,
                    tool_calls: trace.tool_calls,
                  }}
                  onClose={() => setExporting(false)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-0.5">
        {label.toUpperCase()}
      </div>
      <div className="text-text-muted leading-snug whitespace-pre-wrap">{children}</div>
    </div>
  );
}
