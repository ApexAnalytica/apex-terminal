"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import {
  processAction,
  processQuery,
  processNodeAnalysis,
  streamLlmQuery,
  CopilotAction,
} from "@/lib/copilot-engine";
import { processLlmActionsWithTrace, stripActions } from "@/lib/copilot-actions";
import {
  logTurnTrace,
  hashPrompt,
  newConversationId,
  resolveActiveDataset,
  type TurnTrace,
} from "@/lib/copilot/trace-logger";
import { pruneConversation } from "@/lib/copilot/conversation-window";
import { DOMAIN_CARDS } from "@/lib/domains";
import { CopilotMessage } from "@/lib/types";
import { getModelsForProvider, type LLMProvider } from "@/lib/llm-providers";
import { serializeGraphContext, serializeSnapshotContext, serializeTimeWindowContext } from "@/lib/copilot-context";
import { buildSnapshot } from "@/lib/snapshots/serializer";
import CopilotTraceHistory from "@/components/CopilotTraceHistory";

const ACTIONS: { label: string; action: CopilotAction; color: string }[] = [
  { label: "DISCOVER STRUCTURE", action: "DISCOVER_STRUCTURE", color: "var(--accent-cyan)" },
  { label: "EXPLAIN REJECTION", action: "EXPLAIN_REJECTION", color: "var(--accent-green)" },
  { label: "VERIFY LOGIC", action: "VERIFY_LOGIC", color: "var(--accent-amber)" },
];

// Copilot DEFAULTS to Gemini (set in useApexStore: llmProvider = "gemini").
// The picker in settings can flip to Anthropic or local Ollama; that's a
// per-user opt-in and does not change the on-load default. See the
// "Defaults & invariants" section in docs/sessions/copilot.md.
// Claude is also the heavy-reasoning compute path (separate from copilot
// chat) — that split stays.

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

  // Copilot provider — flows through from llmProvider (default "gemini",
  // see store). Picker in settings lets the user opt into Anthropic or
  // Ollama; default-on-load stays Gemini per the invariant.
  const copilotProvider: LLMProvider = llmProvider;
  const copilotApiKey =
    copilotProvider === "ollama"
      ? "ollama-local"
      : copilotProvider === "anthropic"
        ? claudeApiKey
        : geminiApiKey;
  const copilotModel =
    copilotProvider === "ollama"
      ? ollamaModel
      : copilotProvider === "anthropic"
        ? claudeModel
        : geminiModel;
  const copilotModelOptions = getModelsForProvider(copilotProvider);

  // Claude compute key/model
  const computeApiKey = claudeApiKey;
  const computeModel = claudeModel;

  const [input, setInput] = useState("");
  // ─── Node-name autocomplete state ────────────────────────────
  // As the user types, we look at the current "word" (text from the last
  // whitespace before the cursor up to the cursor) and surface matching
  // graph node labels in a dropdown above the input. Tab / Enter / click
  // inserts; Esc dismisses until the next keystroke; arrow keys navigate.
  const [mention, setMention] = useState<{
    active: boolean;
    /** Lowercase query used to filter nodes. */
    query: string;
    /** Index in `input` where the current word starts (used to splice the
     *  selected label back in). */
    wordStart: number;
    /** Length of the current word (before insertion replaces it). */
    wordLen: number;
    /** Highlighted suggestion in the dropdown. */
    selectedIdx: number;
  }>({ active: false, query: "", wordStart: 0, wordLen: 0, selectedIdx: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [contextBadge, setContextBadge] = useState<string | null>(null);
  // Number of older turns dropped from the prompt window on the
  // most recent send. Drives a small hint in the chat input area
  // so the user knows we're not sending the full history.
  const [truncatedTurns, setTruncatedTurns] = useState<number>(0);
  // (Old isListening state removed — voiceStage covers it now.)
  const [ttsEnabled, setTtsEnabled] = useState(false);
  // ─── Voice conversation mode ──────────────────────────────
  // When `voiceMode` is true, the chat runs hands-free:
  //   listening → processing → speaking → listening (auto-loop)
  // Stage drives the visual indicator and the auto-restart wiring
  // around speech recognition + TTS.
  const [voiceMode, setVoiceMode] = useState(false);
  type VoiceStage = "idle" | "listening" | "processing" | "speaking";
  const [voiceStage, setVoiceStage] = useState<VoiceStage>("idle");
  // Surfaced near the input when set. Cleared on next successful
  // recognition.onstart. Distinct from voiceStage because "error"
  // is orthogonal — you can be in 'listening' with a stale error
  // from a previous retry.
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Refs the speech handlers read to avoid stale closures.
  const voiceModeRef = useRef(false);
  const voiceStageRef = useRef<VoiceStage>("idle");
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { voiceStageRef.current = voiceStage; }, [voiceStage]);
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
  // Voice-mode TTS callback restarts listening — needs a ref so we
  // don't have to thread startListening through useEffect deps.
  const startListeningRef = useRef<(() => void) | null>(null);
  // Conversation identity for trace logging. Stable across the
  // session; resets when the chat is cleared. turn_index is a
  // monotonically increasing counter so we can replay traces in
  // order. Lazily initialized so SSR doesn't call crypto.randomUUID.
  const conversationIdRef = useRef<string | null>(null);
  const turnIndexRef = useRef<number>(0);
  if (conversationIdRef.current === null && typeof window !== "undefined") {
    conversationIdRef.current = newConversationId();
  }

  // Gemini is always active — server-side env var provides the key if the
  // client doesn't have one. Ollama needs no key. Anthropic must have a
  // user-provided key (no server-side fallback today).
  const isLlmActive =
    copilotProvider === "ollama" ||
    copilotProvider === "gemini" ||
    copilotApiKey.length > 0;
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
  const speakText = useCallback((text: string, onFinish?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onFinish?.();
      return;
    }
    window.speechSynthesis.cancel();

    const clean = text
      .replace(/[*_#`~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ", ")
      .trim();

    if (!clean) {
      onFinish?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1;

    // Preference order: British female by named voice → any en-GB
    // female → any en-GB → any English female → any English.
    // The named-voice list covers what macOS / Windows / Chrome
    // typically ship: Kate, Serena, Susan, Hazel are en-GB female.
    const voices = window.speechSynthesis.getVoices();
    const nameMatches = (v: SpeechSynthesisVoice, ...needles: string[]) =>
      needles.some((n) => v.name.includes(n));
    const isFemaleName = (v: SpeechSynthesisVoice) =>
      v.name.toLowerCase().includes("female") ||
      nameMatches(v, "Kate", "Serena", "Susan", "Hazel", "Stephanie", "Fiona", "Tessa", "Karen", "Moira", "Samantha", "Allison", "Ava");
    const preferred =
      // First: named en-GB female voices.
      voices.find((v) => v.lang === "en-GB" && nameMatches(v, "Kate", "Serena", "Susan", "Hazel", "Stephanie")) ??
      // Then: any en-GB voice tagged female (Google's "Google UK English Female", Microsoft "Hazel").
      voices.find((v) => v.lang === "en-GB" && isFemaleName(v)) ??
      voices.find((v) => v.name.includes("Google UK English Female")) ??
      // Then: any en-GB voice.
      voices.find((v) => v.lang === "en-GB") ??
      // Then: any English female.
      voices.find((v) => v.lang.startsWith("en") && isFemaleName(v)) ??
      // Then: any English.
      voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    // Hooks: onend fires when the utterance finishes OR is cancelled.
    // Voice-mode uses onFinish to auto-restart listening.
    utterance.onend = () => onFinish?.();
    utterance.onerror = () => onFinish?.();

    window.speechSynthesis.speak(utterance);
  }, []);

  // Auto-speak assistant responses when TTS or voiceMode is on.
  // In voiceMode, the onFinish hook auto-restarts listening so the
  // chat loops listening → processing → speaking → listening.
  useEffect(() => {
    if (!ttsEnabled && !voiceMode) return;
    const lastMsg = copilotMessages[copilotMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.content) return;
    if (lastMsg.id === lastSpokenMsgRef.current) return;
    if (isLlmStreaming) return;

    lastSpokenMsgRef.current = lastMsg.id;
    if (voiceMode) {
      setVoiceStage("speaking");
      speakText(lastMsg.content, () => {
        // Only restart listening if voice mode is still on (user
        // may have toggled it off mid-speech).
        if (voiceModeRef.current) {
          setVoiceStage("listening");
          // Defer to next tick so any state mutations land first.
          setTimeout(() => {
            if (voiceModeRef.current) startListeningRef.current?.();
          }, 50);
        } else {
          setVoiceStage("idle");
        }
      });
    } else {
      speakText(lastMsg.content);
    }
  }, [copilotMessages, ttsEnabled, voiceMode, isLlmStreaming, speakText]);

  // Load voices (some browsers load them async)
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
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
        // Build messages list including the new user message, then
        // prune to a sliding window. Older turns drop out so prompts
        // stay lean as conversations grow. droppedCount drives the
        // small UI hint below the chat input.
        const fullHistory = [
          ...copilotMessages.filter((m) => m.role !== "system"),
          { id: "temp", role: "user" as const, content: userContent, timestamp: Date.now() },
        ];
        const { kept: allMessages, droppedCount } = pruneConversation(fullHistory);
        setTruncatedTurns(droppedCount);

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
        const { displayText, actionResults, toolCalls } = processLlmActionsWithTrace(accumulated);
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

        // \u2500\u2500\u2500 Trace logging (PR2) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        // Fire-and-forget POST to /api/copilot/trace. We hash the
        // system prompt instead of storing the full text \u2014 too large
        // to log every turn. Logging never awaits and never blocks
        // the chat; failures land in console.warn only.
        try {
          const conversationId = conversationIdRef.current ?? newConversationId();
          conversationIdRef.current = conversationId;
          const turnIndex = turnIndexRef.current++;
          const systemPromptText = serializeGraphContext(graphData, {
            selectedNode,
            severedEdges,
            shocks,
            interventionMode,
            interventionTarget,
            ablationMode,
            ablatedNodeIds,
            ablatedEdgeIds,
            tarskiReport,
          }) + (snapshotContext ? "\n\n" + snapshotContext : "");
          const trace: TurnTrace = {
            conversation_id: conversationId,
            turn_index: turnIndex,
            user_message: userContent,
            assistant_message: accumulated,
            display_text: displayText,
            tool_calls: toolCalls,
            model_provider: copilotProvider,
            model_id: copilotModel,
            system_prompt_hash: hashPrompt(systemPromptText),
            system_prompt_size: systemPromptText.length,
            // Resolved from selectedDomains via the domain catalog.
            // Null when no domains selected (pre-onboarding).
            dataset: resolveActiveDataset(
              useApexStore.getState().selectedDomains,
              DOMAIN_CARDS,
            ),
            active_module: activeModule,
            selected_node: selectedNode,
            active_shock_count: shocks.length,
          };
          // Intentionally not awaited \u2014 logging is best-effort.
          void logTurnTrace(trace);
        } catch (logErr) {
          // Never let trace prep errors leak into the chat.
          console.warn("[copilot-trace] prep failed:", logErr);
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
      activeModule,
      tarskiReport,
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

    // If TTS is mid-utterance and the user is starting to talk,
    // cut the assistant off — feels more natural than waiting for
    // the AI to finish before you can interrupt.
    if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let submitted = false;

    recognition.onstart = () => {
      // Clear any stale error from a prior retry — we're listening now.
      setVoiceError(null);
      if (voiceModeRef.current) setVoiceStage("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      if (event.results[event.results.length - 1].isFinal) {
        setInput(transcript);
        submitted = true;
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
            if (voiceModeRef.current) setVoiceStage("processing");
            if (isLlmActive) {
              handleStreamingQuery(trimmed);
            } else {
              const responses = processQuery(trimmed, graphData);
              responses.forEach((msg) => addCopilotMessage(msg));
            }
            setInput("");
          } else if (voiceModeRef.current) {
            // Empty utterance but voice mode is on — restart so the
            // user can try again without re-toggling.
            setTimeout(() => {
              if (voiceModeRef.current) startListeningRef.current?.();
            }, 100);
          }
        }, 100);
      }
    };

    recognition.onerror = (event: Event) => {
      // SpeechRecognitionErrorEvent isn't in lib.dom.d.ts but it
      // carries an `error` string with the Web Speech API codes
      // ("not-allowed", "audio-capture", "network", etc).
      const code = (event as Event & { error?: string }).error ?? "unknown";
      const permanent =
        code === "not-allowed" ||
        code === "service-not-allowed" ||
        code === "audio-capture";

      const message =
        code === "not-allowed"
          ? "Microphone permission denied. Click the lock icon in the address bar to allow microphone access, then click the mic again."
          : code === "service-not-allowed"
            ? "Speech recognition service unavailable in this browser."
            : code === "audio-capture"
              ? "No microphone detected on this device."
              : code === "network"
                ? "Speech recognition needs an internet connection."
                : code === "no-speech"
                  ? null // common, not worth surfacing
                  : code === "aborted"
                    ? null // we aborted intentionally
                    : `Speech recognition error: ${code}`;

      if (message) setVoiceError(message);

      if (permanent) {
        // Hard stop — drop out of voice mode so the user sees the
        // error + can fix it without an infinite restart loop.
        setVoiceMode(false);
        setVoiceStage("idle");
        return;
      }

      // Transient: retry from the listening stage (skip if we
      // already moved to processing — that path is owned by
      // onresult/handleStreamingQuery).
      if (voiceModeRef.current && voiceStageRef.current !== "processing") {
        setTimeout(() => {
          if (voiceModeRef.current && voiceStageRef.current !== "processing") {
            startListeningRef.current?.();
          }
        }, 500);
      }
    };
    recognition.onend = () => {
      // If we never got a final result AND voice mode is on, restart.
      // (Long silences trigger onend without onresult.)
      if (voiceModeRef.current && !submitted && voiceStageRef.current === "listening") {
        setTimeout(() => {
          if (voiceModeRef.current && voiceStageRef.current === "listening") {
            startListeningRef.current?.();
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;
    // Guard against InvalidStateError when start() is called too
    // soon after stop(). Browsers vary on the cooldown — if we
    // catch it, schedule a retry after a longer delay.
    try {
      recognition.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Most common: "Failed to execute 'start' on 'SpeechRecognition':
      // recognition has already started." Wait a beat and retry.
      if (voiceModeRef.current && msg.toLowerCase().includes("already")) {
        setTimeout(() => {
          if (voiceModeRef.current) startListeningRef.current?.();
        }, 300);
      } else {
        setVoiceError(`Couldn't start microphone: ${msg}`);
      }
    }
  }, [addCopilotMessage, isLlmActive, handleStreamingQuery, graphData]);

  // Keep the ref pointing at the latest closure so voiceMode
  // auto-restart logic can call startListening without circular deps.
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ─── Voice-mode toggle ──────────────────────────────────
  // Single button. When entering, kick off listening; when
  // exiting, cancel any speech and stop the recognition loop.
  const toggleVoiceMode = useCallback(() => {
    const next = !voiceMode;
    setVoiceMode(next);
    if (next) {
      // Cancel any in-flight TTS before starting (clean state).
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      setVoiceStage("listening");
      setTimeout(() => startListeningRef.current?.(), 50);
    } else {
      // Tear down cleanly. recognition.stop() will fire onend, but
      // voiceModeRef is already false so the restart branch skips.
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      /* listening state now reflected via voiceStage */
      setVoiceStage("idle");
    }
  }, [voiceMode]);

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
    setMention((m) => ({ ...m, active: false }));
  };

  // ─── Node-name autocomplete: matches + handlers ────────────────
  const MAX_MENTION_RESULTS = 8;
  const MIN_QUERY_LEN = 2;

  /** Score a node against the query: substring of full label > substring of
   *  short label > prefix match > anywhere. Lower is better. We only show
   *  up to MAX_MENTION_RESULTS, sorted ascending by score. */
  const mentionMatches = useMemo(() => {
    if (!mention.active || mention.query.length < MIN_QUERY_LEN) return [];
    const q = mention.query.toLowerCase();
    const nodes = graphData.nodes;
    type Scored = { node: typeof nodes[number]; score: number };
    const scored: Scored[] = [];
    for (const node of nodes) {
      const label = node.label.toLowerCase();
      const short = (node.shortLabel ?? "").toLowerCase();
      let score = Infinity;
      if (label.startsWith(q)) score = 0;
      else if (short.startsWith(q)) score = 1;
      else if (label.includes(q)) score = 2;
      else if (short && short.includes(q)) score = 3;
      if (score < Infinity) scored.push({ node, score });
    }
    scored.sort((a, b) => a.score - b.score || a.node.label.localeCompare(b.node.label));
    return scored.slice(0, MAX_MENTION_RESULTS).map((s) => s.node);
  }, [mention.active, mention.query, graphData]);

  /** Re-derive mention state from the input value + cursor position. Called
   *  on every change. The "current word" is text from the last whitespace
   *  before the cursor (exclusive) to the cursor. We only activate when the
   *  word is at least MIN_QUERY_LEN characters; this keeps the dropdown
   *  silent during normal English typing where short stop-words ("is",
   *  "to") wouldn't match anything anyway. */
  const updateMention = useCallback((value: string, cursor: number) => {
    const upToCursor = value.slice(0, cursor);
    // Find the last whitespace before the cursor; current word starts after it.
    const wsMatch = /\s\S*$/.exec(upToCursor);
    const wordStart = wsMatch ? wsMatch.index + 1 : 0;
    const word = value.slice(wordStart, cursor);
    if (word.length >= MIN_QUERY_LEN) {
      setMention({
        active: true,
        query: word,
        wordStart,
        wordLen: word.length,
        selectedIdx: 0,
      });
    } else {
      setMention((m) => (m.active ? { ...m, active: false } : m));
    }
  }, []);

  /** Splice the chosen node's label into the input where the user was
   *  typing the partial. Adds a trailing space if the next char isn't
   *  already whitespace (so the cursor lands ready to keep typing). */
  const insertMention = useCallback(
    (label: string) => {
      const before = input.slice(0, mention.wordStart);
      const after = input.slice(mention.wordStart + mention.wordLen);
      const sep = after === "" || after.startsWith(" ") ? "" : " ";
      const next = before + label + sep + after;
      setInput(next);
      setMention((m) => ({ ...m, active: false }));
      const newCursor = (before + label + sep).length;
      // Restore focus + place cursor right after the inserted label so the
      // user can keep typing without re-clicking.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(newCursor, newCursor);
      });
    },
    [input, mention.wordStart, mention.wordLen],
  );

  // Not memoized: the key handler reads handleSubmit + mention state on
  // every render, so memoizing it just adds noise without saving work.
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Autocomplete navigation takes priority when the dropdown is open.
    if (mention.active && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((m) => ({
          ...m,
          selectedIdx: (m.selectedIdx + 1) % mentionMatches.length,
        }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((m) => ({
          ...m,
          selectedIdx: (m.selectedIdx - 1 + mentionMatches.length) % mentionMatches.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionMatches[mention.selectedIdx].label);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention((m) => ({ ...m, active: false }));
        return;
      }
    }
    if (e.key === "Enter") handleSubmit();
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
                : copilotProvider === "anthropic"
                  ? isLlmActive
                    ? `Claude-Augmented Analysis (${copilotModel})`
                    : "Claude — key required"
                  : isLlmActive
                    ? `Gemini-Augmented Analysis (${copilotModel})`
                    : "Synthetic Scientist Interface"}
              {isComputeAvailable && " + Claude Compute"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Voice conversation mode (hands-free loop) */}
            <button
              onClick={toggleVoiceMode}
              className={`text-[11px] transition-colors p-1 ${
                voiceMode
                  ? voiceStage === "listening"
                    ? "text-accent-cyan animate-pulse"
                    : voiceStage === "speaking"
                      ? "text-accent-green"
                      : voiceStage === "processing"
                        ? "text-accent-amber"
                        : "text-accent-cyan"
                  : "text-text-muted hover:text-accent-cyan"
              }`}
              title={
                voiceMode
                  ? `Voice Conversation: ${voiceStage}. Click to exit.`
                  : "Start Voice Conversation (hands-free)"
              }
            >
              {voiceMode ? "🎙️" : "🎤"}
            </button>
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
                onClick={() => { setShowDatasets(!showDatasets); if (!showDatasets) { setShowSettings(false); setShowHistory(false); } }}
                className={`text-[11px] transition-colors p-1 ${
                  showDatasets ? "text-accent-amber" : "text-text-muted hover:text-accent-amber"
                }`}
                title="Imported Datasets"
              >
                {showDatasets ? "\u2715" : "\u25A4"}
              </button>
            )}
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) { setShowSettings(false); setShowDatasets(false); } }}
              className={`text-[11px] transition-colors p-1 ${
                showHistory ? "text-accent-green" : "text-text-muted hover:text-accent-green"
              }`}
              title="Your Conversation History"
            >
              {showHistory ? "\u2715" : "\u29C9"}
            </button>
            <button
              onClick={() => { setShowSettings(!showSettings); if (!showSettings) { setShowDatasets(false); setShowHistory(false); } }}
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
                    COPILOT PROVIDER <span className="text-text-muted/60">— DEFAULT: GEMINI</span>
                  </div>
                  <div className="flex gap-1">
                    {(["gemini", "anthropic", "ollama"] as const).map((p) => (
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
                        {p === "gemini" ? "GEMINI" : p === "anthropic" ? "CLAUDE" : "OLLAMA"}
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

                {/* Anthropic (Claude) config — opt-in copilot path */}
                {copilotProvider === "anthropic" && (
                  <div className="space-y-1">
                    <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                      CLAUDE — COPILOT
                    </div>
                    <input
                      type="password"
                      value={claudeApiKey}
                      onChange={(e) => setClaudeApiKey(e.target.value)}
                      className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors"
                      placeholder="sk-ant-... (session only)"
                      spellCheck={false}
                    />
                    <select
                      value={copilotModel}
                      onChange={(e) => setClaudeModel(e.target.value)}
                      className="w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border transition-colors"
                    >
                      {copilotModelOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {claudeApiKey.length > 0 && (
                      <div className="text-[8px] text-accent-green font-mono tracking-wider">
                        CLAUDE COPILOT ACTIVE
                      </div>
                    )}
                    <div className="text-[8px] font-mono text-text-muted leading-relaxed">
                      The same key powers compute below. Switching providers
                      doesn&apos;t change the on-load default (Gemini).
                    </div>
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

        {/* Trace history panel — opens via the ⧉ icon next to settings */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <CopilotTraceHistory open={showHistory} />
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

        {/* Voice-mode stage indicator — shown only when voice
            conversation mode is active. Lets the user see at a
            glance whether the chat is waiting on them, processing,
            or speaking. */}
        {voiceMode && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-mono tracking-wider">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                voiceStage === "listening"
                  ? "bg-accent-cyan animate-pulse"
                  : voiceStage === "processing"
                    ? "bg-accent-amber animate-pulse"
                    : voiceStage === "speaking"
                      ? "bg-accent-green"
                      : "bg-text-muted/40"
              }`}
            />
            <span className="text-text-muted">
              VOICE: {voiceStage.toUpperCase()}
              {voiceStage === "listening" && " (talk now)"}
              {voiceStage === "processing" && " (thinking)"}
              {voiceStage === "speaking" && " (you can interrupt)"}
            </span>
          </div>
        )}

        {/* Voice error — surfaces recognition failures (mic denied,
            no mic, network) instead of silently looping. Shown
            whether voice mode is currently on or already kicked
            out of voice mode by a permanent error. */}
        {voiceError && (
          <div className="mt-1.5 flex items-start gap-1.5 text-[9px] font-mono tracking-wider text-accent-amber">
            <span className="shrink-0">⚠</span>
            <span className="flex-1">{voiceError}</span>
            <button
              onClick={() => setVoiceError(null)}
              className="shrink-0 text-text-muted/70 hover:text-foreground"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Truncation hint — shown when older turns dropped from the
            prompt window. Surfaces so the user knows we're not
            sending the entire history. */}
        {truncatedTurns > 0 && (
          <div className="mt-1.5 text-[8px] font-mono tracking-wider text-text-muted/70">
            {truncatedTurns} earlier turn{truncatedTurns === 1 ? "" : "s"} omitted from context
          </div>
        )}
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
          <div className="flex-1 relative">
            {/* Node-name autocomplete dropdown — sits above the input
                because the input is at the bottom of a tall sidebar; a
                downward popup would clip off-viewport. */}
            {mention.active && mentionMatches.length > 0 && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded border border-accent-cyan/30 bg-surface-elevated shadow-2xl z-50"
                role="listbox"
                aria-label="Node name suggestions"
              >
                <div className="px-2 py-1 border-b border-border/50 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/70">
                  {mentionMatches.length} {mentionMatches.length === 1 ? "MATCH" : "MATCHES"} · ↑↓ NAV · ⏎ INSERT · ESC DISMISS
                </div>
                {mentionMatches.map((node, i) => {
                  const isActive = i === mention.selectedIdx;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      // mousedown fires before the input's blur, so the
                      // dropdown isn't dismissed before the click registers.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(node.label);
                      }}
                      onMouseEnter={() =>
                        setMention((m) => ({ ...m, selectedIdx: i }))
                      }
                      className={`w-full text-left px-2 py-1.5 text-[10px] font-mono truncate transition-colors ${
                        isActive
                          ? "bg-accent-cyan/15 text-accent-cyan"
                          : "text-text-muted hover:bg-white/[0.04] hover:text-foreground"
                      }`}
                      role="option"
                      aria-selected={isActive}
                      title={node.label}
                    >
                      {node.label}
                      {node.shortLabel && node.shortLabel !== node.label && (
                        <span className="text-[8px] opacity-50 ml-1">· {node.shortLabel}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                const v = e.target.value;
                const cursor = e.target.selectionStart ?? v.length;
                setInput(v);
                updateMention(v, cursor);
              }}
              onKeyDown={handleInputKeyDown}
              onBlur={() => {
                // Small delay so a mousedown on a dropdown item can fire
                // before the dropdown unmounts (mousedown does call
                // preventDefault, but blur still fires after this hander
                // returns; defer the close).
                setTimeout(() => setMention((m) => ({ ...m, active: false })), 120);
              }}
              disabled={isLlmStreaming}
              className="w-full bg-surface-elevated font-mono text-[11px] text-foreground outline-none px-2.5 py-1.5 rounded border border-border placeholder:text-text-muted focus:border-accent-cyan/50 transition-colors disabled:opacity-40"
              placeholder={copilotProvider === "ollama" ? "Ask anything (Ollama local)..." : isLlmActive ? "Ask anything (LLM active)..." : "Ask the system to analyze or verify..."}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {/* Voice input lives in the header now (\uD83C\uDFA4 voice mode toggle).
              The old one-shot dictation button below the input was
              redundant \u2014 two mic icons, one of which was a mode-toggle
              and one a push-to-talk, with no visual distinction. */}
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
