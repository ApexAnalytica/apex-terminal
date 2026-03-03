"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { parseFile } from "@/lib/import/parsers";
import { validateParsedGraph } from "@/lib/import/validation";
import { mergeGraphs } from "@/lib/import/merge";
import {
  ImportStep,
  ValidationResult,
  MergeResult,
} from "@/lib/import/types";
import DropZone from "./DropZone";
import ValidationSummary from "./ValidationSummary";
import PreviewTable from "./PreviewTable";

export default function ImportModal() {
  const open = useApexStore((s) => s.importModalOpen);
  const setOpen = useApexStore((s) => s.setImportModalOpen);
  const graphData = useApexStore((s) => s.graphData);
  const mergeGraphData = useApexStore((s) => s.mergeGraphData);
  const addCopilotMessage = useApexStore((s) => s.addCopilotMessage);

  const [step, setStep] = useState<ImportStep>("select");
  const [fileName, setFileName] = useState<string>("");
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setFileName("");
      setValidationResult(null);
      setMergeResult(null);
      setParseError(null);
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
    async (file: File) => {
      setFileName(file.name);
      setParseError(null);

      try {
        const parsed = await parseFile(file);

        if (
          parsed.nodes.length === 0 &&
          parsed.edges.length === 0 &&
          parsed.warnings.length > 0
        ) {
          setParseError(parsed.warnings.join(". "));
          return;
        }

        const result = validateParsedGraph(parsed, graphData);
        setValidationResult(result);
        setStep("preview");
      } catch (err) {
        setParseError(
          `Failed to parse file: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    },
    [graphData]
  );

  const handleMerge = useCallback(() => {
    if (!validationResult) return;

    const { result } = mergeGraphs(graphData, {
      nodes: validationResult.resolvedNodes,
      edges: validationResult.resolvedEdges,
    });

    mergeGraphData(
      validationResult.resolvedNodes,
      validationResult.resolvedEdges
    );
    setMergeResult(result);
    setStep("confirm");

    // Notify copilot
    addCopilotMessage({
      id: `import-${Date.now()}`,
      role: "system",
      content: `Dataset imported: +${result.addedNodes} nodes, +${result.addedEdges} edges merged into graph.${
        result.skippedNodes.length > 0
          ? ` ${result.skippedNodes.length} duplicate nodes skipped.`
          : ""
      }`,
      timestamp: Date.now(),
    });
  }, [validationResult, graphData, mergeGraphData, addCopilotMessage]);

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
