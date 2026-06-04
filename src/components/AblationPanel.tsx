"use client";

// ─── AblationPanel ───────────────────────────────────────────────
//
// Surfaces the existing ablation store machinery as an explicit panel
// in PEARL. Before this component, the only way to discover ablation
// was to know that clicking a node in "ablation mode" toggles it on
// the canvas. Most users never found it.
//
// What this exposes
// -----------------
//   - Current ablation set (count of nodes / edges)
//   - ABLATION MODE toggle (enables canvas click-to-toggle)
//   - RESET — clears all ablations
//   - RUN CASCADE — calls startAblationReplay() to play the cascade
//     against the ablated graph; replay surfaces in the existing
//     TimeDial machinery.
//
// All store actions are pre-existing (setAblationMode,
// toggleAblatedNode, toggleAblatedEdge, resetAblation,
// startAblationReplay). This panel is pure surfacing — no new logic.
//
// Distinction from INTERDICTION (the panel directly below in PEARL):
//   ABLATION   = user's discretionary cuts. "I want to test what
//                happens if I cut these specific edges/nodes."
//   INTERDICTION = system's suggested cuts. "Given this scenario,
//                  here are the cheapest cuts that minimise damage."
//
// Both apply to the same graph and feed the same cascade simulator;
// they differ only in who chose the cuts.

import { useApexStore } from "@/stores/useApexStore";

// `embedded` drops the panel's own header (title + cut count) and the
// inline how-to paragraph; in the redesigned PEARL workspace the shared
// SectionHeader carries the title, the cut count, and the how-to behind
// a `?`. The action buttons keep their own `title` tooltips either way.
export default function AblationPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const ablationMode = useApexStore((s) => s.ablationMode);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const ablatedEdgeIds = useApexStore((s) => s.ablatedEdgeIds);
  const setAblationMode = useApexStore((s) => s.setAblationMode);
  const resetAblation = useApexStore((s) => s.resetAblation);
  const startAblationReplay = useApexStore((s) => s.startAblationReplay);

  const nNodes = ablatedNodeIds.length;
  const nEdges = ablatedEdgeIds.length;
  const total = nNodes + nEdges;
  const hasAblations = total > 0;

  return (
    <div
      data-tour="ablation-panel"
      className={
        embedded
          ? "space-y-2"
          : "border border-accent-cyan/30 rounded bg-accent-cyan/5 p-3 space-y-2"
      }
    >
      {!embedded && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
              ABLATION {"—"} MANUAL CUTS
            </span>
            <span className="text-[7px] font-mono text-text-muted">
              {hasAblations ? `${nNodes} node${nNodes === 1 ? "" : "s"} · ${nEdges} edge${nEdges === 1 ? "" : "s"}` : "no cuts"}
            </span>
          </div>

          <div className="text-[8px] font-mono text-text-muted leading-relaxed">
            Pick nodes or edges to delete from the cascade. Toggle ABLATION MODE on, then click any node or edge on the canvas to add it to the cut set. Run the cascade to see what changes.
          </div>
        </>
      )}

      {/* Embedded in the redesigned PEARL Manual tab: that tab auto-enters
          ablation mode (PearlWorkspace effect), so the explicit ENTER/EXIT
          button is redundant here — replace it with a live status hint. */}
      {embedded && (
        <div
          className="text-[8px] font-mono leading-snug"
          style={{
            color: ablationMode ? "var(--accent-cyan)" : "var(--text-muted)",
          }}
        >
          {ablationMode
            ? "Canvas is live — click any node or edge to cut it, then Run cascade below."
            : "Switch to this tab to start selecting nodes / edges on the canvas."}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!embedded && (
        <button
          type="button"
          onClick={() => setAblationMode(!ablationMode)}
          className={`text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border transition-colors ${
            ablationMode
              ? "border-accent-cyan text-accent-cyan bg-accent-cyan/15"
              : "border-border text-text-muted hover:border-accent-cyan/60 hover:text-accent-cyan"
          }`}
          title={
            ablationMode
              ? "Click again to leave ablation mode (canvas clicks return to normal selection)"
              : "Click to enter ablation mode — then click nodes / edges on the canvas to mark them for removal"
          }
        >
          {ablationMode ? "EXIT ABLATION MODE" : "ENTER ABLATION MODE"}
        </button>
        )}

        <button
          type="button"
          onClick={resetAblation}
          disabled={!hasAblations}
          className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border border-border text-text-muted hover:border-accent-red/60 hover:text-accent-red transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          RESET
        </button>

        <button
          type="button"
          onClick={startAblationReplay}
          disabled={!hasAblations}
          className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border border-accent-cyan/60 text-accent-cyan hover:bg-accent-cyan/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            hasAblations
              ? "Run the cascade with these ablations applied — replay opens in the TimeDial header"
              : "Add at least one ablation before running"
          }
        >
          RUN CASCADE
        </button>
      </div>
    </div>
  );
}
