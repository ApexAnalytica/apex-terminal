"use client";

/**
 * DemoFlowPlayer — guided cause-and-effect tour through the causal graph.
 *
 * Steps a user through a scripted DemoFlow (see src/lib/demo-flows.ts):
 * sets the relevant domains, loads the graph, injects shocks in
 * sequence, and shows narrative overlays. Restores prior store state
 * on exit.
 *
 * Mounted at the app root level so it overlays the existing canvas.
 * Visibility is driven by zustand state (`activeDemoFlowId`).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { buildGraphFromDomains } from "@/components/DomainSelector";
import { FLOWS, getFlowById, type DemoFlow } from "@/lib/demo-flows";
import type { CausalGraph, CausalShock } from "@/lib/types";
import { useApexStore } from "@/stores/useApexStore";

interface PlayerProps {
  flowId: string;
  onClose: () => void;
}

interface PriorState {
  selectedDomains: string[];
  graphData: CausalGraph;
}

function Player({ flowId, onClose }: PlayerProps) {
  const flow = useMemo(() => getFlowById(flowId), [flowId]);
  const addShock = useApexStore((s) => s.addShock);
  const removeShock = useApexStore((s) => s.removeShock);
  const setSelectedDomains = useApexStore((s) => s.setSelectedDomains);
  const setGraphData = useApexStore((s) => s.setGraphData);
  const startReplay = useApexStore((s) => s.startReplay);
  const stopReplay = useApexStore((s) => s.stopReplay);
  const priorRef = useRef<PriorState | null>(null);
  const injectedShockIdsRef = useRef<string[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // ── On mount: capture prior state, load the flow's graph + domains ──
  useEffect(() => {
    if (!flow) return;
    const store = useApexStore.getState();
    priorRef.current = {
      selectedDomains: [...store.selectedDomains],
      graphData: store.graphData,
    };
    // Load the graph data so useFilteredGraph has nodes/edges to filter
    // (the canvas was empty without this — DomainSelector's "Initialize"
    // button does the same; we replicate it here so the demo works
    // before the user has committed to a domain selection).
    const merged = buildGraphFromDomains(flow.domainIds);
    setGraphData(merged);
    setSelectedDomains(flow.domainIds);
    return () => {
      // Cleanup on unmount: stop the cascade replay, clear injected
      // shocks, restore graph state.
      stopReplay();
      for (const id of injectedShockIdsRef.current) removeShock(id);
      injectedShockIdsRef.current = [];
      if (priorRef.current) {
        setGraphData(priorRef.current.graphData);
        setSelectedDomains(priorRef.current.selectedDomains);
      }
    };
  }, [flow, setSelectedDomains, setGraphData, removeShock, stopReplay]);

  // ── Inject the step's shock when the step becomes active ──
  // After each shock fires we kick startReplay() so the cascade simulator
  // runs and the modules (SPIRTES/TARSKI/PEARL/PARETO) actually see node
  // states change. Without this addShock just appends to an array and
  // nothing visually propagates beyond the gauge.
  useEffect(() => {
    if (!flow) return;
    const step = flow.steps[stepIdx];
    if (!step?.shock) return;
    const shock: CausalShock = {
      ...step.shock,
      id: `demo-${flow.id}-${stepIdx}-${Date.now()}`,
    };
    injectedShockIdsRef.current.push(shock.id);
    addShock(shock);
    // Defer one tick so addShock state has applied before we read shocks
    // back inside startReplay's simulateCascade call.
    const t = window.setTimeout(() => startReplay(), 50);
    return () => window.clearTimeout(t);
  }, [flow, stepIdx, addShock, startReplay]);

  // ── Auto-advance when durationMs > 0 ──
  useEffect(() => {
    if (!flow || paused) return;
    const step = flow.steps[stepIdx];
    if (!step || step.durationMs <= 0) return;
    const t = window.setTimeout(() => {
      if (stepIdx < flow.steps.length - 1) {
        setStepIdx((i) => i + 1);
      }
    }, step.durationMs);
    return () => window.clearTimeout(t);
  }, [flow, stepIdx, paused]);

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
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className="text-[10px] font-mono text-text-muted hover:text-accent-cyan px-2 py-0.5 border border-border rounded"
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

      {/* Narrative card — bottom-center */}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[calc(100%-3rem)] bg-bg-1/95 border border-accent-cyan/40 rounded p-4 backdrop-blur shadow-2xl">
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
                className="text-[10px] font-mono text-text-muted hover:text-accent-cyan px-3 py-1 border border-border rounded"
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
                onClick={() => setStepIdx((i) => Math.min(flow.steps.length - 1, i + 1))}
                className="text-[10px] font-mono text-accent-cyan hover:text-accent-cyan/80 px-3 py-1 border border-accent-cyan/60 rounded"
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

/**
 * Mounted at the app shell. Shows the player when activeDemoFlowId is set.
 * Lazy-mount so when no flow is active there's zero overhead.
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
        // instead of an empty canvas. Without this the Player's cleanup
        // restores to whatever state existed pre-demo — which is empty
        // when the user entered straight from the picker.
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
