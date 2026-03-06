import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import type { LLMProvider } from "@/lib/llm-providers";

const SYSTEM_PROMPT = `You are a data-structuring assistant for APEX Terminal, a causal graph analysis platform. Given CSV column headers and sample rows, determine the best mapping to APEX's canonical fields.

Available canonical fields:
- IDENTITY: id, label, shortLabel
- CLASSIFICATION: category, domain, discoverySource
- RELATIONSHIPS: source, target, weight, lag, confidence, physicalMechanism
- RISK METRICS: composite, substitutionFriction, downstreamLoad, cascadingVoltage, existentialTailWeight, globalConcentration, replacementTime, physicalConstraint
- FLAGS: isConfounded, isRestricted, isInconsistent

Rules:
1. Map each raw header to at most one canonical field, or null to skip it.
2. Determine dataMode: "edges" if the data has source/target relationship columns, "nodes" otherwise.
3. A column like "manager_id" or "parent" could be "source"; "employee_id" or "child" could be "target" — use context.
4. If a column clearly represents a name/entity, map it to "label".
5. If a column is numeric and could represent risk/score, consider weight, composite, or confidence.
6. For category fields: APEX supports manufacturing, infrastructure, economic, finance, energy, geopolitical, communications, agriculture.

Return ONLY valid JSON (no markdown fences):
{
  "dataMode": "nodes" | "edges",
  "mappings": [
    { "rawHeader": "<original header>", "canonicalField": "<field or null>" }
  ],
  "reasoning": "<brief explanation of your mapping choices>"
}`;

export async function POST(req: NextRequest) {
  try {
    const { headers, sampleRows, apiKey, model, provider } = (await req.json()) as {
      headers: string[];
      sampleRows: string[][];
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

    const userMessage = `Headers: ${JSON.stringify(headers)}\n\nSample rows (first 5):\n${sampleRows.map((r) => JSON.stringify(r)).join("\n")}`;

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
        max_tokens: 2048,
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

    // Strip markdown fences if present
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
