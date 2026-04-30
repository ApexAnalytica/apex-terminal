"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoveryRun } from "@/lib/discovery";

// ─── DiscoveryRunsPanel ──────────────────────────────────────────────
//
// Surfaces a `DiscoveryRun` JSON record (the structure-only audit unit
// produced by the discovery pipeline) inside the SPIRTES module. This
// is where edges learned from real cohort data show up to a viewer for
// the first time — distinct from the curated CausalGraph that the rest
// of the app renders.
//
// Today: loads one hard-coded sample run from `/discovery-runs/`. The
// run record contains only abstract structure (variable ids, edges,
// lags, p-values) — there is no raw measurement data on the wire.
//
// Tomorrow: same component swaps to `/api/discovery/runs/<id>` once
// the API layer lands. The data shape is identical.

const SAMPLE_RUN_URL = "/discovery-runs/d1namo-lag-correlation-v0-1-0.json";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; run: DiscoveryRun }
  | { kind: "error"; message: string };

export default function DiscoveryRunsPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(SAMPLE_RUN_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((run: DiscoveryRun) => {
        if (!cancelled) setState({ kind: "ready", run });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4 space-y-3">
      <div className="text-[8px] font-mono text-text-muted p-2 border border-border/50 rounded bg-surface-elevated">
        Edges learned from a real observational cohort, separate from the
        curated CausalGraph above. Today: one D1NAMO sample run; tomorrow:
        live results from <code>/api/discovery/runs/&lt;id&gt;</code>.
      </div>

      {state.kind === "loading" && <LoadingTile />}
      {state.kind === "error" && <ErrorTile message={state.message} />}
      {state.kind === "ready" && <RunTile run={state.run} />}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function LoadingTile() {
  return (
    <div className="text-[8px] font-mono text-text-muted p-3 border border-border/40 rounded">
      Loading discovery run…
    </div>
  );
}

function ErrorTile({ message }: { message: string }) {
  return (
    <div className="text-[8px] font-mono text-accent-red p-3 border border-accent-red/40 rounded bg-accent-red/5">
      Failed to load run: {message}
    </div>
  );
}

function RunTile({ run }: { run: DiscoveryRun }) {
  const r = run.result;
  const sortedEdges = useMemo(
    () =>
      [...r.edges].sort(
        (a, b) => Math.abs(b.strength) - Math.abs(a.strength),
      ),
    [r.edges],
  );

  return (
    <div className="space-y-2 border border-[#40c4ff]/30 rounded bg-[#40c4ff]/5 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-[#40c4ff]">
          DISCOVERY RUN
        </span>
        <span
          className={`text-[7px] font-mono ${
            run.status === "succeeded"
              ? "text-accent-green"
              : "text-accent-red"
          }`}
        >
          {run.status.toUpperCase()}
        </span>
      </div>

      {/* Provenance grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="ALGORITHM" value={`${run.algorithm.id} v${run.algorithm.version}`} />
        <Stat label="COHORT" value={run.cohortId} />
        <Stat label="EDGES" value={String(r.edges.length)} />
        <Stat
          label="VARIABLES"
          value={String(r.variables.length)}
        />
      </div>

      {/* Diagnostics */}
      {r.diagnostics && (
        <div className="text-[7px] font-mono text-text-muted leading-relaxed border-l-2 border-[#40c4ff]/30 pl-2">
          {typeof r.diagnostics.nSubjectsUsed === "number" && (
            <>
              {r.diagnostics.nSubjectsUsed} subjects ·{" "}
            </>
          )}
          {typeof r.diagnostics.nCandidates === "number" && (
            <>
              {String(r.diagnostics.nCandidates)} candidates scanned ·{" "}
            </>
          )}
          {typeof r.diagnostics.nEdgesAfterFDR === "number" && (
            <>{String(r.diagnostics.nEdgesAfterFDR)} kept after FDR</>
          )}
        </div>
      )}

      {/* Edges */}
      <div className="space-y-1.5">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground pt-1">
          DISCOVERED EDGES
        </div>
        {sortedEdges.length === 0 ? (
          <div className="text-[8px] font-mono text-text-muted">
            No edges passed the FDR threshold.
          </div>
        ) : (
          <ul className="space-y-1">
            {sortedEdges.map((edge, i) => (
              <li
                key={i}
                className="text-[8px] font-mono text-foreground p-1.5 rounded border border-border bg-surface-elevated"
                title={edge.evidence}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="text-accent-cyan">{edge.source}</span>
                    <span className="text-text-muted mx-1">{"→"}</span>
                    <span className="text-accent-amber">{edge.target}</span>
                    {typeof edge.lag === "number" && edge.lag > 0 && (
                      <span className="text-text-muted ml-2">
                        (+{edge.lag}s)
                      </span>
                    )}
                  </span>
                  <span className="text-[7px] text-text-muted shrink-0">
                    r={edge.strength.toFixed(3)}
                    {typeof edge.pValue === "number" && (
                      <>
                        {" "}
                        · p={edge.pValue.toExponential(1)}
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Algorithm caveat — honest framing carries through to the UI */}
      {run.algorithm.id === "lag-correlation" && (
        <div className="text-[7px] font-mono text-accent-amber/70 leading-relaxed border border-accent-amber/20 bg-accent-amber/5 rounded px-1.5 py-1">
          <strong>v0 algorithm.</strong> Pearson correlation with BH-FDR —
          not PCMCI+. No conditioning sets, so common causes inflate
          edges; direction is temporal precedence only. The output shape
          is identical to PCMCI+ output, so swapping the algorithm is a
          one-file change later.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-1.5 rounded border border-border bg-surface text-center">
      <div className="text-[7px] font-mono text-text-muted">{label}</div>
      <div className="text-[9px] font-mono text-foreground truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
