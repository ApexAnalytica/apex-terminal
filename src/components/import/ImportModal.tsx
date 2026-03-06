"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { parseFile } from "@/lib/import/parsers";
import { validateParsedGraph } from "@/lib/import/validation";
import { mergeGraphs } from "@/lib/import/merge";
import {
  ImportStep,
  ParsedGraph,
  ValidationResult,
  MergeResult,
} from "@/lib/import/types";
import { DATASET_COLORS } from "@/stores/useApexStore";
import DropZone from "./DropZone";
import ValidationSummary from "./ValidationSummary";
import PreviewTable from "./PreviewTable";

export default function ImportModal() {
  const open = useApexStore((s) => s.importModalOpen);
  const setOpen = useApexStore((s) => s.setImportModalOpen);
  const graphData = useApexStore((s) => s.graphData);
  const mergeGraphData = useApexStore((s) => s.mergeGraphData);
  const addCopilotMessage = useApexStore((s) => s.addCopilotMessage);
  const addImportedDataset = useApexStore((s) => s.addImportedDataset);
  const importedDatasets = useApexStore((s) => s.importedDatasets);

  const [step, setStep] = useState<ImportStep>("select");
  const [fileName, setFileName] = useState<string>("");
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  // Per-file tracking: which raw node/edge IDs came from which file
  const [fileBreakdown, setFileBreakdown] = useState<
    { name: string; nodeIndices: number[]; edgeIndices: number[] }[]
  >([]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setFileName("");
      setValidationResult(null);
      setMergeResult(null);
      setParseError(null);
      setFileBreakdown([]);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  const handleFileSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setFileName(
        files.length === 1 ? files[0].name : `${files.length} files selected`
      );
      setParseError(null);

      const allNodes: ParsedGraph["nodes"] = [];
      const allEdges: ParsedGraph["edges"] = [];
      const allWarnings: string[] = [];
      const errors: string[] = [];
      const breakdown: { name: string; nodeIndices: number[]; edgeIndices: number[] }[] = [];

      for (const file of files) {
        try {
          const parsed = await parseFile(file);
          const nodeStart = allNodes.length;
          const edgeStart = allEdges.length;
          allNodes.push(...parsed.nodes);
          allEdges.push(...parsed.edges);
          allWarnings.push(...parsed.warnings);
          breakdown.push({
            name: file.name,
            nodeIndices: parsed.nodes.map((_, i) => nodeStart + i),
            edgeIndices: parsed.edges.map((_, i) => edgeStart + i),
          });
        } catch (err) {
          errors.push(
            `${file.name}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      if (allNodes.length === 0 && allEdges.length === 0) {
        setParseError(
          errors.length > 0
            ? errors.join("\n")
            : allWarnings.join(". ")
        );
        return;
      }

      if (errors.length > 0) {
        allWarnings.unshift(...errors.map((e) => `Parse error — ${e}`));
      }

      // ── Cross-file edge name resolution ──
      // Edges may reference node labels (e.g. "JL MAG") instead of IDs (e.g. "N003").
      // Build a lookup and rewrite edge source/target to matching node IDs.
      if (allNodes.length > 0 && allEdges.length > 0) {
        const nodesByLabel = new Map<string, { id: string; label: string }>();
        for (const node of allNodes) {
          if (node.id && node.label) {
            const key = String(node.label).toLowerCase();
            // Only store the first node per label (exact key)
            if (!nodesByLabel.has(key)) {
              nodesByLabel.set(key, {
                id: String(node.id),
                label: String(node.label),
              });
            }
          }
        }

        const nodeIds = new Set(allNodes.map((n) => String(n.id ?? "")));
        let resolvedCount = 0;

        const resolveRef = (
          ref: string
        ): { id: string; label: string } | null => {
          // Already a valid node ID — skip
          if (nodeIds.has(ref)) return null;

          const refLower = ref.toLowerCase();

          // 1. Exact label match
          const exact = nodesByLabel.get(refLower);
          if (exact) return exact;

          // 2. Substring match — find shortest label containing the ref
          let bestMatch: { id: string; label: string } | null = null;
          for (const entry of nodesByLabel.values()) {
            const labelLower = entry.label.toLowerCase();
            if (
              labelLower.includes(refLower) ||
              refLower.includes(labelLower)
            ) {
              if (
                !bestMatch ||
                entry.label.length < bestMatch.label.length
              ) {
                bestMatch = entry;
              }
            }
          }
          return bestMatch;
        };

        for (const edge of allEdges) {
          if (edge.source) {
            const match = resolveRef(String(edge.source));
            if (match) {
              allWarnings.push(
                `Edge resolution: "${edge.source}" → node ${match.id} ("${match.label}")`
              );
              edge.source = match.id;
              resolvedCount++;
            }
          }
          if (edge.target) {
            const match = resolveRef(String(edge.target));
            if (match) {
              allWarnings.push(
                `Edge resolution: "${edge.target}" → node ${match.id} ("${match.label}")`
              );
              edge.target = match.id;
              resolvedCount++;
            }
          }
        }

        if (resolvedCount > 0) {
          allWarnings.unshift(
            `Resolved ${resolvedCount} edge reference(s) by matching node labels`
          );
        }
      }

      // ── Auto-create stub nodes for unresolved edge references ──
      // When edges reference source/target names with no matching node,
      // generate placeholder nodes so validation doesn't block the import.
      // Attribute stub nodes to the file whose edges created them.
      if (allEdges.length > 0) {
        const existingNodeIds = new Set(allNodes.map((n) => String(n.id ?? "")));
        const stubbed = new Set<string>();

        // Build edge-index → file lookup
        const edgeFileMap = new Map<number, number>();
        for (let f = 0; f < breakdown.length; f++) {
          for (const ei of breakdown[f].edgeIndices) {
            edgeFileMap.set(ei, f);
          }
        }

        for (let ei = 0; ei < allEdges.length; ei++) {
          const edge = allEdges[ei];
          for (const ref of [edge.source, edge.target]) {
            if (!ref) continue;
            const refStr = String(ref);
            if (existingNodeIds.has(refStr) || stubbed.has(refStr)) continue;
            const stubIndex = allNodes.length;
            allNodes.push({ id: refStr, label: refStr });
            stubbed.add(refStr);
            // Attribute stub to the file that owns this edge
            const fileIdx = edgeFileMap.get(ei);
            if (fileIdx !== undefined && breakdown[fileIdx]) {
              breakdown[fileIdx].nodeIndices.push(stubIndex);
            }
          }
        }

        if (stubbed.size > 0) {
          allWarnings.push(
            `Auto-created ${stubbed.size} stub node(s) from edge references: ${[...stubbed].join(", ")}`
          );
        }
      }

      const combined: ParsedGraph = {
        nodes: allNodes,
        edges: allEdges,
        format: "json", // mixed formats; irrelevant after parsing
        warnings: allWarnings,
      };

      const result = validateParsedGraph(combined, graphData);
      setValidationResult(result);
      setFileBreakdown(breakdown);
      setStep("preview");
    },
    [graphData]
  );

  const handleMerge = useCallback(() => {
    if (!validationResult) return;

    const resolvedNodes = validationResult.resolvedNodes;
    const resolvedEdges = validationResult.resolvedEdges;

    // Build per-file datasets with unique colors, stamp nodes
    const colorBase = importedDatasets.length;
    const filesToRegister = fileBreakdown.length > 0
      ? fileBreakdown
      : [{ name: fileName, nodeIndices: resolvedNodes.map((_, i) => i), edgeIndices: resolvedEdges.map((_, i) => i) }];

    // Stamp each node with its file's color
    const coloredNodes = [...resolvedNodes];
    for (let f = 0; f < filesToRegister.length; f++) {
      const color = DATASET_COLORS[(colorBase + f) % DATASET_COLORS.length];
      for (const idx of filesToRegister[f].nodeIndices) {
        if (idx < coloredNodes.length) {
          coloredNodes[idx] = { ...coloredNodes[idx], datasetColor: color };
        }
      }
    }

    const { result } = mergeGraphs(graphData, {
      nodes: coloredNodes,
      edges: resolvedEdges,
    });

    // Merge into store (pass without color — nodes already stamped)
    mergeGraphData(coloredNodes, resolvedEdges);

    // Register each file as a separate dataset
    for (let f = 0; f < filesToRegister.length; f++) {
      const file = filesToRegister[f];
      const color = DATASET_COLORS[(colorBase + f) % DATASET_COLORS.length];
      const nodeIds = file.nodeIndices
        .filter((i) => i < resolvedNodes.length)
        .map((i) => resolvedNodes[i].id);
      const edgeIds = file.edgeIndices
        .filter((i) => i < resolvedEdges.length)
        .map((i) => resolvedEdges[i].id);

      addImportedDataset({
        id: `import-${Date.now()}-${f}`,
        name: file.name,
        timestamp: Date.now(),
        nodeIds,
        edgeIds,
        color,
      });
    }

    setMergeResult(result);
    setStep("confirm");

    // Notify copilot
    const fileList = filesToRegister.length > 1
      ? ` (${filesToRegister.map((f) => f.name).join(", ")})`
      : "";
    addCopilotMessage({
      id: `import-${Date.now()}`,
      role: "system",
      content: `Dataset imported: +${result.addedNodes} nodes, +${result.addedEdges} edges merged into graph${fileList}.${
        result.skippedNodes.length > 0
          ? ` ${result.skippedNodes.length} duplicate nodes skipped.`
          : ""
      }`,
      timestamp: Date.now(),
    });
  }, [validationResult, graphData, mergeGraphData, addCopilotMessage, addImportedDataset, importedDatasets.length, fileName, fileBreakdown]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-2xl mx-4 rounded-lg border border-border bg-background shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="text-accent-cyan text-sm">◇</span>
                <div>
                  <h2 className="text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.15em] text-foreground">
                    IMPORT DATASET
                  </h2>
                  <span className="text-[9px] font-mono text-text-muted tracking-wider">
                    {step === "select" && "SELECT FILE"}
                    {step === "preview" && `PREVIEW — ${fileName}`}
                    {step === "confirm" && "MERGE COMPLETE"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-foreground text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Step: Select */}
              {step === "select" && (
                <div className="flex flex-col gap-4">
                  <DropZone onFileSelected={handleFileSelected} />
                  {parseError && (
                    <div className="px-4 py-3 rounded bg-accent-red/10 border border-accent-red/30 text-[10px] font-mono text-accent-red">
                      {parseError}
                    </div>
                  )}
                </div>
              )}

              {/* Step: Preview */}
              {step === "preview" && validationResult && (
                <div className="flex flex-col gap-4">
                  <ValidationSummary issues={validationResult.issues} />
                  <PreviewTable validationResult={validationResult} />

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setStep("select");
                        setValidationResult(null);
                        setParseError(null);
                      }}
                      className="px-4 py-2 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground hover:border-text-muted transition-colors"
                    >
                      BACK
                    </button>
                    <button
                      onClick={handleMerge}
                      disabled={!validationResult.valid}
                      className={`
                        flex-1 px-4 py-2 rounded text-[9px] font-mono tracking-wider transition-all
                        ${
                          validationResult.valid
                            ? "bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/30"
                            : "bg-surface-elevated border border-border text-text-muted cursor-not-allowed opacity-50"
                        }
                      `}
                    >
                      MERGE INTO GRAPH
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Confirm */}
              {step === "confirm" && mergeResult && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <div className="text-3xl text-accent-green">✓</div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
                      MERGE COMPLETE
                    </span>
                    <div className="flex gap-6 text-[10px] font-mono">
                      <span className="text-accent-green">
                        +{mergeResult.addedNodes} NODES
                      </span>
                      <span className="text-accent-green">
                        +{mergeResult.addedEdges} EDGES
                      </span>
                    </div>
                    {(mergeResult.skippedNodes.length > 0 ||
                      mergeResult.skippedEdges.length > 0) && (
                      <span className="text-[9px] font-mono text-text-muted">
                        {mergeResult.skippedNodes.length} nodes,{" "}
                        {mergeResult.skippedEdges.length} edges skipped
                        (duplicates)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="px-6 py-2 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground hover:border-text-muted transition-colors"
                  >
                    CLOSE
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
