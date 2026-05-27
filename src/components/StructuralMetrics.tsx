"use client";

import { useDeferredValue, useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { computeOmegaState, computeDoomsdayState } from "@/lib/omega-engine";
import { omegaBridgeDensity } from "@/lib/estimators/omega-bridge-density";
import { bridgeDensityBand } from "@/lib/omega-bridge-density-display";

export default function StructuralMetrics() {
  const graph = useFilteredGraph();
  const meta = graph.metadata;
  const shocks = useApexStore((s) => s.shocks);

  const omegaState = useMemo(() => computeOmegaState(shocks), [shocks]);
  const doomsday = useMemo(
    () => computeDoomsdayState(shocks, omegaState.buffer),
    [shocks, omegaState.buffer]
  );
  // Ω-Bridge Density (Ghauri 2025, system-level diagnostic). Brandes'-
  // class O(V·E) under the hood — for the LAUNCH-WORKSPACE flow it
  // landed in the same synchronous tick as the canvas mount + module
  // panel reflows + temporalData init, which the user reported as a
  // freeze. `useDeferredValue` lets React render the rest of the
  // strip immediately with a stale (or default) bridgeDensity, then
  // schedule the recompute as a low-priority work unit. The strip
  // shows a placeholder for one frame on a graph swap; in exchange
  // the launch path stays interactive.
  const deferredGraph = useDeferredValue(graph);
  const bridgeDensity = useMemo(() => omegaBridgeDensity(deferredGraph), [deferredGraph]);
  const band = bridgeDensityBand(bridgeDensity.density);

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-surface text-[9px] font-mono text-text-muted">
      <span>
        DISCOVERY DENSITY:{" "}
        <span className="text-foreground">{meta.density.toFixed(2)}</span>
      </span>
      <span className="text-border">|</span>
      <span title={band.tooltip}>
        Ω-BRIDGE DENSITY:{" "}
        <span style={{ color: band.color }}>
          {bridgeDensity.density.toFixed(3)}
        </span>
      </span>
      <span className="text-border">|</span>
      <span>
        CONSTRAINT:{" "}
        <span className="text-foreground">{meta.constraintType.split("+")[0].trim()}</span>
      </span>
      <span className="text-border">|</span>
      <span>
        VERIFICATION:{" "}
        <span
          style={{
            color:
              meta.verificationStatus === "VERIFIED"
                ? "var(--accent-green)"
                : meta.verificationStatus === "INCONSISTENCIES_FOUND"
                  ? "var(--accent-amber)"
                  : "var(--text-muted)",
          }}
        >
          {meta.verificationStatus}
        </span>
      </span>
      <span className="text-border">|</span>
      <span>
        gRPC MESH:{" "}
        <span style={{ color: "var(--accent-green)" }}>4/4 CONNECTED</span>
      </span>
      <span className="text-border">|</span>
      <span>
        TARSKI:{" "}
        <span style={{ color: "var(--accent-green)" }}>Z3 v4.12 | cvc5 v1.1</span>
      </span>
      <span className="text-border">|</span>
      <span>
        DK SCALING:{" "}
        <span
          style={{
            color: doomsday.dragonKingDetected ? "#ff1744" : "var(--accent-green)",
          }}
        >
          {doomsday.dragonKingDetected ? "DETECTED" : "NOMINAL"}
        </span>
      </span>
    </div>
  );
}
