"use client";

import { useCallback, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import type { CausalShock, ShockCategory } from "@/lib/types";

type Technique = "shock" | "sever" | "ablate";

interface NewsIntervention {
  technique: Technique;
  targetNodeId: string | null;
  targetEdgeId: string | null;
  severity: number | null;
  category: ShockCategory | null;
  rationale: string;
  sourceQuote: string;
}

interface NewsResponse {
  summary: string;
  interventions: NewsIntervention[];
}

export default function NewsInterpreterPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const shocks = useApexStore((s) => s.shocks);
  const severEdge = useApexStore((s) => s.severEdge);
  const toggleAblatedNode = useApexStore((s) => s.toggleAblatedNode);
  const addShock = useApexStore((s) => s.addShock);

  const geminiApiKey = useApexStore((s) => s.geminiApiKey);
  const geminiModel = useApexStore((s) => s.geminiModel);

  const [articleText, setArticleText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewsResponse | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set());

  const nodeLookup = useMemo(() => {
    const m = new Map<string, string>();
    graphData.nodes.forEach((n) => m.set(n.id, n.label));
    return m;
  }, [graphData.nodes]);

  const edgeLookup = useMemo(() => {
    const m = new Map<string, { source: string; target: string }>();
    graphData.edges.forEach((e) => m.set(e.id, { source: e.source, target: e.target }));
    return m;
  }, [graphData.edges]);

  // Always use Gemini (same as SystemCopilot). Server falls back to
  // process.env.GEMINI_API_KEY when the client key is empty.
  const canRun = graphData.nodes.length > 0 && articleText.trim().length >= 20;

  const runInterpret = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAppliedIdx(new Set());
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleText,
          nodes: graphData.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            category: n.category,
            domain: n.domain ?? "",
          })),
          edges: graphData.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            physicalMechanism: e.physicalMechanism,
          })),
          apiKey: geminiApiKey,
          model: geminiModel,
          provider: "gemini",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }
      setResult(json as NewsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [articleText, graphData, geminiApiKey, geminiModel]);

  const applyIntervention = useCallback(
    (iv: NewsIntervention, idx: number) => {
      if (iv.technique === "sever" && iv.targetEdgeId) {
        severEdge(iv.targetEdgeId);
      } else if (iv.technique === "ablate" && iv.targetNodeId) {
        if (!ablatedNodeIds.includes(iv.targetNodeId)) {
          toggleAblatedNode(iv.targetNodeId);
        }
      } else if (iv.technique === "shock" && iv.targetNodeId) {
        const label = nodeLookup.get(iv.targetNodeId) ?? iv.targetNodeId;
        const shock: CausalShock = {
          id: `news-${iv.targetNodeId}-${Date.now()}`,
          name: `News: ${label.slice(0, 40)}`,
          severity: iv.severity ?? 0.5,
          category: iv.category ?? "geopolitical",
          description: iv.rationale,
        };
        addShock(shock);
      }
      setAppliedIdx((prev) => new Set([...prev, idx]));
    },
    [severEdge, toggleAblatedNode, addShock, nodeLookup, ablatedNodeIds]
  );

  const isAlreadyApplied = (iv: NewsIntervention): boolean => {
    if (iv.technique === "sever" && iv.targetEdgeId) {
      return severedEdges.includes(iv.targetEdgeId);
    }
    if (iv.technique === "ablate" && iv.targetNodeId) {
      return ablatedNodeIds.includes(iv.targetNodeId);
    }
    if (iv.technique === "shock" && iv.targetNodeId) {
      return shocks.some((s) => s.id.startsWith(`news-${iv.targetNodeId}-`));
    }
    return false;
  };

  const describeTarget = (iv: NewsIntervention): string => {
    if (iv.technique === "sever" && iv.targetEdgeId) {
      const e = edgeLookup.get(iv.targetEdgeId);
      if (!e) return iv.targetEdgeId;
      const src = nodeLookup.get(e.source) ?? e.source;
      const tgt = nodeLookup.get(e.target) ?? e.target;
      return `${src} → ${tgt}`;
    }
    if (iv.targetNodeId) {
      return nodeLookup.get(iv.targetNodeId) ?? iv.targetNodeId;
    }
    return "(unmapped)";
  };

  const techniqueColor = (t: Technique): string => {
    switch (t) {
      case "shock": return "var(--accent-red)";
      case "sever": return "var(--accent-cyan)";
      case "ablate": return "var(--accent-amber)";
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <div className="flex items-center justify-between">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-cyan">
          NEWS INTERPRETER
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[8px] font-mono text-text-muted hover:text-foreground transition-colors"
        >
          {expanded ? "HIDE" : "PASTE NEWS"}
        </button>
      </div>
      <div className="text-[8px] font-mono text-text-muted">
        Paste a news article — Claude maps implied disruptions onto graph nodes/edges as shock, sever, or ablate interventions.
      </div>

      {expanded && (
        <>
          <textarea
            value={articleText}
            onChange={(e) => setArticleText(e.target.value)}
            placeholder="Paste article text here (at least 20 characters)..."
            rows={6}
            className="w-full px-2 py-1.5 bg-surface-elevated border border-border rounded text-[9px] font-mono text-foreground placeholder:text-text-muted/40 focus:outline-none focus:border-accent-cyan/60 transition-colors resize-y"
          />

          <button
            onClick={runInterpret}
            disabled={!canRun || loading}
            className="w-full px-3 py-2 rounded border text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-all disabled:opacity-30"
            style={{
              borderColor: "rgba(0, 229, 255, 0.4)",
              color: "var(--accent-cyan)",
              background: loading ? "rgba(0, 229, 255, 0.15)" : "rgba(0, 229, 255, 0.05)",
            }}
          >
            {loading ? "INTERPRETING..." : "INTERPRET ARTICLE"}
          </button>

          {graphData.nodes.length === 0 && (
            <div className="text-[8px] font-mono text-text-muted italic">
              Load a domain graph first — the interpreter needs nodes to map onto.
            </div>
          )}
        </>
      )}

      {error && (
        <div className="text-[9px] font-mono text-accent-red bg-accent-red/10 border border-accent-red/20 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {result.summary && (
            <div className="text-[8px] font-mono text-text-muted italic border-l-2 border-accent-cyan/30 pl-2 leading-relaxed">
              {result.summary}
            </div>
          )}

          {result.interventions.length === 0 ? (
            <div className="text-[8px] font-mono text-text-muted italic">
              No graph-mappable interventions extracted.
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[8px] font-mono text-text-muted">
                EXTRACTED INTERVENTIONS ({result.interventions.length})
              </div>
              {result.interventions.map((iv, i) => {
                const alreadyApplied = appliedIdx.has(i) || isAlreadyApplied(iv);
                const actionLabel = iv.technique.toUpperCase();
                const appliedLabel =
                  iv.technique === "shock" ? "INJECTED" :
                  iv.technique === "sever" ? "SEVERED" : "ABLATED";
                const color = techniqueColor(iv.technique);
                return (
                  <div
                    key={i}
                    className="p-1.5 border rounded space-y-1"
                    style={{
                      borderColor: "rgba(0, 229, 255, 0.2)",
                      backgroundColor: "rgba(0, 229, 255, 0.03)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted text-[8px] font-mono w-4">{i + 1}.</span>
                      <span
                        className="text-[7px] font-mono px-1 rounded"
                        style={{
                          color,
                          backgroundColor: `${color === "var(--accent-red)" ? "rgba(255,23,68,0.1)" : color === "var(--accent-cyan)" ? "rgba(0,229,255,0.1)" : "rgba(255,171,0,0.1)"}`,
                        }}
                      >
                        {actionLabel}
                        {iv.technique === "shock" && iv.severity !== null && ` ${(iv.severity * 100).toFixed(0)}%`}
                      </span>
                      <span className="text-foreground text-[8px] font-mono flex-1 truncate">
                        {describeTarget(iv)}
                      </span>
                      <button
                        onClick={() => applyIntervention(iv, i)}
                        disabled={alreadyApplied}
                        className={`px-2 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors shrink-0 ${
                          alreadyApplied
                            ? "text-accent-green border border-accent-green/30 bg-accent-green/5"
                            : "text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/10"
                        }`}
                      >
                        {alreadyApplied ? appliedLabel : "APPLY"}
                      </button>
                    </div>
                    <div className="text-[8px] font-mono text-text-muted leading-relaxed pl-6">
                      {iv.rationale}
                    </div>
                    {iv.sourceQuote && (
                      <div className="text-[8px] font-mono text-foreground/60 italic leading-relaxed pl-6 border-l border-border ml-6">
                        &ldquo;{iv.sourceQuote}&rdquo;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
