import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import type { LLMProvider } from "@/lib/llm-providers";

const SYSTEM_PROMPT = `You are the APEX Omega-Fragility scoring engine. Given a list of nodes from a causal graph, assign risk scores based on your domain knowledge.

For each node, provide Omega-Fragility sub-scores (0-10 scale):
- substitutionFriction: How hard is it to replace this entity? (10 = irreplaceable monopoly)
- downstreamLoad: How many downstream systems depend on it? (10 = critical to many sectors)
- cascadingVoltage: How likely is a disruption to cascade nonlinearly? (10 = extreme cascade risk)
- existentialTailWeight: How concentrated is supply / how extreme is tail risk? (10 = single point of failure)
- composite: Weighted average of the above four scores

Also provide:
- globalConcentration: A brief string like "90% China" or "Single source: ASML" or "Diversified" if you know the real-world concentration
- replacementTime: A string like "5-7 years" or "Unknown" if you can estimate lead time for substitution
- reasoning: A one-sentence justification for your scores

If you don't recognize an entity, return null for that node (it will keep its topology-derived defaults).

Return ONLY valid JSON (no markdown fences):
{
  "enrichments": [
    {
      "nodeId": "<id>",
      "composite": <number>,
      "substitutionFriction": <number>,
      "downstreamLoad": <number>,
      "cascadingVoltage": <number>,
      "existentialTailWeight": <number>,
      "globalConcentration": "<string>",
      "replacementTime": "<string>",
      "reasoning": "<string>"
    }
  ]
}

Omit nodes you cannot meaningfully score. Be quantitative and grounded in real-world knowledge.`;

export async function POST(req: NextRequest) {
  try {
    const { nodes, apiKey, model, provider } = (await req.json()) as {
      nodes: { id: string; label: string; category: string; domain: string }[];
      apiKey: string;
      model?: string;
      provider?: LLMProvider;
    };

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userMessage = `Score these ${nodes.length} nodes for Omega-Fragility:\n\n${nodes
      .map((n) => `- ${n.id}: "${n.label}" (category: ${n.category}, domain: ${n.domain})`)
      .join("\n")}`;

    const resolvedProvider: LLMProvider =
      provider ?? (model?.startsWith("gemini") ? "gemini" : "anthropic");

    let responseText: string;

    if (resolvedProvider === "gemini") {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model: model || "gemini-2.0-flash",
        systemInstruction: SYSTEM_PROMPT,
      });
      const result = await genModel.generateContent({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
      });
      responseText = result.response.text();
    } else {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return new Response(
          JSON.stringify({ error: "No text response from LLM" }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }
      responseText = textBlock.text;
    }

    const cleaned = responseText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "");

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "LLM returned invalid JSON", raw: responseText.slice(0, 500) }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
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
