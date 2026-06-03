"use client";

// ─── PearlWorkspace ──────────────────────────────────────────────
//
// The redesigned PEARL surface. The classic PEARL stack was six
// always-expanded panels, each with its own permanently-visible gray
// explanatory paragraph — "way too many words," hard to operationalize,
// and the actual payoff (the forecast) buried at the bottom.
//
// This restructures the same machinery into three zones with one clear
// hierarchy. Nothing here is new logic: every control composes an
// existing panel in its `embedded` mode (header/prose stripped) and
// every action is a pre-existing store action. The redesign is pure
// information architecture.
//
//   Zone 1 — DEFINE CUTS    how you pick what to remove. One segmented
//                            control routes between the three existing
//                            entry methods (Describe / Auto-solve /
//                            Manual) so only one is on screen at a time.
//   Zone 2 — ACTIVE CUTS    what is currently removed, in plain labels,
//                            with Clear-all + Run-cascade. Always
//                            visible — this is the working set.
//   Zone 3 — FORECAST       the payoff. Promoted out of the basement so
//                            the analyst sees the consequence of their
//                            cuts without scrolling.
//
// Explanation lives behind the `?` on each SectionHeader (progressive
// disclosure), not in always-on paragraphs. The forecast and the active
// cut set are never hidden behind a click — only the *explanation* is.
//
// VX880 is a domain-gated secondary section — it renders ONLY when a
// t1d-* domain is active (T1D-specific trial presets; an out-of-place
// artifact in any other session, per founder live-test).

import { useEffect, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import SectionHeader from "./SectionHeader";
import ScenarioInput from "../ScenarioInput";
import InterdictionPanel from "../InterdictionPanel";
import AblationPanel from "../AblationPanel";
import CopilotInterdictionResults from "../modules/CopilotInterdictionResults";
import MonteCarloForecast from "../MonteCarloForecast";
import VX880TrialPanel from "../VX880TrialPanel";

type CutMethod = "describe" | "solve" | "manual";

type CutItem = {
  key: string;
  kind: "severed-edge" | "ablated-edge" | "ablated-node";
  label: string;
};

const METHOD_TABS: { id: CutMethod; label: string; hint: string }[] = [
  {
    id: "describe",
    label: "DESCRIBE",
    hint: "Type a scenario in plain English; the copilot picks the cuts.",
  },
  {
    id: "solve",
    label: "AUTO-SOLVE",
    hint: "Let the solver find the cheapest cuts that minimise damage.",
  },
  {
    id: "manual",
    label: "MANUAL",
    hint: "Click nodes / edges on the canvas to cut them yourself.",
  },
];

export default function PearlWorkspace({
  expanded = false,
}: {
  /** When true the forecast chart renders at full height. */
  expanded?: boolean;
}) {
  const [method, setMethod] = useState<CutMethod>("describe");
  const [vx880Open, setVx880Open] = useState(false);

  const graphData = useApexStore((s) => s.graphData);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const ablatedEdgeIds = useApexStore((s) => s.ablatedEdgeIds);
  const resetSeveredEdges = useApexStore((s) => s.resetSeveredEdges);
  const resetAblation = useApexStore((s) => s.resetAblation);
  const startAblationReplay = useApexStore((s) => s.startAblationReplay);
  const lastInterdictionResult = useApexStore((s) => s.lastInterdictionResult);
  const setAblationActive = useApexStore((s) => s.setAblationActive);
  const selectedDomains = useApexStore((s) => s.selectedDomains);

  // VX-880 trial presets are T1D-specific — only surface them when a
  // t1d-* domain is active (mirrors ModulePanel's TissueCohortView gate).
  // The `t1d-` prefix check avoids pulling domain-profiles into the bundle.
  const isT1DDomain = useMemo(
    () => selectedDomains.some((id) => id.startsWith("t1d-")),
    [selectedDomains],
  );

  // The Manual tab IS canvas ablation: selecting it puts the canvas into
  // click-to-cut mode so the analyst just clicks nodes/edges — no hidden
  // "ENTER ABLATION MODE" step. Leaving the tab (or unmounting PEARL)
  // turns the click-mode off NON-destructively via `setAblationActive`
  // (NOT `setAblationMode`, which would wipe the cuts already made).
  useEffect(() => {
    setAblationActive(method === "manual");
  }, [method, setAblationActive]);
  useEffect(() => () => setAblationActive(false), [setAblationActive]);

  // Resolve the raw id lists into human labels. Edge labels read
  // "Source → Target" off the node table; if an id has gone stale
  // (graph swapped underneath a cut) we fall back to the raw id rather
  // than dropping the row, so the count never lies.
  const cuts = useMemo<CutItem[]>(() => {
    const nodeById = new Map(graphData.nodes.map((n) => [n.id, n]));
    const edgeById = new Map(graphData.edges.map((e) => [e.id, e]));

    const edgeLabel = (edgeId: string): string => {
      const e = edgeById.get(edgeId);
      if (!e) return edgeId;
      const src = nodeById.get(e.source)?.label ?? e.source;
      const tgt = nodeById.get(e.target)?.label ?? e.target;
      return `${src} → ${tgt}`;
    };

    const items: CutItem[] = [];
    for (const id of severedEdges) {
      items.push({ key: `sev:${id}`, kind: "severed-edge", label: edgeLabel(id) });
    }
    for (const id of ablatedEdgeIds) {
      items.push({ key: `abe:${id}`, kind: "ablated-edge", label: edgeLabel(id) });
    }
    for (const id of ablatedNodeIds) {
      items.push({
        key: `abn:${id}`,
        kind: "ablated-node",
        label: nodeById.get(id)?.label ?? id,
      });
    }
    return items;
  }, [graphData, severedEdges, ablatedEdgeIds, ablatedNodeIds]);

  const hasCuts = cuts.length > 0;

  const clearAll = () => {
    resetSeveredEdges();
    resetAblation();
  };

  return (
    <div data-tour="pearl-workspace" className="space-y-3">
      {/* Per founder live-test ("more buttons than words; explanations all
          collapsible"), the always-visible orientation line was folded into
          the DEFINE CUTS `?` below. Zero prose before the first control. */}

      {/* ── Zone 1 — DEFINE CUTS ─────────────────────────────── */}
      <section className="border border-accent-amber/25 rounded bg-accent-amber/5 p-3 space-y-2">
        <SectionHeader
          title="DEFINE CUTS"
          accent="var(--accent-amber)"
          info={
            <>
              A cut removes a connection (or a node and all its
              connections) from the graph, then the cascade is re-run to
              see what changes. Pick cuts three ways:
              <br />
              <br />
              <b>Describe</b> — say what you fear in plain English; the
              copilot translates it into shocks and proposes cuts.
              <br />
              <b>Auto-solve</b> — the solver searches for the cheapest set
              of cuts that minimises worst-case damage.
              <br />
              <b>Manual</b> — click nodes or edges on the canvas to cut
              them yourself.
              <br />
              <br />
              Then <b>Run cascade</b> in ACTIVE CUTS and read the{" "}
              <b>Forecast</b> below.
            </>
          }
        />

        {/* Segmented control — only one entry method on screen at once */}
        <div
          role="tablist"
          aria-label="Cut entry method"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const idx = METHOD_TABS.findIndex((t) => t.id === method);
            const next =
              e.key === "ArrowRight"
                ? (idx + 1) % METHOD_TABS.length
                : (idx - 1 + METHOD_TABS.length) % METHOD_TABS.length;
            setMethod(METHOD_TABS[next].id);
          }}
          className="flex items-center gap-1 p-0.5 rounded border border-border bg-surface/40"
        >
          {METHOD_TABS.map((t) => {
            const active = method === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                id={`cut-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`cut-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMethod(t.id)}
                title={t.hint}
                className={`flex-1 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1 rounded transition-colors ${
                  active
                    ? "bg-accent-amber/15 text-accent-amber"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab body — all three panels stay mounted (hidden when inactive)
            so switching tabs never discards in-progress scenario text or a
            computed solver result (each panel holds local state). */}
        <div className="pt-1">
          <div
            role="tabpanel"
            id="cut-panel-describe"
            aria-labelledby="cut-tab-describe"
            hidden={method !== "describe"}
            className="space-y-2"
          >
            <ScenarioInput embedded />
            {lastInterdictionResult && <CopilotInterdictionResults />}
          </div>
          <div
            role="tabpanel"
            id="cut-panel-solve"
            aria-labelledby="cut-tab-solve"
            hidden={method !== "solve"}
            className="space-y-2"
          >
            {/* Founder: "auto-solve — I have no idea what that does."
                One visible plain-language line (Auto-solve can't be an icon —
                its concept has no real-world analogue). */}
            <p className="text-[8px] font-mono text-text-muted leading-snug">
              Finds the fewest cuts that blunt the worst-case cascade.
              {" "}<b>Budget</b> = how many cuts it may use; <b>mode</b> = what
              it may cut (edges, nodes, or both).
            </p>
            <InterdictionPanel embedded />
          </div>
          <div
            role="tabpanel"
            id="cut-panel-manual"
            aria-labelledby="cut-tab-manual"
            hidden={method !== "manual"}
          >
            <AblationPanel embedded />
          </div>
        </div>
      </section>

      {/* ── Zone 2 — ACTIVE CUTS ─────────────────────────────── */}
      <section className="border border-border rounded bg-surface/30 p-3 space-y-2">
        <SectionHeader
          title="ACTIVE CUTS"
          accent="var(--accent-cyan)"
          info={
            <>
              Everything currently removed from the graph, however it was
              chosen. This is the working set the forecast below is based
              on. <b>Run cascade</b> replays the simulation against these
              cuts; <b>Clear all</b> restores the full graph.
            </>
          }
          right={
            <span className="text-[7px] font-mono text-text-muted">
              {hasCuts ? `${cuts.length} cut${cuts.length === 1 ? "" : "s"}` : "none"}
            </span>
          }
        />

        {hasCuts ? (
          <>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {cuts.map((c) => (
                <li
                  key={c.key}
                  className="flex items-center gap-2 text-[8px] font-mono"
                >
                  <CutTag kind={c.kind} />
                  <span className="text-foreground truncate flex-1">
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={startAblationReplay}
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border border-accent-cyan/60 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
                title="Re-run the cascade with the active cuts applied"
              >
                RUN CASCADE
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border border-border text-text-muted hover:border-accent-red/60 hover:text-accent-red transition-colors"
                title="Remove every cut and restore the full graph"
              >
                CLEAR ALL
              </button>
            </div>
          </>
        ) : (
          <div className="text-[8px] font-mono text-text-muted italic">
            No cuts yet — pick some in DEFINE CUTS above, then run the
            cascade to see the effect.
          </div>
        )}
      </section>

      {/* ── Zone 3 — FORECAST ────────────────────────────────── */}
      <section className="border border-border rounded bg-surface/30 p-3 space-y-2">
        <SectionHeader
          title="FORECAST"
          accent="var(--accent-green)"
          info={
            <>
              Monte-Carlo projection of the outcome under the active cuts.
              Each run samples many paths through the graph; the band
              shows the spread, the line the median. Compare against the
              baseline to read how much the cuts helped.
            </>
          }
        />
        <MonteCarloForecast expanded={expanded} embedded />
      </section>

      {/* ── VX880 — domain-gated secondary (T1D sessions only) ──
          Founder: "VX-880 at the bottom seems to be an artifact from the
          T1D details." It is — it now renders only when a t1d-* domain is
          active, so non-T1D sessions never see it. */}
      {isT1DDomain && (
      <section className="border border-border/60 rounded bg-surface/20 p-3 space-y-2">
        <SectionHeader
          title="VX-880 TRIAL"
          accent="var(--text-muted)"
          collapsible
          collapsed={!vx880Open}
          onToggleCollapse={() => setVx880Open((o) => !o)}
          info={
            <>
              Domain-specific preset scenarios for the VX-880 islet-cell
              trial. Collapsed by default — off the critical path for
              most sessions.
            </>
          }
        />
        {vx880Open && <VX880TrialPanel />}
      </section>
      )}
    </div>
  );
}

// Small color-coded provenance tag so the analyst can tell at a glance
// whether a cut came from the solver (severed) or their own hand
// (ablated node/edge). Distinct from the cut's *effect* — purely how it
// got onto the list.
function CutTag({ kind }: { kind: CutItem["kind"] }) {
  const map = {
    "severed-edge": { text: "SEVERED", color: "var(--accent-amber)", bg: "rgba(255,171,0,0.12)" },
    "ablated-edge": { text: "EDGE", color: "var(--accent-cyan)", bg: "rgba(0,229,255,0.12)" },
    "ablated-node": { text: "NODE", color: "var(--accent-cyan)", bg: "rgba(0,229,255,0.12)" },
  } as const;
  const { text, color, bg } = map[kind];
  return (
    <span
      className="text-[7px] px-1 rounded shrink-0"
      style={{ color, backgroundColor: bg }}
    >
      {text}
    </span>
  );
}
