"use client";

// ─── FindCutsPanel ───────────────────────────────────────────────
//
// The "let the system pick" half of the redesigned PEARL DEFINE CUTS
// control. Collapses what used to be two separate tabs — Describe and
// Auto-solve — into ONE panel with a single button, because they were
// never really peers: "Describe" is just the natural-language front-end
// to the same solver "Auto-solve" runs. The founder's "Auto-solve — I
// have no idea what that does" was a direct symptom of that false split.
//
// One flow, one button ("FIND DEFENSIVE CUTS"):
//   • If the analyst typed a scenario  → route the prose to the copilot
//     (which injects shocks + runs solve_interdiction).
//   • If they didn't                   → run the minimax solver directly
//     against the shocks already in play.
//
// Both paths write the SAME store field (`lastInterdictionResult`), so a
// single <CopilotInterdictionResults> below renders the proposal either
// way — the analyst never has to learn the distinction.
//
// The budget / mode pills configure the direct-solve path; they are
// ignored on the copilot path (the copilot picks its own).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { solveInterdictionAsync } from "@/lib/interdiction-engine";

// Mirrors the solver's inline `mode` union (not exported from the engine).
type InterdictionMode = "edge" | "node" | "both";

const PLACEHOLDER_GEO =
  "Describe a scenario (optional) — e.g. “Hormuz transit drops 50% for 30 days”. Leave blank to solve against current shocks.";
const PLACEHOLDER_T1D =
  "Describe a scenario (optional) — e.g. “keep insulin-independence above 50% at 12 months”. Leave blank to solve against current shocks.";

export default function FindCutsPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const shocks = useApexStore((s) => s.shocks);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const setLastInterdictionResult = useApexStore(
    (s) => s.setLastInterdictionResult,
  );

  const [text, setText] = useState("");
  const [budget, setBudget] = useState(3);
  const [mode, setMode] = useState<InterdictionMode>("edge");
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const placeholder = useMemo(
    () =>
      selectedDomains.some((id) => id.startsWith("t1d-"))
        ? PLACEHOLDER_T1D
        : PLACEHOLDER_GEO,
    [selectedDomains],
  );

  const hasText = text.trim().length > 0;
  const canSolveLocally = shocks.length > 0;
  const canSubmit = hasText || canSolveLocally;

  // Abort any in-flight solve on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runLocalSolve = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setComputing(true);
    setProgress(0);
    try {
      const r = await solveInterdictionAsync(
        graphData,
        shocks,
        severedEdges,
        budget,
        mode,
        {
          signal: ctrl.signal,
          onProgress: (done, total) => {
            if (!ctrl.signal.aborted) {
              setProgress(total > 0 ? Math.min(1, done / total) : null);
            }
          },
        },
      );
      // Publish to the shared store field so the unified results panel
      // below renders it — identical to the copilot path's output.
      if (!ctrl.signal.aborted) setLastInterdictionResult(r);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        console.error("[FindCutsPanel] solver failed:", e);
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setComputing(false);
        setProgress(null);
      }
    }
  }, [graphData, shocks, severedEdges, budget, mode, setLastInterdictionResult]);

  const submitToCopilot = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      window.dispatchEvent(
        new CustomEvent("manifold:copilot-submit", {
          detail: { text: trimmed, source: "find-cuts" },
        }),
      );
      setText("");
    } finally {
      setTimeout(() => setSending(false), 250);
    }
  }, [text, sending]);

  const handleSubmit = useCallback(() => {
    if (hasText) submitToCopilot();
    else if (canSolveLocally) runLocalSolve();
  }, [hasText, canSolveLocally, submitToCopilot, runLocalSolve]);

  return (
    <div data-tour="find-cuts" className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full text-[9px] font-mono bg-surface border border-border rounded px-2 py-1.5 text-foreground leading-relaxed resize-none focus:outline-none focus:border-accent-amber/60"
      />

      {/* Direct-solve config (ignored on the copilot path). Wrapped so the
          pills never overflow the fixed 320px panel. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1">
          <span
            className="text-[8px] font-mono text-text-muted"
            title="Maximum number of cuts the solver may apply (1–5; skips 4 by design)"
          >
            BUDGET
          </span>
          {[1, 2, 3, 5].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBudget(b)}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors"
              style={{
                color: budget === b ? "var(--accent-amber)" : "var(--text-muted)",
                background: budget === b ? "rgba(255, 171, 0, 0.12)" : "transparent",
              }}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono text-text-muted" title="What the solver may cut">
            MODE
          </span>
          {(["edge", "node", "both"] as InterdictionMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors"
              style={{
                color: mode === m ? "var(--accent-amber)" : "var(--text-muted)",
                background: mode === m ? "rgba(255, 171, 0, 0.12)" : "transparent",
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || computing || sending}
        className="w-full px-3 py-2 rounded border text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-all disabled:opacity-30"
        style={{
          borderColor: "rgba(255, 171, 0, 0.4)",
          color: "var(--accent-amber)",
          background: computing ? "rgba(255, 171, 0, 0.15)" : "rgba(255, 171, 0, 0.05)",
        }}
      >
        {computing
          ? progress !== null
            ? `SOLVING… ${Math.round(progress * 100)}%`
            : "SOLVING…"
          : sending
            ? "SENDING…"
            : "FIND DEFENSIVE CUTS"}
      </button>

      <p className="text-[7px] font-mono text-text-muted/80 leading-snug">
        {hasText
          ? "Sends the scenario to the copilot — it injects shocks and solves."
          : canSolveLocally
            ? "Solves against the shocks already in play. Add a scenario above to set one up."
            : "Describe a scenario above to find defensive cuts."}
      </p>
    </div>
  );
}
