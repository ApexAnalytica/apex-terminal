"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useApexStore } from "@/stores/useApexStore";
import { MAIN_GRAPH, EMPTY_GRAPH } from "@/lib/graph-data";
import ClientHeaderBar from "@/components/client/ClientHeaderBar";
import SandboxLogin from "@/components/client/SandboxLogin";
import SandboxEmptyState from "@/components/client/SandboxEmptyState";
import SystemCopilot from "@/components/SystemCopilot";
import RiskPropagationFlow from "@/components/RiskPropagationFlow";
import ModulePanel from "@/components/ModulePanel";
import StructuralMetrics from "@/components/StructuralMetrics";
import CausalDAG2D from "@/components/CausalDAG2D";
import ImportModal from "@/components/import/ImportModal";
import FeedbackWidget from "@/components/FeedbackWidget";

// Dynamic import for 3D canvas (no SSR)
const CausalDAG3D = dynamic(() => import("@/components/CausalDAG3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="text-[10px] font-mono text-text-muted animate-pulse">
        INITIALIZING WEBGL_3D RENDERER...
      </div>
    </div>
  ),
});

export default function ClientPage() {
  const viewMode = useApexStore((s) => s.viewMode);
  const sandboxOrgName = useApexStore((s) => s.sandboxOrgName);
  const graphData = useApexStore((s) => s.graphData);
  const sandboxGraphs = useApexStore((s) => s.sandboxGraphs);
  const activeSandboxGraphId = useApexStore((s) => s.activeSandboxGraphId);

  const [sandboxReady, setSandboxReady] = useState(false);
  const cleanupRef = useRef(false);

  // Initialize store with empty graph — must complete before other effects act
  useEffect(() => {
    cleanupRef.current = false;
    useApexStore.setState({
      graphData: EMPTY_GRAPH,
      initialGraph: EMPTY_GRAPH,
      copilotMessages: [
        {
          id: "sandbox-init-1",
          role: "system",
          content:
            "APEX TERMINAL — Sandbox Mode initialized. Import a data file to begin causal analysis. All modules available: Spirtes, Tarski, Pearl, Pareto.",
          timestamp: Date.now(),
        },
      ],
      selectedNode: null,
      severedEdges: [],
      scissorsMode: false,
    });
    setSandboxReady(true);

    return () => {
      cleanupRef.current = true;
      setTimeout(() => {
        if (!cleanupRef.current) return;
        useApexStore.setState({
          graphData: MAIN_GRAPH,
          initialGraph: MAIN_GRAPH,
          sandboxOrgName: null,
          sandboxGraphs: [],
          activeSandboxGraphId: null,
          copilotMessages: [
            {
              id: "init-1",
              role: "system",
              content:
                "APEX SYNTHETIC SCIENTIST v2.0 initialized. Spirtes Engine active — structure discovery ready. Type a query or use the action buttons below.",
              timestamp: Date.now(),
            },
          ],
          selectedNode: null,
          severedEdges: [],
          scissorsMode: false,
        });
      }, 0);
    };
  }, []);

  // Sync graph data back to the active sandbox slot when it changes
  useEffect(() => {
    if (!sandboxReady || !activeSandboxGraphId || graphData.nodes.length === 0) return;
    const store = useApexStore.getState();
    const slot = store.sandboxGraphs.find((g) => g.id === activeSandboxGraphId);
    if (slot && slot.graph !== graphData) {
      useApexStore.setState({
        sandboxGraphs: store.sandboxGraphs.map((g) =>
          g.id === activeSandboxGraphId ? { ...g, graph: graphData } : g
        ),
      });
    }
  }, [graphData, activeSandboxGraphId, sandboxReady]);

  // Auto-create first graph slot on first import
  useEffect(() => {
    if (!sandboxReady) return;
    if (graphData.nodes.length > 0 && sandboxGraphs.length === 0) {
      useApexStore.getState().addSandboxGraph("Graph 1", graphData);
    }
  }, [graphData.nodes.length, sandboxGraphs.length, sandboxReady]);

  // Show login screen if not authenticated
  if (!sandboxOrgName) {
    return <SandboxLogin />;
  }

  // Don't render terminal until store is initialized with empty graph
  if (!sandboxReady) {
    return null;
  }

  const isEmpty = graphData.nodes.length === 0;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Header with module tabs */}
      <ClientHeaderBar />

      {isEmpty ? (
        /* Empty state: clean blank terminal with import CTA */
        <div className="flex-1 relative">
          <SandboxEmptyState />
        </div>
      ) : (
        /* Main 3-column layout — only rendered once data is loaded */
        <div className="flex flex-1 overflow-hidden">
          {/* Left: System Copilot */}
          <SystemCopilot />

          {/* Center: DAG + Risk Cards + Metrics */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* DAG Canvas */}
            <div className="flex-1 relative min-h-0" style={{ contain: "strict" }}>
              <div className="absolute inset-0">
                {viewMode === "3d" ? <CausalDAG3D /> : <CausalDAG2D />}
              </div>
            </div>

            {/* Risk Propagation Flow */}
            <RiskPropagationFlow />

            {/* Structural Metrics Footer */}
            <StructuralMetrics />
          </div>

          {/* Right: Module Panel */}
          <ModulePanel />
        </div>
      )}

      {/* Import Modal */}
      <ImportModal />
      <FeedbackWidget />
    </div>
  );
}
