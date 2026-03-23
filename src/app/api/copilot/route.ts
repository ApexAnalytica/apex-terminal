import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
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

IMPORTANT — ACTION COMMANDS:
You can control the terminal by including ACTION blocks in your response. When the user asks you to do something (select a node, inject a shock, switch modules, filter domains, etc.), include the action in your response using this exact format:

<<<ACTION:action_type:param>>>

Available actions:
- <<<ACTION:select_node:node_id>>> — Select/focus a node in the graph
- <<<ACTION:add_shock:shock_id>>> — Inject a preset shock scenario
- <<<ACTION:remove_shock:shock_id>>> — Remove an active shock
- <<<ACTION:set_module:spirtes|tarski|pearl|pareto>>> — Switch the active analysis module
- <<<ACTION:set_view:2d|3d>>> — Switch between 2D and 3D graph views
- <<<ACTION:sever_edge:edge_id>>> — Sever a causal edge (Pearl intervention)
- <<<ACTION:reset_severed>>> — Reset all severed edges
- <<<ACTION:start_replay>>> — Start cascade replay simulation
- <<<ACTION:stop_replay>>> — Stop cascade replay
- <<<ACTION:set_truth_filter:raw|verified>>> — Toggle Tarski truth filter
- <<<ACTION:set_domains:domain1,domain2>>> — Filter to specific domains

You can include multiple actions in a single response. Always explain what you're doing alongside the action. Available shock IDs: hormuz_closure, abqaiq_strike, lng_train_failure, fertilizer_export_ban, phosphate_contamination, gas_grid_overload, food_price_shock.`;

// ─── Anthropic streaming ────────────────────────────────────────

function streamAnthropic(
  apiKey: string,
  model: string,
  fullSystem: string,
  messages: { role: string; content: string }[],
  maxTokens: number
): ReadableStream<Uint8Array> {
  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.messages.stream({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          system: fullSystem,
          messages: messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`\n[ERROR: ${message}]`));
        controller.close();
      }
    },
  });
}

// ─── Gemini streaming ───────────────────────────────────────────

function streamGemini(
  apiKey: string,
  model: string,
  fullSystem: string,
  messages: { role: string; content: string }[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({
          model: model || "gemini-2.0-flash",
          systemInstruction: fullSystem,
        });

        // Build Gemini contents array (role: "user" | "model")
        const contents = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const result = await genModel.generateContentStream({ contents });

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`\n[ERROR: ${message}]`));
        controller.close();
      }
    },
  });
}

// ─── Ollama streaming (local open-source LLM) ──────────────────

function streamOllama(
  ollamaUrl: string,
  model: string,
  fullSystem: string,
  messages: { role: string; content: string }[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const ollamaMessages = [
          { role: "system", content: fullSystem },
          ...messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        ];

        const res = await fetch(`${ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: ollamaMessages,
            stream: true,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "Ollama request failed");
          throw new Error(`Ollama error (${res.status}): ${errText}`);
        }

        if (!res.body) throw new Error("No response body from Ollama");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Ollama streams newline-delimited JSON
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                controller.enqueue(encoder.encode(parsed.message.content));
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            if (parsed.message?.content) {
              controller.enqueue(encoder.encode(parsed.message.content));
            }
          } catch {
            // skip
          }
        }

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ollama stream error";
        controller.enqueue(encoder.encode(`\n[ERROR: ${message}]`));
        controller.close();
      }
    },
  });
}

// ─── Route handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { messages, systemContext, apiKey, model, provider, ollamaUrl } = await req.json() as {
      messages: { role: string; content: string }[];
      systemContext?: string;
      apiKey: string;
      model: string;
      provider?: LLMProvider;
      ollamaUrl?: string;
    };

    // Resolve API key: use client-provided key, or fall back to server env var
    const resolvedApiKey = apiKey
      || (provider === "gemini" || !provider ? process.env.GEMINI_API_KEY : undefined)
      || (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined)
      || "";

    // Ollama doesn't need an API key
    if (!resolvedApiKey && provider !== "ollama") {
      return new Response(JSON.stringify({ error: "API key required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fullSystem = systemContext
      ? `${SYSTEM_PROMPT}\n\n--- LIVE GRAPH CONTEXT ---\n${systemContext}`
      : SYSTEM_PROMPT;

    // Determine provider from explicit param or model name prefix
    const resolvedProvider: LLMProvider =
      provider ?? (model?.startsWith("gemini") ? "gemini" : model?.includes(":") ? "ollama" : "anthropic");

    let readable: ReadableStream<Uint8Array>;
    if (resolvedProvider === "ollama") {
      readable = streamOllama(ollamaUrl || "http://localhost:11434", model, fullSystem, messages);
    } else if (resolvedProvider === "gemini") {
      readable = streamGemini(resolvedApiKey, model, fullSystem, messages);
    } else {
      readable = streamAnthropic(resolvedApiKey, model, fullSystem, messages, 2048);
    }

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
