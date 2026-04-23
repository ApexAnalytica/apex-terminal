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
import { processLlmActions, stripActions } from "@/lib/copilot-actions";
import { CopilotMessage } from "@/lib/types";
import { getModelsForProvider, type LLMProvider } from "@/lib/llm-providers";
import { serializeGraphContext, serializeSnapshotContext, serializeTimeWindowContext } from "@/lib/copilot-context";
import { buildSnapshot } from "@/lib/snapshots/serializer";

const ACTIONS: { label: string; action: CopilotAction; color: string }[] = [
  { label: "DISCOVER STRUCTURE", action: "DISCOVER_STRUCTURE", color: "var(--accent-cyan)" },
  { label: "EXPLAIN REJECTION", action: "EXPLAIN_REJECTION", color: "var(--accent-green)" },
  { label: "VERIFY LOGIC", action: "VERIFY_LOGIC", color: "var(--accent-amber)" },
];

// Copilot is locked to Gemini; Claude is used exclusively for compute.

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
  // Fine-grained selectors — subscribe only to fields this component actually
  // uses, so unrelated store mutations (graph topology, timeline scrub, etc.)
  // don't trigger re-renders here (item #8).
  const copilotMessages = useApexStore((s) => s.copilotMessages);
  const addCopilotMessage = useApexStore((s) => s.addCopilotMessage);
  const graphData = useApexStore((s) => s.graphData);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const shocks = useApexStore((s) => s.shocks);
  const interventionMode = useApexStore((s) => s.interventionMode);
  const interventionTarget = useApexStore((s) => s.interventionTarget);
  const ablationMode = useApexStore((s) => s.ablationMode);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const ablatedEdgeIds = useApexStore((s) => s.ablatedEdgeIds);
  const activeModule = useApexStore((s) => s.activeModule);
  const llmProvider = useApexStore((s) => s.llmProvider);
  const claudeApiKey = useApexStore((s) => s.claudeApiKey);
  const geminiApiKey = useApexStore((s) => s.geminiApiKey);
  const claudeModel = useApexStore((s) => s.claudeModel);
  const geminiModel = useApexStore((s) => s.geminiModel);
  const ollamaUrl = useApexStore((s) => s.ollamaUrl);
  const ollamaModel = useApexStore((s) => s.ollamaModel);
  const isLlmStreaming = useApexStore((s) => s.isLlmStreaming);
  const setLlmProvider = useApexStore((s) => s.setLlmProvider);
  const setClaudeApiKey = useApexStore((s) => s.setClaudeApiKey);
  const setGeminiApiKey = useApexStore((s) => s.setGeminiApiKey);
  const setClaudeModel = useApexStore((s) => s.setClaudeModel);
  const setGeminiModel = useApexStore((s) => s.setGeminiModel);
  const setOllamaUrl = useApexStore((s) => s.setOllamaUrl);
  const setOllamaModel = useApexStore((s) => s.setOllamaModel);
  const setIsLlmStreaming = useApexStore((s) => s.setIsLlmStreaming);
  const importedDatasets = useApexStore((s) => s.importedDatasets);
  const removeImportedDataset = useApexStore((s) => s.removeImportedDataset);
  const currentSnapshot = useApexStore((s) => s.currentSnapshot);
  const snapshotHistory = useApexStore((s) => s.snapshotHistory);
  const isComputeLoading = useApexStore((s) => s.isComputeLoading);
  const setSnapshot = useApexStore((s) => s.setSnapshot);
  const setIsComputeLoading = useApexStore((s) => s.setIsComputeLoading);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const currentEpoch = useApexStore((s) => s.currentEpoch);
  const tarskiReport = useApexStore((s) => s.tarskiReport);

  // Copilot provider: Gemini or Ollama; Claude is for compute only
  const copilotProvider: LLMProvider = llmProvider === "ollama" ? "ollama" : "gemini";
  const copilotApiKey = copilotProvider === "ollama" ? "ollama-local" : geminiApiKey;
  const copilotModel = copilotProvider === "ollama" ? ollamaModel : geminiModel;
  const copilotModelOptions = getModelsForProvider(copilotProvider);

  // Claude compute key/model
  const computeApiKey = claudeApiKey;
  const computeModel = claudeModel;

  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [contextBadge, setContextBadge] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const datasetPanelRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const streamingMsgRef = useRef<string | null>(null);
  // Streaming text is held in a ref (not store state) during the stream so each
  // token doesn't trigger a full store subscriber cascade (item #8).
  // Local React state is used for incremental UI updates instead.
  const streamingTextRef = useRef<string>("");
  const [streamingDisplayText, setStreamingDisplayText] = useState<string>("");
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastSpokenMsgRef = useRef<string | null>(null);

  // Gemini is always active — server-side env var provides the key if client doesn't
  const isLlmActive = copilotProvider === "ollama" || copilotProvider === "gemini" || copilotApiKey.length > 0;
  const isComputeAvailable = computeApiKey.length > 0;

  // Stable refs for event handlers to avoid stale closures in CustomEvent listeners
  const handleStreamingQueryRef = useRef<(q: string) => void>(() => {});
  const isLlmActiveRef = useRef(isLlmActive);

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

  // ─── Voice Output (Text-to-Speech) ─────────────────────
  const speakText = useCallback((text: string) => {
    if (!ttsEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const clean = text
      .replace(/[*_#`~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ", ")
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.name.includes("Daniel") || v.name.includes("Google UK English Male") || v.name.includes("Alex")
    ) ?? voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("male"))
      ?? voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  // Force-speak text (ignores TTS toggle — used for explicit click-to-speak)
  const forceSpeakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const clean = text
      .replace(/[*_#`~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ", ")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.92;
    utterance.pitch = 0.82;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.name.includes("Daniel") || v.name.includes("Google UK English Male") || v.name.includes("Alex")
    ) ?? voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("male"))
      ?? voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  }, []);

  // Auto-speak assistant responses when TTS is enabled
  useEffect(() => {
    if (!ttsEnabled) return;
    const lastMsg = copilotMessages[copilotMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.content) return;
    if (lastMsg.id === lastSpokenMsgRef.current) return;
    if (isLlmStreaming) return;

    lastSpokenMsgRef.current = lastMsg.id;
    speakText(lastMsg.content);
  }, [copilotMessages, ttsEnabled, isLlmStreaming, speakText]);

  // Load voices (some browsers load them async)
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Listen for click-to-speak events from panel content
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.text) return;
      const title = detail.title || "SYSTEM READOUT";
      // Add as assistant message to copilot
      addCopilotMessage({
        id: `readout-${Date.now()}`,
        role: "assistant",
        content: `**${title}**\n\n${detail.text}`,
        timestamp: Date.now(),
      });
      // Always speak (regardless of TTS toggle)
      forceSpeakText(`${title}. ${detail.text}`);
    };
    window.addEventListener("apex-speak-content", handler);
    return () => window.removeEventListener("apex-speak-content", handler);
  }, [addCopilotMessage, forceSpeakText]);

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

  // ─── Compute with Claude ───────────────────────────────────
  const handleComputeWithClaude = useCallback(async () => {
    if (isComputeLoading) return;
    setIsComputeLoading(true);

    addCopilotMessage({
      id: `sys-compute-${Date.now()}`,
      role: "system",
      content: "Computing snapshot with Claude...",
      timestamp: Date.now(),
    });

    try {
      if (isComputeAvailable) {
        // Claude API call
        const graphContext = serializeGraphContext(graphData, {
          selectedNode,
          severedEdges,
          shocks,
          interventionMode,
          interventionTarget,
          ablationMode,
          ablatedNodeIds,
          ablatedEdgeIds,
        });

        const res = await fetch("/api/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            graphContext,
            apiKey: computeApiKey,
            model: computeModel,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const snapshot = await res.json();
        setSnapshot(snapshot);

        addCopilotMessage({
          id: `sys-compute-done-${Date.now()}`,
          role: "system",
          content: `Snapshot computed (Claude). Tarski: ${snapshot.tarskiValidation?.status ?? "PENDING"}. ${snapshot.tarskiValidation?.violations?.length ?? 0} violation(s).`,
          timestamp: Date.now(),
        });
      } else {
        // Fallback: local snapshot (no Claude key)
        const snapshot = buildSnapshot({
          graph: graphData,
          shocks,
          severedEdges,
          activeModule,
          epochs: baselineEpochs.length > 0 ? baselineEpochs : undefined,
          currentEpoch: baselineEpochs.length > 0 ? currentEpoch : undefined,
        });
        setSnapshot(snapshot);

        addCopilotMessage({
          id: `sys-compute-local-${Date.now()}`,
          role: "system",
          content: `Snapshot computed (local). Tarski: ${snapshot.tarskiValidation?.status ?? "PENDING"}. ${snapshot.tarskiValidation?.violations?.length ?? 0} violation(s).`,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Compute failed";
      addCopilotMessage({
        id: `sys-compute-err-${Date.now()}`,
        role: "system",
        content: `[COMPUTE ERROR: ${message}]`,
        timestamp: Date.now(),
      });
    } finally {
      setIsComputeLoading(false);
    }
  }, [
    isComputeLoading,
    isComputeAvailable,
    graphData,
    selectedNode,
    severedEdges,
    shocks,
    interventionMode,
    interventionTarget,
    ablationMode,
    ablatedNodeIds,
    ablatedEdgeIds,
    activeModule,
    baselineEpochs,
    currentEpoch,
    computeApiKey,
    computeModel,
    addCopilotMessage,
    setSnapshot,
    setIsComputeLoading,
  ]);

  // ─── Streaming query (Gemini copilot) ─────────────────────
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

        // Enrich system context with snapshot data if available
        let snapshotContext = snapshotHistory.length > 0
          ? serializeSnapshotContext(snapshotHistory)
          : "";

        // Add temporal window context if a time range is selected
        const timelineSel = useApexStore.getState().timelineSelection;
        const tempData = useApexStore.getState().temporalData;
        if (timelineSel && tempData) {
          snapshotContext += serializeTimeWindowContext(timelineSel, tempData, graphData);
        }

        const stream = await streamLlmQuery({
          copilotMessages: allMessages,
          graph: graphData,
          apiKey: copilotApiKey,
          model: copilotModel,
          provider: copilotProvider,
          selectedNode,
          severedEdges,
          shocks,
          interventionMode,
          interventionTarget,
          ablationMode,
          ablatedNodeIds,
          ablatedEdgeIds,
          snapshotContext,
          tarskiReport,
          ollamaUrl: copilotProvider === "ollama" ? ollamaUrl : undefined,
        });

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        streamingTextRef.current = "";
        setStreamingDisplayText("");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          // During streaming, keep text in local ref/state — NOT in the store —
          // so per-token updates don't cascade to every store subscriber (item #8).
          const displayTextStreaming = stripActions(accumulated);
          streamingTextRef.current = displayTextStreaming;
          setStreamingDisplayText(displayTextStreaming);
        }

        // After streaming completes, execute any actions from the full response
        const { displayText, actionResults } = processLlmActions(accumulated);
        // Flush final text to the store in one write
        useApexStore.setState((s) => ({
          copilotMessages: s.copilotMessages.map((m) =>
            m.id === assistantId ? { ...m, content: displayText } : m
          ),
        }));
        // Reset local streaming state
        streamingTextRef.current = "";
        setStreamingDisplayText("");
        // Log action results as system messages
        if (actionResults.length > 0) {
          const actionSummary = actionResults.map((r) => `  \u2022 ${r}`).join("\n");
          addCopilotMessage({
            id: `sys-actions-${Date.now()}`,
            role: "system",
            content: `ACTIONS EXECUTED:\n${actionSummary}`,
            timestamp: Date.now(),
          });
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
        streamingTextRef.current = "";
        setStreamingDisplayText("");
        setIsLlmStreaming(false);
      }
    },
    [
      copilotMessages,
      graphData,
      copilotApiKey,
      copilotModel,
      copilotProvider,
      ollamaUrl,
      snapshotHistory,
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

  // Keep refs in sync so event listeners always call latest versions
  handleStreamingQueryRef.current = handleStreamingQuery;
  isLlmActiveRef.current = isLlmActive;

  // Listen for analyze-selection events from DAGOverlay (stable listener via refs)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.prompt && isLlmActiveRef.current) {
        handleStreamingQueryRef.current(detail.prompt);
      } else if (detail?.prompt) {
        addCopilotMessage({
          id: `sys-sel-${Date.now()}`,
          role: "assistant",
          content: "LLM not configured. Please set up Gemini or Ollama in settings to analyze selections.",
          timestamp: Date.now(),
        });
      }
    };
    window.addEventListener("apex-analyze-selection", handler);
    return () => window.removeEventListener("apex-analyze-selection", handler);
  }, [addCopilotMessage]);

// ─── Voice Input (Speech-to-Text) ────────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addCopilotMessage({
        id: `sys-voice-${Date.now()}`,
        role: "system",
        content: "Speech recognition not supported in this browser.",
        timestamp: Date.now(),
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      if (event.results[event.results.length - 1].isFinal) {
        setInput(transcript);
        setTimeout(() => {
          const trimmed = transcript.trim();
          if (trimmed) {
            const userMsg: CopilotMessage = {
              id: `user-${Date.now()}`,
              role: "user",
              content: trimmed,
              timestamp: Date.now(),
            };
            addCopilotMessage(userMsg);
            if (isLlmActive) {
              handleStreamingQuery(trimmed);
            } else {
              const responses = processQuery(trimmed, graphData);
              responses.forEach((msg) => addCopilotMessage(msg));
            }
            setInput("");
          }
        }, 100);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [addCopilotMessage, isLlmActive, handleStreamingQuery, graphData]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

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
      const responses = processAction(action, graphData, tarskiReport);
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
              {copilotProvider === "ollama"
                ? `Ollama Local (${ollamaModel})`
                : isLlmActive
                  ? "Gemini-Augmented Analysis"
                  : "Synthetic Scientist Interface"}
              {isComputeAvailable && " + Claude Compute"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* TTS toggle */}
            <button
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabled(next);
                if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
              }}
              className={`text-[11px] transition-colors p-1 ${
                ttsEnabled ? "text-accent-green" : "text-text-muted hover:text-accent-green"
              }`}
              title={ttsEnabled ? "Voice Output ON — click to disable" : "Enable Voice Output"}
            >
              {ttsEnabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
            </button>
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
              <div className="mt-2 pt-2 border-t border-border space-y-2">
                {/* Provider toggle */}
                <div className="space-y-1">
                  <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                    COPILOT PROVIDER
                  </div>
                  <div className="flex gap-1">
                    {(["gemini", "ollama"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setLlmProvider(p)}
                        className="flex-1 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1 rounded border transition-all"
                        style={{
                          borderColor: copilotProvider === p ? "var(--accent-cyan)" : "var(--border)",
                          backgroundColor: copilotProvider === p ? "rgba(0,229,255,0.08)" : "transparent",
                          color: copilotProvider === p ? "var(--accent-cyan)" : "var(--text-muted)",
                        }}
                      >
                        {p === "gemini" ? "GEMINI" : "OLLAMA"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gemini config */}
                {copilotProvider === "gemini" && (
                  <div className="space-y-1">
                    <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                      GEMINI — COPILOT
                    </div>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors"
                      placeholder="AIza... (session only)"
                      spellCheck={false}
                    />
                    <select
                      value={copilotModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border transition-colors"
                    >
                      {copilotModelOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {geminiApiKey.length > 0 && (
                      <div className="text-[8px] text-accent-green font-mono tracking-wider">
                        GEMINI ACTIVE
                      </div>
                    )}
                  </div>
                )}

                {/* Ollama config */}
                {copilotProvider === "ollama" && (
                  <div className="space-y-1">
                    <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                      OLLAMA — LOCAL LLM
                    </div>
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors"
                      placeholder="http://localhost:11434"
                      spellCheck={false}
                    />
                    <select
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border transition-colors"
                    >
                      {copilotModelOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-[8px] text-accent-green font-mono tracking-wider">
                      OLLAMA MODE — no API key needed
                    </div>
                    <div className="text-[8px] font-mono text-text-muted leading-relaxed">
                      Run &quot;ollama serve&quot; locally. Models: ollama pull llama3.1:8b
                    </div>
                  </div>
                )}
                {/* Claude (Compute) */}
                <div className="space-y-1 pt-1.5 border-t border-border">
                  <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                    CLAUDE — COMPUTE
                  </div>
                  <input
                    type="password"
                    value={claudeApiKey}
                    onChange={(e) => setClaudeApiKey(e.target.value)}
                    className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors"
                    placeholder="sk-ant-... (session only)"
                    spellCheck={false}
                  />
                  {isComputeAvailable && (
                    <div className="text-[8px] text-accent-green font-mono tracking-wider">
                      CLAUDE COMPUTE READY
                    </div>
                  )}
                </div>
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
                  {/* During streaming, show local state text (not store) to avoid
                      per-token store subscriber cascade (item #8) */}
                  {msg.id === streamingMsgRef.current && isLlmStreaming
                    ? streamingDisplayText
                    : msg.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Thinking indicator — show while streaming has not yet produced text */}
          {isLlmStreaming && streamingDisplayText === "" && (
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
        {/* Compute with Claude button */}
        <button
          onClick={handleComputeWithClaude}
          disabled={isComputeLoading || isLlmStreaming}
          className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1.5 rounded border transition-colors border-accent-amber/40 text-accent-amber hover:bg-accent-amber/10 disabled:opacity-40"
        >
          {isComputeLoading ? "COMPUTING..." : isComputeAvailable ? "COMPUTE WITH CLAUDE" : "COMPUTE (LOCAL)"}
        </button>
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
            placeholder={copilotProvider === "ollama" ? "Ask anything (Ollama local)..." : isLlmActive ? "Ask anything (LLM active)..." : "Ask the system to analyze or verify..."}
            spellCheck={false}
          />
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isLlmStreaming}
            className={`text-[12px] px-1.5 py-1.5 rounded transition-colors disabled:opacity-40 ${
              isListening
                ? "text-accent-red bg-accent-red/10 animate-pulse"
                : "text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/10"
            }`}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            {isListening ? "\u23F9" : "\uD83C\uDF99"}
          </button>
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
