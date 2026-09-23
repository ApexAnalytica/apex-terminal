"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { deriveLatentNodes } from "@/lib/latent-nodes";
import type { CausalEdge } from "@/lib/types";

const MAGENTA = "#e040fb";

/**
 * Right-rail inspector for an INFERRED LATENT node (Dr. Pita synthetic-node #1).
 * Parity with NodeInspector / EdgeInspector, but a latent isn't a real node — it
 * has no ΩF. So this panel is structured as EVIDENCE → DATA CHECK → ACTION:
 * the hypothesised channel, the confounded edges it's derived from (the evidence
 * chain, clickable into EdgeInspector), the live-data consistency check (with the
 * aligned-point count, so the power is explicit), the discovery-readiness
 * recommendation, and the member nodes (clickable to pivot into them). Everything
 * is sourced from the graph + live feeds — real, honestly framed, never a placeholder.
 */
export default function LatentInspector() {
  const selectedLatentId = useApexStore((s) => s.selectedLatentId);
  const setSelectedLatentId = useApexStore((s) => s.setSelectedLatentId);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const setSelectedEdgeId = useApexStore((s) => s.setSelectedEdgeId);
  const graph = useApexStore((s) => s.graphData);

  const latent = useMemo(
    () =>
      selectedLatentId
        ? deriveLatentNodes(graph).find((l) => l.id === selectedLatentId) ?? null
        : null,
    [graph, selectedLatentId],
  );

  const labelOf = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n.shortLabel || n.label || n.id])),
    [graph.nodes],
  );

  const evidenceEdges = useMemo(() => {
    if (!latent) return [] as CausalEdge[];
    const members = new Set(latent.explains);
    return graph.edges.filter(
      (e) =>
        e.type === "confounded" &&
        !e.isSevered &&
        members.has(e.source) &&
        members.has(e.target),
    );
  }, [graph.edges, latent]);

  if (!latent) return null;

  const sup = latent.dataSupport;
  const rdy = latent.discoveryReadiness;
  const supColor =
    sup?.status === "supported" ? "#00e676"
      : sup?.status === "inconsistent" ? "#ff1744"
        : "#9aa0a6";
  const rdyColor =
    rdy?.status === "ready" ? "#00e676"
      : rdy?.status === "partial" ? "#ffab00"
        : "#ff6d00";
  const prov = (e: CausalEdge) => e.weightSource?.kind ?? e.confidenceSource?.kind ?? "author";

  return (
    <div
      className="m-2 rounded border bg-surface-elevated text-foreground"
      style={{ borderColor: `${MAGENTA}55` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 border-b"
        style={{ borderColor: `${MAGENTA}33`, background: `${MAGENTA}0d` }}
      >
        <div>
          <div className="text-[11px] font-[family-name:var(--font-michroma)] tracking-wider" style={{ color: MAGENTA }}>
            ◌ INFERRED LATENT
          </div>
          <div className="text-[8px] font-mono text-text-muted">hypothesis — not observed</div>
        </div>
        <button
          onClick={() => setSelectedLatentId(null)}
          className="text-text-muted hover:text-foreground text-sm leading-none px-1"
          title="Close"
        >
          ×
        </button>
      </div>

      <div className="p-2.5 space-y-2.5 text-[10px] font-mono">
        {/* Honesty banner */}
        <div className="text-[8px] leading-relaxed text-text-muted italic">
          Inferred from authored confounded structure, checked against live data
          where available — not an empirical discovery.
        </div>

        {/* Hypothesised channel */}
        {latent.hypothesizedDriver && (
          <Section title="HYPOTHESISED CHANNEL">
            <div className="text-foreground/90 leading-relaxed">{latent.hypothesizedDriver}</div>
          </Section>
        )}

        {/* Live-data consistency check */}
        <Section title="LIVE-DATA CHECK">
          <span style={{ color: supColor, fontWeight: 700 }}>
            {(sup?.status ?? "n/a").toUpperCase()}
          </span>
          {sup?.statistic != null && <span className="text-text-muted"> · mean r={sup.statistic}</span>}
          <span className="text-text-muted">
            {" "}· {sup?.liveMembers ?? 0} live member{(sup?.liveMembers ?? 0) === 1 ? "" : "s"}
            {rdy ? ` · ${rdy.maxAlignedPoints} aligned pts` : ""}
          </span>
        </Section>

        {/* Discovery readiness — the actionable acquisition spec */}
        {rdy && (
          <Section title="DISCOVERY READINESS">
            <div>
              <span style={{ color: rdyColor, fontWeight: 700 }}>{rdy.status.toUpperCase()}</span>
              <span className="text-text-muted"> [{rdy.limitingFactor}]</span>
            </div>
            <div className="mt-1 text-foreground/80 leading-relaxed">{rdy.recommendation}</div>
          </Section>
        )}

        {/* Members — clickable, pivot into the real node */}
        <Section title={`MEMBERS (${latent.explains.length})`}>
          <div className="flex flex-wrap gap-1">
            {latent.explains.map((id) => (
              <button
                key={id}
                onClick={() => setSelectedNode(id)}
                className="px-1.5 py-0.5 rounded border border-border bg-surface text-foreground/90 hover:border-accent-cyan/50 hover:text-accent-cyan transition-colors"
                title={`Open ${labelOf.get(id) ?? id}`}
              >
                {labelOf.get(id) ?? id}
              </button>
            ))}
          </div>
        </Section>

        {/* Evidence — the confounded edges this latent is derived from */}
        <Section title={`EVIDENCE — CONFOUNDED EDGES (${evidenceEdges.length})`}>
          <div className="space-y-1.5">
            {evidenceEdges.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedEdgeId(e.id)}
                className="w-full text-left rounded border border-border bg-surface px-1.5 py-1 hover:border-accent-cyan/50 transition-colors"
                title="Open in edge inspector"
              >
                <div className="text-foreground/90">
                  {labelOf.get(e.source) ?? e.source} ↔ {labelOf.get(e.target) ?? e.target}
                  <span className="text-text-muted"> · conf {e.confidence.toFixed(2)} · {prov(e)}</span>
                </div>
                {e.physicalMechanism && (
                  <div className="mt-0.5 text-[8px] text-text-muted leading-relaxed">
                    {e.physicalMechanism}
                  </div>
                )}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] tracking-wider text-text-muted mb-1">{title}</div>
      {children}
    </div>
  );
}
