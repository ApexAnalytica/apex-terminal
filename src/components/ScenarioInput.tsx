"use client";

// ─── ScenarioInput ───────────────────────────────────────────────
//
// Natural-language entry point for interdiction. Lives at the top of
// the PEARL module. User describes a scenario ("Hormuz closes for 30
// days", "two top-tier suppliers fail simultaneously") in plain prose;
// the text is handed off to the copilot, which already knows how to
// parse a scenario, inject the appropriate shocks, and run
// `solve_interdiction` to surface candidate cuts.
//
// Design choice — why we don't duplicate the LLM path here.
//
// The copilot's `solve_interdiction` tool already does NL → shocks →
// solver → cuts end-to-end. Building a parallel pipeline here would
// fork that intelligence in two places. Instead we treat ScenarioInput
// as a *router*: it submits the prose into the copilot's conversation,
// then the user watches the result land both in the chat AND in the
// InterdictionPanel below (which subscribes to `lastInterdictionResult`).
//
// Two things this component does:
//   1. Adds the user's prose as a `CopilotMessage` so the copilot's
//      next streamed response is anchored to it.
//   2. Fires a `manifold:copilot-submit` window event with the prose.
//      `SystemCopilot` already listens for this kind of programmatic
//      submit; without coupling to its internal state we hand off the
//      whole NL pipeline cleanly.
//
// If the copilot isn't mounted (rare; it's a workspace-level component),
// the message still lands in the store and the user can open the copilot
// drawer to see it.

import { useState, useCallback, useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";

// Domain-aware example prose. The placeholder previously hardcoded a
// Hormuz scenario, which surfaced geopolitical framing inside T1D
// sessions even when the active graph was entirely β-cell / CGM
// nodes. We pick a profile-appropriate example so the user's first
// hint is in the right vocabulary. Same `t1d-` prefix check ModulePanel
// uses to avoid pulling domain-profiles into the critical-path bundle.
const PLACEHOLDER_GEOPOLITICAL =
  "e.g. “What happens if Hormuz transit drops 50% for 30 days?”\nThe copilot interprets the scenario, injects appropriate shocks, and proposes the cheapest defensive cuts.";
const PLACEHOLDER_T1D =
  "e.g. “Which edges should be cut to keep insulin-independence above 50% at 12 months?”\nThe copilot interprets the scenario, injects appropriate shocks, and proposes the cheapest defensive cuts.";

// `embedded` renders just the textarea + submit control, dropping the
// component's own header chip and footer explanation. The redesigned
// PEARL workspace supplies those via the shared SectionHeader (title +
// `?`), so printing them again here would duplicate the prose the
// redesign is trying to remove.
export default function ScenarioInput({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const placeholder = useMemo(
    () =>
      selectedDomains.some((id) => id.startsWith("t1d-"))
        ? PLACEHOLDER_T1D
        : PLACEHOLDER_GEOPOLITICAL,
    [selectedDomains],
  );

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      // Hand the prose to SystemCopilot via a window event. The
      // listener there records the user message AND triggers the
      // streaming response — keeping all conversation bookkeeping in
      // one place. We don't touch the store directly so we can't
      // accidentally double-add the message.
      const evt = new CustomEvent("manifold:copilot-submit", {
        detail: { text: trimmed, source: "scenario-input" },
      });
      window.dispatchEvent(evt);
      setText("");
    } finally {
      // Brief disable so a fast double-click doesn't double-fire.
      setTimeout(() => setBusy(false), 250);
    }
  }, [text, busy]);

  return (
    <div
      data-tour="scenario-input"
      className={
        embedded
          ? "space-y-2"
          : "border border-accent-amber/30 rounded bg-accent-amber/5 p-3 space-y-2"
      }
    >
      {!embedded && (
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
            SCENARIO {"→"} INTERDICTION
          </span>
          <span className="text-[7px] font-mono text-text-muted">
            natural language
          </span>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl-Enter submits — common UX for chat-style fields.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full text-[9px] font-mono bg-surface border border-border rounded px-2 py-1.5 text-foreground leading-relaxed resize-none focus:outline-none focus:border-accent-amber/60"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[7px] font-mono text-text-muted/70">
          {text.length > 0
            ? `${text.trim().split(/\s+/).filter(Boolean).length} word${text.trim().split(/\s+/).filter(Boolean).length === 1 ? "" : "s"}`
            : "⌘/Ctrl-Enter to submit"}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length === 0}
          className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-accent-amber/60 text-accent-amber hover:bg-accent-amber/10"
        >
          {busy ? "SUBMITTING…" : "RUN INTERDICTION"}
        </button>
      </div>
      {!embedded && (
        <div className="text-[7px] font-mono text-text-muted/80 leading-relaxed">
          Routes to the copilot, which parses the prose, injects shocks,
          runs the solver, and returns candidate cuts in the panel below.
        </div>
      )}
    </div>
  );
}
