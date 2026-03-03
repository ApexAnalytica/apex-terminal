"use client";

import { useState } from "react";
import { ValidationResult, ValidationIssue } from "@/lib/import/types";
import { CausalNode, CausalEdge } from "@/lib/types";

interface PreviewTableProps {
  validationResult: ValidationResult;
}

const MAX_ROWS = 100;

export default function PreviewTable({ validationResult }: PreviewTableProps) {
  const { resolvedNodes, resolvedEdges, issues } = validationResult;
  const [tab, setTab] = useState<"nodes" | "edges">("nodes");

  const nodeIssues = issues.filter((i) => i.entity === "node");
  const edgeIssues = issues.filter((i) => i.entity === "edge");

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Tabs */}
      <div className="flex gap-1">
        <TabButton
          active={tab === "nodes"}
          onClick={() => setTab("nodes")}
          label={`NODES (${resolvedNodes.length})`}
        />
        <TabButton
          active={tab === "edges"}
          onClick={() => setTab("edges")}
          label={`EDGES (${resolvedEdges.length})`}
        />
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[340px] rounded border border-border">
        {tab === "nodes" ? (
          <NodeTable
            nodes={resolvedNodes.slice(0, MAX_ROWS)}
            issues={nodeIssues}
          />
        ) : (
          <EdgeTable
            edges={resolvedEdges.slice(0, MAX_ROWS)}
            issues={edgeIssues}
          />
        )}
      </div>

      {/* Row count */}
      {(tab === "nodes" ? resolvedNodes.length : resolvedEdges.length) >
        MAX_ROWS && (
        <span className="text-[9px] font-mono text-text-muted text-center">
          SHOWING {MAX_ROWS} OF{" "}
          {tab === "nodes" ? resolvedNodes.length : resolvedEdges.length}
        </span>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-1.5 text-[9px] font-mono tracking-wider rounded-t transition-colors
        ${
          active
            ? "bg-surface-elevated text-accent-cyan border border-border border-b-transparent"
            : "text-text-muted hover:text-foreground"
        }
      `}
    >
      {label}
    </button>
  );
}

function getRowSeverity(
  index: number,
  issues: ValidationIssue[]
): "error" | "warning" | null {
  const rowIssues = issues.filter((i) => i.row === index);
  if (rowIssues.some((i) => i.severity === "error")) return "error";
  if (rowIssues.some((i) => i.severity === "warning")) return "warning";
  return null;
}

function getRowTooltip(index: number, issues: ValidationIssue[]): string {
  return issues
    .filter((i) => i.row === index)
    .map((i) => `[${i.severity.toUpperCase()}] ${i.message}`)
    .join("\n");
}

function NodeTable({
  nodes,
  issues,
}: {
  nodes: CausalNode[];
  issues: ValidationIssue[];
}) {
  return (
    <table className="w-full text-[9px] font-mono">
      <thead>
        <tr className="bg-surface-elevated text-text-muted tracking-wider">
          <th className="px-3 py-2 text-left w-6"></th>
          <th className="px-3 py-2 text-left">ID</th>
          <th className="px-3 py-2 text-left">LABEL</th>
          <th className="px-3 py-2 text-left">CATEGORY</th>
          <th className="px-3 py-2 text-left">DOMAIN</th>
          <th className="px-3 py-2 text-right">COMPOSITE</th>
          <th className="px-3 py-2 text-left">SOURCE</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node, i) => {
          const severity = getRowSeverity(i, issues);
          const tooltip = getRowTooltip(i, issues);
          return (
            <tr
              key={node.id}
              title={tooltip || undefined}
              className={`
                border-t border-border/50 hover:bg-surface-elevated/50
                ${severity === "error" ? "border-l-2 border-l-accent-red" : ""}
                ${severity === "warning" ? "border-l-2 border-l-accent-amber" : ""}
              `}
            >
              <td className="px-3 py-1.5 text-center">
                {severity === "error" ? (
                  <span className="text-accent-red">✕</span>
                ) : severity === "warning" ? (
                  <span className="text-accent-amber">⚠</span>
                ) : (
                  <span className="text-accent-green">✓</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-foreground">{node.id}</td>
              <td className="px-3 py-1.5 text-foreground">{node.label}</td>
              <td className="px-3 py-1.5 text-text-muted">{node.category}</td>
              <td className="px-3 py-1.5 text-text-muted">{node.domain}</td>
              <td className="px-3 py-1.5 text-right text-foreground">
                {node.omegaFragility.composite.toFixed(1)}
              </td>
              <td className="px-3 py-1.5 text-text-muted">
                {node.discoverySource}
              </td>
            </tr>
          );
        })}
        {nodes.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
              NO NODES IN IMPORT
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function EdgeTable({
  edges,
  issues,
}: {
  edges: CausalEdge[];
  issues: ValidationIssue[];
}) {
  return (
    <table className="w-full text-[9px] font-mono">
      <thead>
        <tr className="bg-surface-elevated text-text-muted tracking-wider">
          <th className="px-3 py-2 text-left w-6"></th>
          <th className="px-3 py-2 text-left">ID</th>
          <th className="px-3 py-2 text-left">SOURCE</th>
          <th className="px-3 py-2 text-left">TARGET</th>
          <th className="px-3 py-2 text-right">WEIGHT</th>
          <th className="px-3 py-2 text-left">TYPE</th>
          <th className="px-3 py-2 text-right">CONFIDENCE</th>
        </tr>
      </thead>
      <tbody>
        {edges.map((edge, i) => {
          const severity = getRowSeverity(i, issues);
          const tooltip = getRowTooltip(i, issues);
          return (
            <tr
              key={edge.id}
              title={tooltip || undefined}
              className={`
                border-t border-border/50 hover:bg-surface-elevated/50
                ${severity === "error" ? "border-l-2 border-l-accent-red" : ""}
                ${severity === "warning" ? "border-l-2 border-l-accent-amber" : ""}
              `}
            >
              <td className="px-3 py-1.5 text-center">
                {severity === "error" ? (
                  <span className="text-accent-red">✕</span>
                ) : severity === "warning" ? (
                  <span className="text-accent-amber">⚠</span>
                ) : (
                  <span className="text-accent-green">✓</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-foreground">{edge.id}</td>
              <td className="px-3 py-1.5 text-foreground">{edge.source}</td>
              <td className="px-3 py-1.5 text-foreground">{edge.target}</td>
              <td className="px-3 py-1.5 text-right text-foreground">
                {edge.weight.toFixed(2)}
              </td>
              <td className="px-3 py-1.5 text-text-muted">{edge.type}</td>
              <td className="px-3 py-1.5 text-right text-foreground">
                {edge.confidence.toFixed(2)}
              </td>
            </tr>
          );
        })}
        {edges.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
              NO EDGES IN IMPORT
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
