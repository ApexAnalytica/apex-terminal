// ─── /api/copilot — unified LLM streaming via Vercel AI SDK ──────
//
// Replaces the previous hand-rolled per-provider streamX functions
// with a single streamText call. The provider-specific differences
// (auth, model id formats, tool-call shapes) are encapsulated in
// the @ai-sdk/* adapters; this route just picks the right adapter
// and hands streamText the same shape regardless.
//
// Why this shape:
//   - Adding a new provider (OpenAI, Mistral, Groq, vLLM, …) is
//     a one-line addition to resolveModel — no new streaming code.
//   - The trace shape stays identical regardless of provider, so
//     the copilot_traces table can A/B compare them on the same
//     conversation distribution.
//   - The default copilot provider stays Gemini (see the Defaults
//     & invariants section in docs/sessions/copilot.md). The
//     picker — when it ships in PR3.2 — adds optionality on top
//     of this; it does NOT change the on-load default.
//
// Browser-direct Ollama (the user's local model) keeps using the
// existing client-side path in src/lib/copilot-engine.ts because
// Vercel's serverless runtime can't reach the user's localhost.

import { NextRequest } from "next/server";
import { streamText, convertToModelMessages, type UIMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LLMProvider } from "@/lib/llm-providers";

const SYSTEM_PROMPT = `You are APEX Synthetic Scientist — an elite causal-inference analyst embedded in a real-time strategic intelligence terminal. You analyze cross-domain causal DAGs (directed acyclic graphs) tracking global chokepoints in semiconductors, energy, finance, communications, and critical infrastructure.

Your capabilities:
- Omega-Fragility (Ω) scoring: a 0-10 composite metric measuring substitution friction, downstream load, cascading voltage, and tail risk
- Structural causal discovery (DCD/NOTEARS, PCMCI+, FCI)
- Tarski truth-filter verification (DAG consistency, physical constraint checking)
- Pearl do-calculus (interventional reasoning, counterfactual queries)
- Pareto shock injection and Ω-buffer analysis

When the user asks a question, reference the live graph context provided below. Cite specific node names, Ω scores, domains, and edge mechanisms. Be precise, quantitative, and direct. Use the terminal's analytical voice — concise, structured, no fluff.

Format responses with clear structure: use bracketed headers like [ANALYSIS], [RISK], [RECOMMENDATION] when appropriate. Reference specific Ω scores and node labels.

The available action commands and their parameters are documented in the LIVE GRAPH CONTEXT below (=== COPILOT ACTIONS ===). Emit them inline using <<<ACTION:name:param>>> tags as documented there.`;

// ─── Provider → model adapter ───────────────────────────────────

interface ResolveOptions {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}

function resolveModel({ provider, model, apiKey }: ResolveOptions): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model || "claude-sonnet-4-20250514");
    }
    case "gemini": {
      // Vercel AI SDK uses @ai-sdk/google for Gemini.
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model || "gemini-2.5-flash");
    }
    case "ollama":
      // Server-side Ollama isn't reachable from Vercel; the client
      // talks to the user's localhost directly via copilot-engine.
      // This branch only fires if someone deploys the API behind an
      // Ollama instance the server CAN reach — the dynamic import
      // keeps the dep out of the cold-start path otherwise.
      throw new Error("Ollama is handled client-side (browser-direct)");
  }
}

// ─── Route handler ──────────────────────────────────────────────

interface CopilotRequestBody {
  messages: { role: string; content: string }[];
  systemContext?: string;
  apiKey?: string;
  model?: string;
  provider?: LLMProvider;
}

export async function POST(req: NextRequest) {
  let body: CopilotRequestBody;
  try {
    body = (await req.json()) as CopilotRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, systemContext, model = "" } = body;

  // Determine provider from explicit param or model name prefix.
  // Default is Gemini — see Defaults & invariants in copilot.md.
  const provider: LLMProvider =
    body.provider ??
    (model.startsWith("gemini")
      ? "gemini"
      : model.startsWith("claude")
        ? "anthropic"
        : "gemini");

  if (provider === "ollama") {
    // Should never reach the server route — browser handles it.
    return new Response(
      JSON.stringify({ error: "Ollama provider must be called client-side" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Resolve API key: client-provided → server env fallback.
  const apiKey =
    body.apiKey ||
    (provider === "gemini" ? process.env.GEMINI_API_KEY : undefined) ||
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined) ||
    "";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fullSystem = systemContext
    ? `${SYSTEM_PROMPT}\n\n--- LIVE GRAPH CONTEXT ---\n${systemContext}`
    : SYSTEM_PROMPT;

  try {
    // Convert the chat messages to the SDK's UIMessage shape so
    // convertToModelMessages can normalize them into the per-provider
    // wire format.
    const uiMessages: UIMessage[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m, idx) => ({
        id: `m-${idx}`,
        role: m.role as "user" | "assistant",
        parts: [{ type: "text", text: m.content }],
      }));

    const result = streamText({
      model: resolveModel({ provider, model, apiKey }),
      system: fullSystem,
      messages: await convertToModelMessages(uiMessages),
    });

    // Plain text/plain stream — keeps the existing client contract
    // (raw token bytes; the client appends them to a string buffer).
    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stream initialization failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
