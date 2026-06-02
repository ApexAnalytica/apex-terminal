"use client";

/**
 * DemoFlowPlayer — guided, end-to-end analyst walkthrough.
 *
 * Interprets a DemoFlow (see src/lib/demo-flows.ts) as a sequence of steps,
 * each of which can: switch the active module tab, spotlight nodes on the
 * canvas, and run imperative `actions` against the real store — inject a
 * shock, run the baseline cascade, run the interdiction solver, apply its
 * recommended cut and branch a counterfactual timeline. The final step
 * renders a live before/after payoff card read straight from the engine
 * output.
 *
 * Each step's actions run at most once (executedRef), so Back/Next can't
 * double-inject a shock or re-run a solve. Async actions are awaited before
 * the step's dwell timer starts, so the narrative never races the engine.
 *
 * Mounted at the app root; visibility is driven by `activeDemoFlowId`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { buildGraphFromDomains } from "@/lib/build-domain-graph";
import {
  computeDemoPayoff,
  FLOWS,
  getFlowById,
  type DemoFlow,
  type DemoFlowStep,
  type DemoPayoff,
} from "@/lib/demo-flows";
import { getStatusColor } from "@/lib/omega-engine";
import type { CausalGraph, CausalShock, EpochSnapshot, ModuleId } from "@/lib/types";
import { useApexStore } from "@/stores/useApexStore";

interface PlayerProps {
  flowId: string;
  onClose: () => void;
}

interface PriorState {
  selectedDomains: string[];
  graphData: CausalGraph;
  selectedNodes: string[];
  activeModule: ModuleId;
}

/** Poll a predicate until true or timeout. Used to await async store
 *  populations (baselineEpochs / interventionEpochs landing). */
function waitFor(
  predicate: () => boolean,
  timeoutMs = 9000,
  intervalMs = 80,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (predicate()) return resolve(true);
    const start = performance.now();
    const id = window.setInterval(() => {
      if (predicate()) {
        window.clearInterval(id);
        resolve(true);
      } else if (performance.now() - start > timeoutMs) {
        window.clearInterval(id);
        resolve(false);
      }
    }, intervalMs);
  });
}

/** Index of the most-critical frame (lowest Ω-buffer). */
function peakEpochIndex(epochs: EpochSnapshot[]): number {
  if (epochs.length === 0) return 0;
  let idx = 0;
  let worst = Infinity;
  for (let i = 0; i < epochs.length; i++) {
    if (epochs[i].omegaBuffer < worst) {
      worst = epochs[i].omegaBuffer;
      idx = i;
    }
  }
  return idx;
}

function Player({ flowId, onClose }: PlayerProps) {
  const flow = useMemo(() => getFlowById(flowId), [flowId]);

  // Store actions (stable references from zustand).
  const setActiveModule = useApexStore((s) => s.setActiveModule);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);
  const setSelectedDomains = useApexStore((s) => s.setSelectedDomains);
  const setGraphData = useApexStore((s) => s.setGraphData);

  // Live engine state for the payoff card.
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const lastInterdictionResult = useApexStore((s) => s.lastInterdictionResult);

  const priorRef = useRef<PriorState | null>(null);
  const injectedShockIdsRef = useRef<string[]>([]);
  const executedRef = useRef<Set<number>>(new Set());
  const [stepIdx, setStepIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── On mount: capture prior state, load the flow's graph + domains ──
  useEffect(() => {
    if (!flow) return;
    const store = useApexStore.getState();
    priorRef.current = {
      selectedDomains: [...store.selectedDomains],
      graphData: store.graphData,
      selectedNodes: [...store.selectedNodes],
      activeModule: store.activeModule,
    };
    const merged = buildGraphFromDomains(flow.domainIds);
    setGraphData(merged);
    setSelectedDomains(flow.domainIds);

    const injectedShockIds = injectedShockIdsRef.current;
    return () => {
      // Cleanup on unmount: stop the cascade, clear demo shocks + cuts +
      // solver result, restore prior graph/domains/selection/module.
      const s = useApexStore.getState();
      s.stopReplay();
      for (const id of injectedShockIds) s.removeShock(id);
      injectedShockIdsRef.current = [];
      // resetSeveredEdges() also resets graphData to initialGraph, so call
      // it FIRST and then restore the prior graph on top of it.
      s.resetSeveredEdges();
      s.setLastInterdictionResult(null);
      if (priorRef.current) {
        s.setGraphData(priorRef.current.graphData);
        s.setSelectedDomains(priorRef.current.selectedDomains);
        s.setSelectedNodes(priorRef.current.selectedNodes);
        s.setActiveModule(priorRef.current.activeModule);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  // ── Run a single action against the store; awaits async ones ──
  const runAction = useCallback(
    async (
      action: NonNullable<DemoFlowStep["actions"]>[number],
      idx: number,
    ): Promise<void> => {
      const s = useApexStore.getState();
      switch (action.type) {
        case "shock": {
          const shock: CausalShock = {
            ...action.shock,
            id: `demo-${flowId}-${idx}`,
          };
          if (!injectedShockIdsRef.current.includes(shock.id)) {
            injectedShockIdsRef.current.push(shock.id);
          }
          s.addShock(shock);
          break;
        }
        case "replay": {
          s.startReplay();
          await waitFor(() => useApexStore.getState().baselineEpochs.length > 0);
          break;
        }
        case "gotoEpoch": {
          const cur = useApexStore.getState();
          const epochs =
            cur.activeTimeline === "baseline"
              ? cur.baselineEpochs
              : cur.interventionEpochs;
          let target = 0;
          if (action.epoch === "last") target = epochs.length - 1;
          else if (action.epoch === "peak") target = peakEpochIndex(epochs);
          else target = action.epoch;
          cur.setReplayPlaying(false);
          cur.setCurrentEpoch(target);
          break;
        }
        case "solveInterdiction": {
          const cur = useApexStore.getState();
          const { solveInterdictionAsync } = await import("@/lib/interdiction-engine");
          const result = await solveInterdictionAsync(
            cur.graphData,
            cur.shocks,
            cur.severedEdges,
            action.budget ?? 1,
            action.mode ?? "edge",
          );
          useApexStore.getState().setLastInterdictionResult(result);
          break;
        }
        case "applyAndBranch": {
          const cur = useApexStore.getState();
          const result = cur.lastInterdictionResult;
          const maxCuts = action.maxCuts ?? 1;
          if (result) {
            result.interventions
              .filter((i) => i.target.type === "edge")
              .slice(0, maxCuts)
              .forEach((i) => cur.severEdge(i.target.id));
          }
          cur.setCurrentEpoch(action.branchEpoch ?? 1);
          cur.branchFromCurrentEpoch();
          await waitFor(
            () => useApexStore.getState().interventionEpochs.length > 0,
          );
          break;
        }
        case "timeline": {
          useApexStore.getState().setActiveTimeline(action.timeline);
          break;
        }
      }
    },
    [flowId],
  );

  // ── On each step: switch module + highlight, then run actions once ──
  useEffect(() => {
    if (!flow) return;
    const step = flow.steps[stepIdx];
    if (!step) return;

    if (step.module) setActiveModule(step.module);
    setSelectedNodes(step.highlightNodeIds ?? []);

    // Actions run at most once per step index.
    if (executedRef.current.has(stepIdx) || !step.actions?.length) return;
    executedRef.current.add(stepIdx);

    let cancelled = false;
    setBusy(true);
    (async () => {
      for (const action of step.actions ?? []) {
        if (cancelled) return;
        await runAction(action, stepIdx);
      }
      if (!cancelled) setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [flow, stepIdx, setActiveModule, setSelectedNodes, runAction]);

  // ── Auto-advance once actions have settled (and not paused) ──
  useEffect(() => {
    if (!flow || paused || busy) return;
    const step = flow.steps[stepIdx];
    if (!step || step.durationMs <= 0) return;
    if (stepIdx >= flow.steps.length - 1) return;
    const t = window.setTimeout(
      () => setStepIdx((i) => Math.min(flow.steps.length - 1, i + 1)),
      step.durationMs,
    );
    return () => window.clearTimeout(t);
  }, [flow, stepIdx, paused, busy]);

  const payoff = useMemo<DemoPayoff | null>(() => {
    const step = flow?.steps[stepIdx];
    if (!step?.payoff) return null;
    return computeDemoPayoff(baselineEpochs, interventionEpochs, lastInterdictionResult);
  }, [flow, stepIdx, baselineEpochs, interventionEpochs, lastInterdictionResult]);

  if (!flow) return null;
  const step = flow.steps[stepIdx];
  const isLastStep = stepIdx === flow.steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      role="dialog"
      aria-label={`Demo: ${flow.title}`}
      data-tour-block
    >
      {/* Top progress bar + title */}
      <div className="pointer-events-auto absolute top-0 left-0 right-0 px-4 py-3 bg-bg-1/95 border-b border-accent-cyan/40 backdrop-blur">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
            DEMO
          </div>
          <div className="text-xs font-[family-name:var(--font-michroma)] text-text-primary truncate">
            {flow.title}
          </div>
          <div className="text-[10px] font-mono text-text-muted">
            {stepIdx + 1} / {flow.steps.length}
          </div>
          {step.module && (
            <div className="hidden sm:block text-[9px] font-[family-name:var(--font-michroma)] tracking-widest text-accent-cyan/70 uppercase">
              {step.module}
            </div>
          )}
          {busy && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-accent-amber">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
              RUNNING
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              disabled={busy}
              className="text-[10px] font-mono text-text-muted hover:text-accent-cyan px-2 py-0.5 border border-border rounded disabled:opacity-40"
              aria-label={paused ? "Resume demo" : "Pause demo"}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              onClick={onClose}
              className="text-[10px] font-mono text-text-muted hover:text-accent-red px-2 py-0.5 border border-border rounded"
              aria-label="Exit demo"
            >
              ✕ Exit
            </button>
          </div>
        </div>
        {/* Step progress dots */}
        <div className="flex gap-1">
          {flow.steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors ${
                i < stepIdx
                  ? "bg-accent-cyan/70"
                  : i === stepIdx
                    ? "bg-accent-cyan"
                    : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Narrative + payoff card — bottom-center */}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[calc(100%-3rem)] bg-bg-1/95 border border-accent-cyan/40 rounded p-4 backdrop-blur shadow-2xl">
        {payoff && <PayoffCard payoff={payoff} />}
        <p className="text-sm leading-relaxed text-text-primary">{step.narrative}</p>
        <div className="flex items-center justify-between mt-3">
          <div className="text-[9px] font-mono text-text-muted">
            {step.highlightNodeIds && step.highlightNodeIds.length > 0
              ? `Watching: ${step.highlightNodeIds.slice(0, 3).join(", ")}${
                  step.highlightNodeIds.length > 3 ? "…" : ""
                }`
              : ""}
          </div>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                disabled={busy}
                className="text-[10px] font-mono text-text-muted hover:text-accent-cyan px-3 py-1 border border-border rounded disabled:opacity-40"
              >
                ← Back
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={onClose}
                className="text-[10px] font-mono text-accent-cyan hover:text-accent-cyan/80 px-3 py-1 border border-accent-cyan/60 rounded"
              >
                Finish demo
              </button>
            ) : (
              <button
                onClick={() =>
                  setStepIdx((i) => Math.min(flow.steps.length - 1, i + 1))
                }
                disabled={busy}
                className="text-[10px] font-mono text-accent-cyan hover:text-accent-cyan/80 px-3 py-1 border border-accent-cyan/60 rounded disabled:opacity-40"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The before/after results card on the final step. All numbers read live
 *  from the engine output (cascade epochs + interdiction solver). */
function PayoffCard({ payoff }: { payoff: DemoPayoff }) {
  const { interdiction, baseline, intervention, deltas } = payoff;
  const topCut = interdiction?.interventions?.[0] ?? null;

  // The branch is still computing (intervention epochs not yet in).
  if (!intervention || !baseline) {
    return (
      <div className="mb-3 border border-accent-amber/40 rounded p-3 bg-accent-amber/5">
        <div className="text-[10px] font-mono text-accent-amber flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
          Computing the counterfactual…
        </div>
      </div>
    );
  }

  const reduction = interdiction?.reductionPct ?? 0;

  return (
    <div className="mb-3 border border-accent-cyan/40 rounded overflow-hidden">
      {/* Recommended action header */}
      <div className="px-3 py-2.5 bg-accent-cyan/10 border-b border-accent-cyan/30">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-widest text-accent-cyan mb-1">
          RECOMMENDED INTERVENTION
        </div>
        {topCut ? (
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[12px] font-mono text-foreground truncate">
              Sever <span className="text-accent-cyan">{topCut.target.label}</span>
            </div>
            <div className="text-[12px] font-mono tabular-nums text-accent-green shrink-0">
              −{reduction}% damage
            </div>
          </div>
        ) : (
          <div className="text-[11px] font-mono text-text-muted">
            No single-edge cut improved the projected outcome
            {interdiction?.fallbackReason ? ` (${interdiction.fallbackReason})` : ""}.
          </div>
        )}
        {interdiction && (
          <div className="text-[9px] font-mono text-text-muted mt-1 tabular-nums">
            projected cascade damage {interdiction.baselineDamage} → {interdiction.bestDamage}
          </div>
        )}
      </div>

      {/* Before / after grid */}
      <div className="grid grid-cols-3 text-[10px] font-mono">
        <div className="px-3 py-1.5 text-text-muted" />
        <div className="px-3 py-1.5 text-text-muted tracking-wider text-right">DO NOTHING</div>
        <div className="px-3 py-1.5 text-accent-cyan tracking-wider text-right">INTERVENE</div>

        <PayoffRow
          label="Final status"
          baseline={
            <span style={{ color: getStatusColor(baseline.finalStatus) }}>
              {baseline.finalStatus}
            </span>
          }
          intervention={
            <span style={{ color: getStatusColor(intervention.finalStatus) }}>
              {intervention.finalStatus}
            </span>
          }
        />
        <PayoffRow
          label="Ω-buffer (end)"
          baseline={`${baseline.finalBuffer}`}
          intervention={`${intervention.finalBuffer}`}
          delta={deltas ? formatDelta(deltas.bufferGain, "") : undefined}
          deltaGood={(deltas?.bufferGain ?? 0) > 0}
        />
        <PayoffRow
          label="Peak nodes hit"
          baseline={`${baseline.peakActivated}`}
          intervention={`${intervention.peakActivated}`}
          delta={deltas ? formatDelta(-deltas.fewerActivated, "") : undefined}
          deltaGood={(deltas?.fewerActivated ?? 0) > 0}
        />
        <PayoffRow
          label="Time to failure"
          baseline={`${baseline.ttfDays}d`}
          intervention={`${intervention.ttfDays}d`}
          delta={deltas ? formatDelta(deltas.extraDaysToFailure, "d") : undefined}
          deltaGood={(deltas?.extraDaysToFailure ?? 0) > 0}
        />
      </div>
    </div>
  );
}

function PayoffRow({
  label,
  baseline,
  intervention,
  delta,
  deltaGood,
}: {
  label: string;
  baseline: ReactNode;
  intervention: ReactNode;
  delta?: string;
  deltaGood?: boolean;
}) {
  return (
    <>
      <div className="px-3 py-1.5 text-text-muted border-t border-border/60">{label}</div>
      <div className="px-3 py-1.5 text-foreground tabular-nums text-right border-t border-border/60">
        {baseline}
      </div>
      <div className="px-3 py-1.5 text-foreground tabular-nums text-right border-t border-border/60">
        {intervention}
        {delta && (
          <span
            className={`ml-1.5 ${deltaGood ? "text-accent-green" : "text-text-muted"}`}
          >
            {delta}
          </span>
        )}
      </div>
    </>
  );
}

function formatDelta(value: number, unit: string): string {
  if (value === 0) return "";
  const sign = value > 0 ? "+" : "";
  return `(${sign}${value}${unit})`;
}

/**
 * Mounted at the app shell. Shows the player when activeDemoFlowId is set.
 */
export function DemoFlowPlayerHost() {
  const activeDemoFlowId = useApexStore((s) => s.activeDemoFlowId);
  const setActiveDemoFlowId = useApexStore((s) => s.setActiveDemoFlowId);
  const setDomainSelectorOpen = useApexStore((s) => s.setDomainSelectorOpen);
  if (!activeDemoFlowId) return null;
  return (
    <Player
      flowId={activeDemoFlowId}
      onClose={() => {
        setActiveDemoFlowId(null);
        // Reopen the DomainSelector so the user lands back at the picker
        // instead of an empty canvas.
        setDomainSelectorOpen(true);
      }}
    />
  );
}

/**
 * Picker shown in the DomainSelector. Offers the available flows; user
 * picks one and the host takes over.
 */
export function DemoFlowPicker({ onPick }: { onPick: () => void }) {
  const setActiveDemoFlowId = useApexStore((s) => s.setActiveDemoFlowId);
  return (
    <div className="border-t border-border/60 pt-3 mt-3">
      <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-2">
        OR — TRY A GUIDED DEMO
      </div>
      <div className="flex flex-col gap-1.5">
        {FLOWS.map((flow: DemoFlow) => (
          <button
            key={flow.id}
            onClick={() => {
              setActiveDemoFlowId(flow.id);
              onPick();
            }}
            className="group flex items-center gap-3 text-left px-3 py-2 border border-border/60 rounded hover:border-accent-cyan/60 hover:bg-accent-cyan/5 transition-colors"
            data-tour={`demo-flow-${flow.id}`}
          >
            <span className="text-accent-cyan group-hover:translate-x-0.5 transition-transform">
              ▶
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[11px] font-[family-name:var(--font-michroma)] text-text-primary">
                  {flow.title}
                </span>
                <span className="text-[9px] font-mono text-text-muted">
                  {flow.duration}
                </span>
              </div>
              <div className="text-[10px] text-text-muted leading-snug">
                {flow.subtitle}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
