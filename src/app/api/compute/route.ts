import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const COMPUTE_SYSTEM_PROMPT = `You are the APEX Compute Engine — a deterministic causal-inference backend.
Given a causal graph context, produce a SystemStateSnapshot JSON object.

Return ONLY valid JSON matching this schema (no markdown fences, no commentary):
{
  "version": 1,
  "timestamp": "<ISO-8601>",
  "graph": {
    "nodes": [{ "id": string, "omega": number, "fragility": number, "isActivated": boolean }],
    "edges": [{ "id": string, "weight": number, "probability": number, "isSevered": boolean }]
  },
  "engineOutputs": {
    "spirtes": { "density": number, "lambdaMax": number, "isStable": boolean } | null,
    "pareto": { "omegaBuffer": number, "status": string, "criticalityEstimate": number } | null,
    "pearl": { "interventionCount": number, "severedEdges": string[] } | null
  },
  "tarskiValidation": {
    "status": "PENDING",
    "violations": [],
    "checkedAt": "<ISO-8601>"
  },
  "metadata": { "epochCount": number, "shockCount": number, "activeModule": string }
}

Analyze the graph for Ω-fragility cascading, recompute node omega scores based on active shocks and severed edges, and return the updated snapshot. Be quantitative and precise.`;

export async function POST(req: NextRequest) {
  try {
    const { graphContext, apiKey, model } = (await req.json()) as {
      graphContext: string;
      apiKey: string;
      model?: string;
    };

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Claude API key required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: COMPUTE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this graph and produce a SystemStateSnapshot:\n\n${graphContext}`,
        },
      ],
    });

    // Extract text content
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return new Response(
        JSON.stringify({ error: "No text response from Claude" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let snapshot;
    try {
      snapshot = JSON.parse(textBlock.text);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Claude returned invalid JSON",
          raw: textBlock.text.slice(0, 500),
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(snapshot), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
