"use client";

import { ValidationIssue } from "@/lib/import/types";

interface ValidationSummaryProps {
  issues: ValidationIssue[];
}

export default function ValidationSummary({ issues }: ValidationSummaryProps) {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;

  const hasErrors = errors > 0;
  const hasWarnings = warnings > 0;

  return (
    <div
      className={`
        flex items-center gap-4 px-4 py-2.5 rounded text-[10px] font-mono tracking-wider
        ${
          hasErrors
            ? "bg-accent-red/10 border border-accent-red/30"
            : hasWarnings
              ? "bg-accent-amber/10 border border-accent-amber/30"
              : "bg-accent-green/10 border border-accent-green/30"
        }
      `}
    >
      {/* Status icon */}
      <span className="text-sm">
        {hasErrors ? "✕" : hasWarnings ? "⚠" : "✓"}
      </span>

      {/* Message */}
      <span
        className={
          hasErrors
            ? "text-accent-red"
            : hasWarnings
              ? "text-accent-amber"
              : "text-accent-green"
        }
      >
        {hasErrors
          ? "CANNOT IMPORT — FIX ERRORS FIRST"
          : hasWarnings
            ? "REVIEW WARNINGS BEFORE IMPORTING"
            : "VALIDATION PASSED"}
      </span>

      {/* Counts */}
      <div className="flex items-center gap-3 ml-auto text-[9px]">
        {errors > 0 && (
          <span className="text-accent-red">{errors} ERROR{errors !== 1 ? "S" : ""}</span>
        )}
        {warnings > 0 && (
          <span className="text-accent-amber">
            {warnings} WARNING{warnings !== 1 ? "S" : ""}
          </span>
        )}
        {info > 0 && (
          <span className="text-text-muted">{info} INFO</span>
        )}
      </div>
    </div>
  );
}
