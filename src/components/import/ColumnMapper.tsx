"use client";

import { useState, useCallback, useMemo } from "react";
import { ColumnMapping, DataMode } from "@/lib/import/types";
import {
  CANONICAL_FIELDS,
  autoMapHeaders,
  detectDataMode,
} from "@/lib/import/column-mapping";
import { useApexStore } from "@/stores/useApexStore";

interface ColumnMapperProps {
  rawHeaders: string[];
  sampleRows: string[][];
  onConfirm: (mappings: ColumnMapping[], dataMode: DataMode) => void;
  onBack: () => void;
}

export default function ColumnMapper({
  rawHeaders,
  sampleRows,
  onConfirm,
  onBack,
}: ColumnMapperProps) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(() =>
    autoMapHeaders(rawHeaders)
  );
  const [dataMode, setDataMode] = useState<DataMode>(() =>
    detectDataMode(autoMapHeaders(rawHeaders))
  );
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmReasoning, setLlmReasoning] = useState<string | null>(null);

  const llmProvider = useApexStore((s) => s.llmProvider);
  const claudeApiKey = useApexStore((s) => s.claudeApiKey);
  const geminiApiKey = useApexStore((s) => s.geminiApiKey);
  const claudeModel = useApexStore((s) => s.claudeModel);
  const geminiModel = useApexStore((s) => s.geminiModel);

  const hasLlmKey =
    (llmProvider === "anthropic" && claudeApiKey) ||
    (llmProvider === "gemini" && geminiApiKey);

  // Track which canonical fields are already used
  const usedFields = useMemo(() => {
    const used = new Set<string>();
    for (const m of mappings) {
      if (m.canonicalField) used.add(m.canonicalField);
    }
    return used;
  }, [mappings]);

  const updateMapping = useCallback(
    (index: number, canonicalField: string | null) => {
      setMappings((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], canonicalField };
        return next;
      });
      // Auto-update data mode
      setMappings((prev) => {
        setDataMode(detectDataMode(prev));
        return prev;
      });
    },
    []
  );

  const handleLlmAutoDetect = useCallback(async () => {
    setLlmLoading(true);
    setLlmError(null);
    setLlmReasoning(null);

    try {
      const apiKey = llmProvider === "anthropic" ? claudeApiKey : geminiApiKey;
      const model = llmProvider === "anthropic" ? claudeModel : geminiModel;

      const res = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: rawHeaders,
          sampleRows,
          apiKey,
          model,
          provider: llmProvider,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const result = await res.json();

      if (result.mappings && Array.isArray(result.mappings)) {
        // Apply LLM mappings, preserving rawHeader from our local state
        const newMappings = rawHeaders.map((raw, i) => {
          const llmMapping = result.mappings.find(
            (m: { rawHeader: string; canonicalField: string | null }) =>
              m.rawHeader === raw
          );
          return {
            rawHeader: raw,
            canonicalField: llmMapping?.canonicalField ?? null,
          };
        });
        setMappings(newMappings);
        setDataMode(result.dataMode || detectDataMode(newMappings));
        if (result.reasoning) {
          setLlmReasoning(result.reasoning);
        }
      }
    } catch (err) {
      setLlmError(err instanceof Error ? err.message : "Auto-detect failed");
    } finally {
      setLlmLoading(false);
    }
  }, [
    rawHeaders,
    sampleRows,
    llmProvider,
    claudeApiKey,
    geminiApiKey,
    claudeModel,
    geminiModel,
  ]);

  const mappedCount = mappings.filter((m) => m.canonicalField).length;
  const hasLabel = mappings.some((m) => m.canonicalField === "label");
  const hasSourceTarget =
    mappings.some((m) => m.canonicalField === "source") &&
    mappings.some((m) => m.canonicalField === "target");
  const isValid = dataMode === "edges" ? hasSourceTarget : hasLabel || mappedCount > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Data Mode Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-mono tracking-wider text-text-muted">
          DATA MODE:
        </span>
        <div className="flex gap-1">
          {(["nodes", "edges", "auto"] as DataMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setDataMode(mode)}
              className={`
                px-3 py-1 text-[9px] font-mono tracking-wider rounded transition-colors
                ${
                  dataMode === mode
                    ? "bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan"
                    : "border border-border text-text-muted hover:text-foreground"
                }
              `}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* LLM Auto-detect */}
        <button
          onClick={handleLlmAutoDetect}
          disabled={!hasLlmKey || llmLoading}
          title={
            !hasLlmKey
              ? "Configure an LLM API key in the copilot settings to enable auto-detect"
              : "Use LLM to auto-detect column mappings"
          }
          className={`
            ml-auto px-3 py-1 text-[9px] font-mono tracking-wider rounded transition-all
            ${
              hasLlmKey && !llmLoading
                ? "bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20"
                : "border border-border text-text-muted/50 cursor-not-allowed"
            }
          `}
        >
          {llmLoading ? "ANALYZING..." : "AUTO-DETECT (LLM)"}
        </button>
      </div>

      {/* LLM feedback */}
      {llmError && (
        <div className="px-3 py-2 rounded bg-accent-red/10 border border-accent-red/30 text-[9px] font-mono text-accent-red">
          {llmError}
        </div>
      )}
      {llmReasoning && (
        <div className="px-3 py-2 rounded bg-accent-cyan/5 border border-accent-cyan/20 text-[9px] font-mono text-text-muted">
          <span className="text-accent-cyan">LLM:</span> {llmReasoning}
        </div>
      )}

      {/* Mapping Table */}
      <div className="overflow-auto max-h-[320px] rounded border border-border">
        <table className="w-full text-[9px] font-mono">
          <thead>
            <tr className="bg-surface-elevated text-text-muted tracking-wider sticky top-0">
              <th className="px-3 py-2 text-left">YOUR COLUMN</th>
              <th className="px-3 py-2 text-left">SAMPLE DATA</th>
              <th className="px-3 py-2 text-left">MAP TO</th>
            </tr>
          </thead>
          <tbody>
            {rawHeaders.map((header, i) => (
              <tr
                key={i}
                className="border-t border-border/50 hover:bg-surface-elevated/50"
              >
                <td className="px-3 py-1.5 text-foreground font-medium">
                  {header}
                </td>
                <td className="px-3 py-1.5 text-text-muted max-w-[180px] truncate">
                  {sampleRows
                    .slice(0, 3)
                    .map((row) => row[i] ?? "")
                    .filter(Boolean)
                    .join(", ")}
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={mappings[i]?.canonicalField ?? ""}
                    onChange={(e) =>
                      updateMapping(i, e.target.value || null)
                    }
                    className="bg-background border border-border rounded px-2 py-1 text-[9px] font-mono text-foreground w-full max-w-[200px] focus:border-accent-cyan focus:outline-none"
                  >
                    <option value="">-- skip --</option>
                    {CANONICAL_FIELDS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.fields.map((field) => (
                          <option
                            key={field.value}
                            value={field.value}
                            disabled={
                              usedFields.has(field.value) &&
                              mappings[i]?.canonicalField !== field.value
                            }
                          >
                            {field.label}
                            {usedFields.has(field.value) &&
                            mappings[i]?.canonicalField !== field.value
                              ? " (used)"
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-[9px] font-mono text-text-muted">
        <span>
          {mappedCount} of {rawHeaders.length} columns mapped
        </span>
        {dataMode === "edges" && !hasSourceTarget && (
          <span className="text-accent-amber">
            — edge mode requires source + target columns
          </span>
        )}
        {dataMode === "nodes" && !hasLabel && mappedCount > 0 && (
          <span className="text-accent-amber">
            — consider mapping a label column
          </span>
        )}
        {!hasLlmKey && (
          <span className="ml-auto text-text-muted/60">
            LLM auto-detect requires API key
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded border border-border text-[9px] font-mono tracking-wider text-text-muted hover:text-foreground hover:border-text-muted transition-colors"
        >
          BACK
        </button>
        <button
          onClick={() => onConfirm(mappings, dataMode)}
          disabled={!isValid}
          className={`
            flex-1 px-4 py-2 rounded text-[9px] font-mono tracking-wider transition-all
            ${
              isValid
                ? "bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/30"
                : "bg-surface-elevated border border-border text-text-muted cursor-not-allowed opacity-50"
            }
          `}
        >
          APPLY MAPPING & PREVIEW
        </button>
      </div>
    </div>
  );
}
