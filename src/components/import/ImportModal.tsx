"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { parseFile } from "@/lib/import/parsers";
import { parseCSV } from "@/lib/import/parsers/csv-parser";
import { validateParsedGraph } from "@/lib/import/validation";
import { mergeGraphs } from "@/lib/import/merge";
import {
  ImportStep,
  ParsedGraph,
  ValidationResult,
  MergeResult,
  ColumnMapping,
  DataMode,
  OmegaEnrichment,
} from "@/lib/import/types";
import {
  applyColumnMapping,
  extractCSVPreview,
} from "@/lib/import/column-mapping";
import { DATASET_COLORS } from "@/stores/useApexStore";
import DropZone from "./DropZone";
import ColumnMapper from "./ColumnMapper";
import ValidationSummary from "./ValidationSummary";
import PreviewTable from "./PreviewTable";

/**
 * Clean a raw filename into a readable dataset name.
 * "2026-03-05-rivian-magnet-supply-chain-2.csv" → "Rivian Magnet Supply Chain 2"
 */
function cleanDatasetName(filename: string): string {
  // Strip extension
  let name = filename.replace(/\.[^.]+$/, "");
  // Strip leading date patterns (YYYY-MM-DD, YYYYMMDD)
  name = name.replace(/^\d{4}-?\d{2}-?\d{2}[-_]?/, "");
  // Replace hyphens/underscores with spaces
  name = name.replace(/[-_]+/g, " ").trim();
  // Title case
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return name || filename;
}

export default function ImportModal() {
  const open = useApexStore((s) => s.importModalOpen);
  const setOpen = useApexStore((s) => s.setImportModalOpen);
  const graphData = useApexStore((s) => s.graphData);
  const mergeGraphData = useApexStore((s) => s.mergeGraphData);
  const addCopilotMessage = useApexStore((s) => s.addCopilotMessage);
  const addImportedDataset = useApexStore((s) => s.addImportedDataset);
  const importedDatasets = useApexStore((s) => s.importedDatasets);
  const llmProvider = useApexStore((s) => s.llmProvider);
  const claudeApiKey = useApexStore((s) => s.claudeApiKey);
  const geminiApiKey = useApexStore((s) => s.geminiApiKey);
  const claudeModel = useApexStore((s) => s.claudeModel);
  const geminiModel = useApexStore((s) => s.geminiModel);

  const [step, setStep] = useState<ImportStep>("select");
  const [fileName, setFileName] = useState<string>("");
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  // Per-file tracking: which raw node/edge IDs came from which file
  const [fileBreakdown, setFileBreakdown] = useState<
    { name: string; nodeIndices: number[]; edgeIndices: number[] }[]
  >([]);
  // Column mapping state
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [rawCSVContent, setRawCSVContent] = useState<string>("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvSampleRows, setCsvSampleRows] = useState<string[][]>([]);
  const [needsMapping, setNeedsMapping] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setFileName("");
      setValidationResult(null);
      setMergeResult(null);
      setParseError(null);
      setFileBreakdown([]);
      setRawFiles([]);
      setRawCSVContent("");
      setCsvHeaders([]);
      setCsvSampleRows([]);
      setNeedsMapping(false);
      setEnriching(false);
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

  /**
   * Check if a CSV file needs column mapping (low HEADER_MAP coverage).
   */
  const checkNeedsMapping = useCallback(
    async (file: File): Promise<{ needs: boolean; csvText: string }> => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isCsvLike = ["csv", "xlsx", "xls"].includes(ext);
      if (!isCsvLike) return { needs: false, csvText: "" };

      let csvText: string;
      if (ext === "xlsx" || ext === "xls") {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        csvText = XLSX.utils.sheet_to_csv(sheet);
      } else {
        csvText = await file.text();
      }

      const { headers } = extractCSVPreview(csvText);
      if (headers.length === 0) return { needs: false, csvText };

      // Check HEADER_MAP coverage
      const { HEADER_MAP } = await import("@/lib/import/parsers/csv-parser");
      let mapHits = 0;
      for (const h of headers) {
        const normalized = h.toLowerCase().replace(/[\s-]+/g, "_");
        if (normalized in HEADER_MAP) mapHits++;
      }

      const coverage = mapHits / headers.length;
      // If less than 40% of headers are recognized, offer mapping
      return { needs: coverage < 0.4, csvText };
    },
    []
  );

  const handleFileSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setFileName(
        files.length === 1 ? cleanDatasetName(files[0].name) : `${files.length} files selected`
      );
      setParseError(null);
      setRawFiles(files);

      // For single CSV/XLSX files, check if column mapping is needed
      if (files.length === 1) {
        const { needs, csvText } = await checkNeedsMapping(files[0]);
        if (needs && csvText) {
          const { headers, sampleRows } = extractCSVPreview(csvText);
          setRawCSVContent(csvText);
          setCsvHeaders(headers);
          setCsvSampleRows(sampleRows);
          setNeedsMapping(true);
          setStep("mapping");
          return;
        }
      }

      // No mapping needed — parse directly
      await parseAndValidate(files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphData, checkNeedsMapping]
  );

  /**
   * Called after column mapping is confirmed.
   * Rewrites the CSV with mapped headers and parses it.
   */
  const handleMappingConfirm = useCallback(
    async (mappings: ColumnMapping[], dataMode: DataMode) => {
      const remappedCSV = applyColumnMapping(rawCSVContent, mappings, dataMode);

      // Parse the remapped CSV
      const parsed = parseCSV(remappedCSV);
      parsed.warnings.unshift(
        `Column mapping applied: ${mappings.filter((m) => m.canonicalField).length} columns mapped`
      );

      // If user selected edge mode but parser detected nodes (no source/target mapped),
      // this is fine — the parser will handle it based on the remapped headers.

      const combined: ParsedGraph = {
        nodes: parsed.nodes,
        edges: parsed.edges,
        format: "csv",
        warnings: parsed.warnings,
      };

      const breakdown = [
        {
          name: rawFiles[0]?.name ?? "import",
          nodeIndices: parsed.nodes.map((_, i) => i),
          edgeIndices: parsed.edges.map((_, i) => i),
        },
      ];

      // Run the same cross-file resolution and stub creation
      resolveEdgeReferences(combined.nodes, combined.edges, combined.warnings, breakdown);

      const result = validateParsedGraph(combined, graphData);
      setValidationResult(result);
      setFileBreakdown(breakdown);
      setStep("preview");
    },
    [rawCSVContent, rawFiles, graphData]
  );

  /**
   * Parse files directly (no column mapping) and go to preview.
   */
  const parseAndValidate = useCallback(
    async (files: File[]) => {
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

      resolveEdgeReferences(allNodes, allEdges, allWarnings, breakdown);

      const combined: ParsedGraph = {
        nodes: allNodes,
        edges: allEdges,
        format: "json",
        warnings: allWarnings,
      };

      const result = validateParsedGraph(combined, graphData);
      setValidationResult(result);
      setFileBreakdown(breakdown);
      setStep("preview");
    },
    [graphData]
  );

  /**
   * Shared edge resolution + stub creation logic.
   * Mutates allNodes, allEdges, allWarnings, and breakdown in place.
   */
  function resolveEdgeReferences(
    allNodes: ParsedGraph["nodes"],
    allEdges: ParsedGraph["edges"],
    allWarnings: string[],
    breakdown: { name: string; nodeIndices: number[]; edgeIndices: number[] }[]
  ) {
    // Cross-file edge name resolution
    if (allNodes.length > 0 && allEdges.length > 0) {
      const nodesByLabel = new Map<string, { id: string; label: string }>();
      for (const node of allNodes) {
        if (node.id && node.label) {
          const key = String(node.label).toLowerCase();
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
        if (nodeIds.has(ref)) return null;
        const refLower = ref.toLowerCase();
        const exact = nodesByLabel.get(refLower);
        if (exact) return exact;
        let bestMatch: { id: string; label: string } | null = null;
        for (const entry of nodesByLabel.values()) {
          const labelLower = entry.label.toLowerCase();
          if (
            labelLower.includes(refLower) ||
            refLower.includes(labelLower)
          ) {
            if (!bestMatch || entry.label.length < bestMatch.label.length) {
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

    // Auto-create stub nodes for unresolved edge references
    if (allEdges.length > 0) {
      const existingNodeIds = new Set(allNodes.map((n) => String(n.id ?? "")));
      const stubbed = new Set<string>();

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
  }

  /**
   * Attempt LLM enrichment for Omega-Fragility scores.
   * Returns enrichments or null if LLM is unavailable.
   */
  const enrichWithLlm = useCallback(
    async (
      nodes: { id: string; label: string; category: string; domain: string }[]
    ): Promise<OmegaEnrichment[] | null> => {
      const apiKey =
        llmProvider === "anthropic" ? claudeApiKey : geminiApiKey;
      if (!apiKey) return null;

      const model =
        llmProvider === "anthropic" ? claudeModel : geminiModel;

      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: nodes.slice(0, 50), // cap at 50 to stay within token limits
            apiKey,
            model,
            provider: llmProvider,
          }),
        });

        if (!res.ok) return null;

        const result = await res.json();
        return result.enrichments ?? null;
      } catch {
        return null;
      }
    },
    [llmProvider, claudeApiKey, geminiApiKey, claudeModel, geminiModel]
  );

  const handleMerge = useCallback(async () => {
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
        name: cleanDatasetName(file.name),
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

    // Attempt LLM enrichment in background (non-blocking)
    if (result.addedNodes > 0) {
      setEnriching(true);
      const nodeSummaries = coloredNodes
        .filter((n) => !graphData.nodes.some((existing) => existing.id === n.id))
        .map((n) => ({
          id: n.id,
          label: n.label,
          category: n.category,
          domain: n.domain,
        }));

      enrichWithLlm(nodeSummaries).then((enrichments) => {
        setEnriching(false);
        if (!enrichments || enrichments.length === 0) return;

        // Apply enrichments to the store's graph
        useApexStore.setState((s) => {
          const updatedNodes = s.graphData.nodes.map((node) => {
            const enrichment = enrichments.find((e) => e.nodeId === node.id);
            if (!enrichment) return node;

            const omega = { ...node.omegaFragility };
            if (enrichment.composite != null) omega.composite = Math.max(0, Math.min(10, enrichment.composite));
            if (enrichment.substitutionFriction != null) omega.substitutionFriction = Math.max(0, Math.min(10, enrichment.substitutionFriction));
            if (enrichment.downstreamLoad != null) omega.downstreamLoad = Math.max(0, Math.min(10, enrichment.downstreamLoad));
            if (enrichment.cascadingVoltage != null) omega.cascadingVoltage = Math.max(0, Math.min(10, enrichment.cascadingVoltage));
            if (enrichment.existentialTailWeight != null) omega.existentialTailWeight = Math.max(0, Math.min(10, enrichment.existentialTailWeight));

            return {
              ...node,
              omegaFragility: omega,
              ...(enrichment.globalConcentration && { globalConcentration: enrichment.globalConcentration }),
              ...(enrichment.replacementTime && { replacementTime: enrichment.replacementTime }),
            };
          });

          const updatedGraph = { ...s.graphData, nodes: updatedNodes };

          // Notify copilot
          s.copilotMessages.push({
            id: `enrich-${Date.now()}`,
            role: "system",
            content: `LLM enrichment complete: refined Omega-Fragility scores for ${enrichments.length} node(s) using ${llmProvider} domain knowledge.`,
            timestamp: Date.now(),
          });

          return {
            graphData: updatedGraph,
            initialGraph: updatedGraph,
            copilotMessages: [...s.copilotMessages],
          };
        });
      });
    }
  }, [validationResult, graphData, mergeGraphData, addCopilotMessage, addImportedDataset, importedDatasets.length, fileName, fileBreakdown, enrichWithLlm, llmProvider]);

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
            className={`w-full mx-4 rounded-lg border border-border bg-background shadow-2xl overflow-hidden ${
              step === "mapping" ? "max-w-3xl" : "max-w-2xl"
            }`}
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
                    {step === "mapping" && `MAP COLUMNS — ${fileName}`}
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

              {/* Step: Mapping */}
              {step === "mapping" && csvHeaders.length > 0 && (
                <ColumnMapper
                  rawHeaders={csvHeaders}
                  sampleRows={csvSampleRows}
                  onConfirm={handleMappingConfirm}
                  onBack={() => {
                    setStep("select");
                    setNeedsMapping(false);
                    setCsvHeaders([]);
                    setCsvSampleRows([]);
                    setRawCSVContent("");
                  }}
                />
              )}

              {/* Step: Preview */}
              {step === "preview" && validationResult && (
                <div className="flex flex-col gap-4">
                  <ValidationSummary issues={validationResult.issues} />
                  <PreviewTable validationResult={validationResult} />

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        if (needsMapping && csvHeaders.length > 0) {
                          setStep("mapping");
                        } else {
                          setStep("select");
                        }
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
                  {enriching && (
                    <div className="flex items-center gap-2 text-[9px] font-mono text-accent-cyan animate-pulse">
                      <span className="inline-block w-2 h-2 rounded-full bg-accent-cyan/60" />
                      ENRICHING OMEGA SCORES VIA LLM...
                    </div>
                  )}
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
