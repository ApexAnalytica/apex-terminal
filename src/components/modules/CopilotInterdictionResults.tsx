"use client";

// Extracted from ModulePanel.tsx so the Pearl tab's UI ships as its own
// chunk and doesn't weigh down the default Spirtes-tab paint. Pure
// extraction — no behavioural changes — see PR history for the original
// inline definition.

import { useCallback, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { explainIntervention } from "@/lib/interdiction-explain";

function CopilotInterdictionResults() {
  const lastResult = useApexStore((s) => s.lastInterdictionResult);
  const severEdge = useApexStore((s) => s.severEdge);
  const toggleAblatedNode = useApexStore((s) => s.toggleAblatedNode);
  // Graph + multi-selection store hooks for the "ISOLATE AFFECTED"
  // affordance below: when the scenario interdiction returns cuts,
  // the user wants to drill into just the affected nodes — same way
  // the lasso ISOLATE button works on a marquee selection. We pull
  // the affected node ids out of `lastResult.interventions` (target.id
  // for node-type cuts; both edge endpoints for edge-type cuts), then
  // write them into `selectedNodes` + flip `isolateSelection`. The
  // existing canvas isolate machinery does the rest, identically
  // across 3D / 2D / Map / Relief.
  const graphData = useApexStore((s) => s.graphData);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const setIsolateSelection = useApexStore((s) => s.setIsolateSelection);
  // startAblationReplay reruns the cascade simulator against the
  // current severed-edge + ablated-node set and flips replay into
  // playing state. Wired into the new APPLY ALL & SIMULATE button so
  // the scenario → cuts → impact loop runs as one motion instead of
  // the analyst having to chase down a separate Start Replay control.
  const startAblationReplay = useApexStore((s) => s.startAblationReplay);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  // Index of the row currently expanded into its "WHY THIS CUT?"
  // narrative, or null for "all collapsed". Single-expansion (not
  // multi) so the card stays compact; opening a new row collapses
  // the prior expansion. Defensibility matters more than visual
  // density here — commercial buyers click WHY? to read prose,
  // they don't compare three explanations at once.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Affected node set. Memoised on the interdiction result + graph
  // edge list so toggling isolate doesn't recompute it. Edge-cut
  // interventions contribute BOTH endpoints — severing X → Y
  // functionally affects both vertices' neighbourhoods.
  const affectedNodeIds = useMemo(() => {
    if (!lastResult) return [] as string[];
    const ids = new Set<string>();
    for (const iv of lastResult.interventions) {
      if (iv.target.type === "node") {
        ids.add(iv.target.id);
      } else if (iv.target.type === "edge") {
        const edge = graphData.edges.find((e) => e.id === iv.target.id);
        if (edge) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
    }
    return Array.from(ids);
  }, [lastResult, graphData.edges]);

  // Apply every intervention in the result and immediately kick off
  // cascade replay so the analyst sees propagation against the new
  // cut set without a second click. Edge cuts flow through severEdge
  // (idempotent — skipped if already severed); node cuts flow through
  // toggleAblatedNode but we gate on the current ablated set so a
  // double-tap of APPLY ALL & SIMULATE doesn't un-ablate something
  // that was already cut. After the writes, startAblationReplay() runs
  // simulateCascadeAsync against the merged state and flips replay on.
  const applyAllAndSimulate = useCallback(() => {
    if (!lastResult) return;
    const ablatedSet = new Set(ablatedNodeIds);
    const severedSet = new Set(severedEdges);
    const newlyApplied: string[] = [];
    for (const iv of lastResult.interventions) {
      if (iv.target.type === "edge") {
        if (!severedSet.has(iv.target.id)) {
          severEdge(iv.target.id);
          newlyApplied.push(iv.target.id);
        }
      } else if (iv.target.type === "node") {
        if (!ablatedSet.has(iv.target.id)) {
          toggleAblatedNode(iv.target.id);
          newlyApplied.push(iv.target.id);
        }
      }
    }
    setAppliedIds((prev) => {
      const next = new Set(prev);
      for (const iv of lastResult.interventions) next.add(iv.target.id);
      return next;
    });
    // Always kick off replay — even if every cut was already applied,
    // re-running the cascade is what the analyst expects from a button
    // labelled "& SIMULATE". The store wipes interventionEpochs first
    // so the badges/pulses restart from epoch 0.
    startAblationReplay();
    return newlyApplied;
  }, [
    lastResult,
    ablatedNodeIds,
    severedEdges,
    severEdge,
    toggleAblatedNode,
    startAblationReplay,
  ]);

  if (!lastResult) return null;

  const hasInterventions = lastResult.interventions.length > 0;
  const isFallback = Boolean(lastResult.fallbackReason);
  // When the cuts came from the structural-vulnerability fallback, the
  // marginalReduction field holds a proxy score (edge weight × 10 or ΩF),
  // not a true damage delta — label it accordingly so the UI doesn't
  // claim "saves X pts" when the solver didn't actually measure that.
  const rankLabel = isFallback ? "score" : "saves";
  const rankUnit = isFallback ? "" : "pts";

  return (
    <div className="border border-accent-amber/30 rounded bg-accent-amber/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
          {isFallback ? "STRUCTURAL VULNERABILITY CUTS" : "INTERDICTION RESULTS"}
        </span>
        <div className="flex items-center gap-2">
          {/* APPLY ALL & SIMULATE — one-click closure of the scenario
              → cuts → impact loop. Applies every recommended cut
              (idempotent, so re-clicks don't un-ablate) and then
              kicks off cascade replay so the analyst sees propagation
              + the MC fan reacts without chasing a separate Start
              Replay button. Hidden when there are no interventions
              (e.g. the solver's empty-cuts edge case). */}
          {hasInterventions && (
            <button
              onClick={applyAllAndSimulate}
              className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-0.5 rounded border transition-colors border-accent-amber/60 text-accent-amber bg-accent-amber/10 hover:bg-accent-amber/20"
              title="Apply every recommended cut and immediately run cascade replay against the new cut set. Sees propagation in real time; the MC forecast updates automatically."
            >
              APPLY ALL &amp; SIMULATE
            </button>
          )}
          {/* ISOLATE AFFECTED — mirrors the lasso panel's ISOLATE
              button, bootstrapped from the interdiction's affected node
              set instead of a marquee drag. When toggled on, the
              canvas across every view (3D / 2D / Map / Relief) filters
              to just the affected nodes so the analyst can examine
              "which ones are reflected" without losing them in the
              field of 192 orbs. Toggling off keeps the selection
              populated so the user can re-isolate without recomputing. */}
          {affectedNodeIds.length > 0 && (
            <button
              onClick={() => {
                if (isolateSelection) {
                  setIsolateSelection(false);
                } else {
                  setSelectedNodes(affectedNodeIds);
                  setIsolateSelection(true);
                }
              }}
              className={`text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-0.5 rounded border transition-colors ${
                isolateSelection
                  ? "border-accent-amber/60 text-accent-amber bg-accent-amber/10"
                  : "border-border text-text-muted hover:text-accent-amber hover:border-accent-amber/40"
              }`}
              title={
                isolateSelection
                  ? "Show all nodes again. The affected set stays selected so you can re-isolate later."
                  : `Hide non-affected nodes across every view (${affectedNodeIds.length} node${affectedNodeIds.length === 1 ? "" : "s"} affected by the proposed cuts).`
              }
            >
              {isolateSelection ? "SHOW ALL" : "ISOLATE AFFECTED"}
            </button>
          )}
          <button
            onClick={() => useApexStore.getState().setLastInterdictionResult(null)}
            className="text-[7px] font-mono text-text-muted hover:text-accent-red transition-colors"
          >
            DISMISS
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-[8px] font-mono">
        <div>
          <span className="text-text-muted">BASELINE </span>
          <span className="text-accent-red">{lastResult.baselineDamage.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-text-muted">OPTIMAL </span>
          <span className="text-accent-green">{lastResult.bestDamage.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-text-muted">REDUCTION </span>
          <span className="text-accent-amber">{lastResult.reductionPct.toFixed(0)}%</span>
        </div>
      </div>

      {isFallback && lastResult.fallbackReason && (
        <div className="text-[7px] font-mono text-text-muted italic leading-relaxed border-l-2 border-accent-amber/30 pl-2">
          {lastResult.fallbackReason}
        </div>
      )}

      {hasInterventions ? (
        <div className="space-y-1.5">
          {lastResult.interventions.map((iv, i) => {
            const isApplied = appliedIds.has(iv.target.id);
            const actionLabel = iv.target.type === "edge" ? "SEVER" : "ABLATE";
            const appliedLabel = iv.target.type === "edge" ? "SEVERED" : "ABLATED";
            const isExpanded = expandedIndex === i;
            // Greedy-walk + mechanism narrative for this cut. The
            // fallback (structural-vulnerability) path uses proxy
            // scores instead of real marginal damage deltas, so the
            // "Worst-case damage X → Y" line would be misleading
            // there — suppress the WHY? affordance for that case.
            const explanation =
              !isFallback ? explainIntervention(lastResult, i, graphData) : null;
            return (
              <div
                key={iv.target.id}
                className="rounded border border-border bg-surface-elevated"
              >
                <div className="flex items-center gap-2 p-1.5">
                  <span className="text-[8px] font-mono text-accent-cyan w-4 shrink-0">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[8px] font-mono text-foreground truncate">{iv.target.label}</div>
                    <div className="text-[7px] font-mono text-text-muted">
                      {iv.target.type} — {rankLabel} {iv.marginalReduction.toFixed(1)}{rankUnit}
                    </div>
                  </div>
                  {/* WHY THIS CUT? — expands a per-row narrative
                      block underneath. Pure read affordance; doesn't
                      modify any store state. Hidden on the fallback
                      path (proxy scores, not real damage deltas).
                      Single-expansion: opening one collapses any
                      other open row to keep the card compact. */}
                  {explanation && (
                    <button
                      onClick={() =>
                        setExpandedIndex(isExpanded ? null : i)
                      }
                      className={`px-1.5 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors shrink-0 border ${
                        isExpanded
                          ? "border-accent-cyan/40 text-accent-cyan bg-accent-cyan/5"
                          : "border-border text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40"
                      }`}
                      title={isExpanded ? "Hide explanation" : "Why was this cut recommended?"}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "HIDE" : "WHY?"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (isApplied) return;
                      if (iv.target.type === "edge") {
                        severEdge(iv.target.id);
                      } else {
                        toggleAblatedNode(iv.target.id);
                      }
                      setAppliedIds((prev) => new Set([...prev, iv.target.id]));
                    }}
                    disabled={isApplied}
                    className={`px-2 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors shrink-0 ${
                      isApplied
                        ? "text-accent-green border border-accent-green/30 bg-accent-green/5"
                        : "text-accent-red border border-accent-red/30 hover:bg-accent-red/10"
                    }`}
                  >
                    {isApplied ? appliedLabel : actionLabel}
                  </button>
                </div>
                {/* Expanded narrative block — three paragraphs:
                    rank (where this cut sits in the greedy walk),
                    damage delta (before / after / % reduction this
                    step contributes), and mechanism (what this cut
                    actually does, sourced from the edge's
                    physicalMechanism field or the node's
                    incoming/outgoing degree). Renders only when
                    `expandedIndex === i` and an explanation was
                    computed (i.e. not the fallback path). */}
                {isExpanded && explanation && (
                  <div className="border-t border-border/40 px-2 py-1.5 space-y-1.5 bg-surface/30">
                    <div className="text-[7px] font-mono text-text-muted leading-relaxed">
                      <span className="text-accent-amber">RANK </span>
                      {explanation.rank}
                    </div>
                    <div className="text-[7px] font-mono text-text-muted leading-relaxed">
                      <span className="text-accent-amber">DAMAGE </span>
                      {explanation.damageDelta}
                    </div>
                    <div className="text-[7px] font-mono text-text-muted leading-relaxed space-y-0.5">
                      <div>
                        <span className="text-accent-amber">MECHANISM</span>
                      </div>
                      {explanation.mechanism.map((line, j) => (
                        <div key={j}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[8px] font-mono text-text-muted">
          No candidate cuts available. Inject a shock and/or widen the domain scope, then re-run the solver.
        </div>
      )}
    </div>
  );
}

// Visual icon components for axiom categories

export default CopilotInterdictionResults;
