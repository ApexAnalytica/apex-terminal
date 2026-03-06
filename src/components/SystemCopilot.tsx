"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import {
  processAction,
  processQuery,
  processNodeAnalysis,
  streamLlmQuery,
  CopilotAction,
} from "@/lib/copilot-engine";
import { CopilotMessage } from "@/lib/types";
import { getModelsForProvider, type LLMProvider } from "@/lib/llm-providers";

const ACTIONS: { label: string; action: CopilotAction; color: string }[] = [
  { label: "DISCOVER STRUCTURE", action: "DISCOVER_STRUCTURE", color: "var(--accent-cyan)" },
  { label: "EXPLAIN REJECTION", action: "EXPLAIN_REJECTION", color: "var(--accent-green)" },
  { label: "VERIFY LOGIC", action: "VERIFY_LOGIC", color: "var(--accent-amber)" },
];

const PROVIDER_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "anthropic", label: "Claude" },
];

function getRoleColor(role: CopilotMessage["role"]): string {
  switch (role) {
    case "system": return "var(--text-muted)";
    case "user": return "var(--accent-cyan)";
    case "assistant": return "var(--foreground)";
  }
}

function getRoleLabel(role: CopilotMessage["role"]): string {
  switch (role) {
    case "system": return "SYS";
    case "user": return "YOU";
    case "assistant": return "APEX";
  }
}

export default function SystemCopilot() {
  const {
    copilotMessages,
    addCopilotMessage,
    graphData,
    selectedNode,
    severedEdges,
    shocks,
    interventionMode,
    interventionTarget,
    ablationMode,
    ablatedNodeIds,
    ablatedEdgeIds,
    llmProvider,
    claudeApiKey,
    geminiApiKey,
    claudeModel,
    geminiModel,
    isLlmStreaming,
    setLlmProvider,
    setClaudeApiKey,
    setGeminiApiKey,
    setClaudeModel,
    setGeminiModel,
    setIsLlmStreaming,
    importedDatasets,
    removeImportedDataset,
  } = useApexStore();

  const activeApiKey = llmProvider === "gemini" ? geminiApiKey : claudeApiKey;
  const activeModel = llmProvider === "gemini" ? geminiModel : claudeModel;
  const modelOptions = getModelsForProvider(llmProvider);

  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [contextBadge, setContextBadge] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const datasetPanelRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const streamingMsgRef = useRef<string | null>(null);
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLlmActive = activeApiKey.length > 0;

  // Click-outside to close datasets panel
  useEffect(() => {
    if (!showDatasets) return;
    const handler = (e: MouseEvent) => {
      if (datasetPanelRef.current && !datasetPanelRef.current.contains(e.target as Node)) {
        setShowDatasets(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDatasets]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [copilotMessages]);

  const flashContextBadge = useCallback((label: string) => {
    setContextBadge(label);
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    badgeTimerRef.current = setTimeout(() => setContextBadge(null), 3000);
  }, []);

  // Inject node context message when selection changes
  useEffect(() => {
    if (selectedNode && selectedNode !== lastSelectedRef.current) {
      const node = graphData.nodes.find((n) => n.id === selectedNode);
      if (node) {
        addCopilotMessage({
          id: `sys-node-${Date.now()}`,
          role: "system",
          content: `NODE FOCUSED: ${node.label} (\u03A9 ${node.omegaFragility.composite.toFixed(1)}) \u2014 ${node.domain} \u2014 ${node.globalConcentration} \u2014 ${node.replacementTime}`,
          timestamp: Date.now(),
        });
        flashContextBadge(`NODE: ${node.shortLabel}`);
      }
    }
    lastSelectedRef.current = selectedNode;
  }, [selectedNode, graphData.nodes, addCopilotMessage, flashContextBadge]);

  // Flash badge on edge sever
  useEffect(() => {
    if (severedEdges.length > 0) {
      flashContextBadge(`EDGE SEVERED: ${severedEdges[severedEdges.length - 1]}`);
    }
  }, [severedEdges, flashContextBadge]);

  const handleStreamingQuery = useCallback(
    async (userContent: string) => {
      setIsLlmStreaming(true);

      // Add placeholder assistant message for streaming
      const assistantId = `llm-${Date.now()}`;
      streamingMsgRef.current = assistantId;
      addCopilotMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      });

      try {
        // Build messages list including the new user message
        const allMessages = [
          ...copilotMessages.filter((m) => m.role !== "system"),
          { id: "temp", role: "user" as const, content: userContent, timestamp: Date.now() },
        ];

        const stream = await streamLlmQuery({
          copilotMessages: allMessages,
          graph: graphData,
          apiKey: activeApiKey,
          model: activeModel,
          provider: llmProvider,
          selectedNode,
          severedEdges,
          shocks,
          interventionMode,
          interventionTarget,
          ablationMode,
          ablatedNodeIds,
          ablatedEdgeIds,
        });

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          // Update the streaming message in store
          useApexStore.setState((s) => ({
            copilotMessages: s.copilotMessages.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m
            ),
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "LLM request failed";
        useApexStore.setState((s) => ({
          copilotMessages: s.copilotMessages.map((m) =>
            m.id === streamingMsgRef.current
              ? { ...m, content: `[ERROR: ${message}]` }
              : m
          ),
        }));
      } finally {
        streamingMsgRef.current = null;
        setIsLlmStreaming(false);
      }
    },
    [
      copilotMessages,
      graphData,
      activeApiKey,
      activeModel,
      llmProvider,
      selectedNode,
      severedEdges,
      shocks,
      interventionMode,
      interventionTarget,
      ablationMode,
      ablatedNodeIds,
      ablatedEdgeIds,
      addCopilotMessage,
      setIsLlmStreaming,
    ]
  );

  const handleAction = (action: CopilotAction) => {
    const userContent = action.replace(/_/g, " ");
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userContent,
      timestamp: Date.now(),
    };
    addCopilotMessage(userMsg);

    if (isLlmActive) {
      handleStreamingQuery(userContent);
    } else {
      const responses = processAction(action, graphData);
      responses.forEach((msg) => addCopilotMessage(msg));
    }
  };

  const handleAnalyzeNode = () => {
    if (!selectedNode) return;
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: "ANALYZE NODE",
      timestamp: Date.now(),
    };
    addCopilotMessage(userMsg);

    if (isLlmActive) {
      handleStreamingQuery("ANALYZE NODE");
    } else {
      const responses = processNodeAnalysis(selectedNode, graphData);
      responses.forEach((msg) => addCopilotMessage(msg));
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || isLlmStreaming) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: Date.now(),
    };
    addCopilotMessage(userMsg);

    if (isLlmActive) {
      handleStreamingQuery(input);
    } else {
      const responses = processQuery(input, graphData);
      responses.forEach((msg) => addCopilotMessage(msg));
    }

    setInput("");
  };

  const selectedNodeData = selectedNode
    ? graphData.nodes.find((n) => n.id === selectedNode)
    : null;

  return (
    <aside className="flex flex-col w-80 border-r border-border bg-surface h-full" data-tour="system-copilot">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan">
              SYSTEM COPILOT
            </div>
            <div className="text-[9px] text-text-muted font-mono mt-0.5">
              {isLlmActive
                ? `${llmProvider === "gemini" ? "Gemini" : "Claude"}-Augmented Analysis`
                : "Synthetic Scientist Interface"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {importedDatasets.length > 0 && (
              <button
                onClick={() => { setShowDatasets(!showDatasets); if (!showDatasets) setShowSettings(false); }}
                className={`text-[11px] transition-colors p-1 ${
                  showDatasets ? "text-accent-amber" : "text-text-muted hover:text-accent-amber"
                }`}
                title="Imported Datasets"
              >
                {showDatasets ? "\u2715" : "\u25A4"}
              </button>
            )}
            <button
              onClick={() => { setShowSettings(!showSettings); if (!showSettings) setShowDatasets(false); }}
              className="text-[11px] text-text-muted hover:text-accent-cyan transition-colors p-1"
              title="LLM Settings"
            >
              {showSettings ? "\u2715" : "\u2699"}
            </button>
          </div>
        </div>

        {/* Settings panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                {/* Provider selector */}
                <div className="flex gap-1">
                  {PROVIDER_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setLlmProvider(p.value)}
                      className={`flex-1 text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1 rounded border transition-colors ${
                        llmProvider === p.value
                          ? "border-accent-cyan/60 text-accent-cyan bg-accent-cyan/10"
                          : "border-border text-text-muted hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {/* API key input */}
                <input
                  type="password"
                  value={activeApiKey}
                  onChange={(e) =>
                    llmProvider === "gemini"
                      ? setGeminiApiKey(e.target.value)
                      : setClaudeApiKey(e.target.value)
                  }
                  className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors"
                  placeholder={
                    llmProvider === "gemini"
                      ? "AIza... (session only, not stored)"
                      : "sk-ant-... (session only, not stored)"
                  }
                  spellCheck={false}
                />
                {/* Model selector */}
                <select
                  value={activeModel}
                  onChange={(e) =>
                    llmProvider === "gemini"
                      ? setGeminiModel(e.target.value)
                      : setClaudeModel(e.target.value)
                  }
                  className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border transition-colors"
                >
                  {modelOptions.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {isLlmActive && (
                  <div className="text-[8px] text-accent-green font-mono tracking-wider">
                    {llmProvider.toUpperCase()} ACTIVE
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Context badge */}
        <AnimatePresence>
          {contextBadge && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-1.5 text-[8px] font-mono tracking-wider text-accent-amber bg-accent-amber/10 px-2 py-0.5 rounded inline-block"
            >
              CONTEXT: {contextBadge}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages + Datasets overlay container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto px-3 py-2 space-y-2"
        >
          <AnimatePresence>
            {copilotMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="text-[11px] font-mono leading-relaxed"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider"
                    style={{ color: getRoleColor(msg.role) }}
                  >
                    {getRoleLabel(msg.role)}
                  </span>
                  {msg.module && (
                    <span className="text-[8px] text-text-muted tracking-wider uppercase">
                      [{msg.module}]
                    </span>
                  )}
                  {/* Streaming indicator */}
                  {msg.id === streamingMsgRef.current && isLlmStreaming && (
                    <span className="text-[8px] text-accent-cyan animate-pulse tracking-wider">
                      STREAMING...
                    </span>
                  )}
                </div>
                <div
                  className="whitespace-pre-wrap pl-2 border-l border-border"
                  style={{ color: getRoleColor(msg.role) }}
                >
                  {msg.content || (isLlmStreaming && msg.id === streamingMsgRef.current ? "" : msg.content)}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Thinking indicator */}
          {isLlmStreaming && copilotMessages[copilotMessages.length - 1]?.content === "" && (
            <div className="text-[10px] font-mono text-accent-cyan animate-pulse pl-2">
              APEX is thinking...
            </div>
          )}
        </div>

        {/* Datasets overlay */}
        <AnimatePresence>
          {showDatasets && importedDatasets.length > 0 && (
            <motion.div
              ref={datasetPanelRef}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-x-0 top-0 bottom-12 z-10 bg-surface/95 backdrop-blur-sm border-b border-border flex flex-col"
            >
              <div className="px-3 pt-3 pb-1.5">
                <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.2em] text-text-muted uppercase">
                  IMPORTED DATASETS
                </div>
                <div className="text-[8px] font-mono text-text-muted mt-0.5">
                  {importedDatasets.length} file{importedDatasets.length !== 1 ? "s" : ""} &middot; click outside to close
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
                {importedDatasets.map((ds) => (
                  <div
                    key={ds.id}
                    className="group flex items-center justify-between text-[9px] font-mono p-2 rounded border transition-colors"
                    style={{
                      borderColor: `color-mix(in srgb, ${ds.color} 30%, transparent)`,
                      backgroundColor: `color-mix(in srgb, ${ds.color} 5%, transparent)`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ds.color }}
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          className="truncate font-[family-name:var(--font-michroma)] text-[8px] tracking-wider"
                          style={{ color: ds.color }}
                          title={ds.name}
                        >
                          {ds.name}
                        </span>
                        <span className="text-text-muted text-[8px]">
                          {ds.nodeIds.length} nodes &middot; {ds.edgeIds.length} edges
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        removeImportedDataset(ds.id);
                        addCopilotMessage({
                          id: `remove-${Date.now()}`,
                          role: "system",
                          content: `Dataset removed: "${ds.name}" (${ds.nodeIds.length} nodes, ${ds.edgeIds.length} edges removed from graph).`,
                          timestamp: Date.now(),
                        });
                      }}
                      className="text-[9px] text-accent-red/50 hover:text-accent-red transition-colors opacity-0 group-hover:opacity-100 ml-2 shrink-0 px-1"
                      title="Remove dataset"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5" data-tour="action-buttons">
        {ACTIONS.map((a) => (
          <button
            key={a.action}
            onClick={() => handleAction(a.action)}
            disabled={isLlmStreaming}
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1.5 rounded border transition-colors disabled:opacity-40"
            style={{
              borderColor: `color-mix(in srgb, ${a.color} 40%, transparent)`,
              color: a.color,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${a.color} 10%, transparent)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {a.label}
          </button>
        ))}
        {/* Analyze Node button */}
        {selectedNodeData && (
          <button
            onClick={handleAnalyzeNode}
            disabled={isLlmStreaming}
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1.5 rounded border transition-colors border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 disabled:opacity-40"
          >
            ANALYZE NODE
          </button>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={isLlmStreaming}
            className="flex-1 bg-surface-elevated font-mono text-[11px] text-foreground outline-none px-2.5 py-1.5 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors disabled:opacity-40"
            placeholder={isLlmActive ? "Ask anything (LLM active)..." : "Ask the system to analyze or verify..."}
            spellCheck={false}
          />
          <button
            onClick={handleSubmit}
            disabled={isLlmStreaming}
            className="text-[10px] text-accent-cyan font-mono px-2 py-1.5 hover:bg-accent-cyan/10 rounded transition-colors disabled:opacity-40"
          >
            &gt;
          </button>
        </div>
      </div>
    </aside>
  );
}
