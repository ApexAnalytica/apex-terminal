import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import type { LLMProvider } from "@/lib/llm-providers";

const SYSTEM_PROMPT = `You are APEX's causal news interpreter. Given a news article and a causal graph (nodes + edges), extract the interventions the article implies and map them onto the graph.

The graph is a DAG of real-world systems (energy, manufacturing, finance, geopolitics, etc.). Each node is an entity or capability. Each edge is a causal dependency (source → target). An intervention is a perturbation the article describes or implies.

Three intervention techniques are available:
- "shock": inject an exogenous disruption on a node (use when article describes an ongoing/imminent disruption — strike, sanction, outage, disaster, cyberattack, bank run, pandemic, recall, etc.). Requires severity 0-1 and category from {compute, energy, cooling, supply, geopolitical, financial, cyber, regulatory, environmental, health}. Pick the category that best fits the article's causal mechanism — e.g. banking/credit crises → financial, ransomware/data breach → cyber, antitrust ruling or SEC action → regulatory, hurricane/earthquake/climate event → environmental, pandemic/public-health emergency → health.
- "sever": break a causal edge (use when article describes a dependency being cut — pipeline closure, export ban, route blocked).
- "ablate": remove a node entirely (use when article describes a total capacity loss — factory destruction, company shutdown).

Map each implied intervention to the MOST SPECIFIC matching node or edge ID in the graph. Do not invent IDs. If no node/edge reasonably matches, skip that intervention rather than forcing it.

Return ONLY valid JSON (no markdown fences):
{
  "summary": "<one-sentence summary of the article>",
  "interventions": [
    {
      "technique": "shock" | "sever" | "ablate",
      "targetNodeId": "<id or null>",
      "targetEdgeId": "<id or null>",
      "severity": <0-1 or null>,
      "category": "<shock category or null>",
      "rationale": "<why this intervention maps here>",
      "sourceQuote": "<the sentence or phrase from the article that supports this>"
    }
  ]
}

Rules:
- shock → targetNodeId set, targetEdgeId null, severity + category set
- sever → targetEdgeId set, targetNodeId null, severity null
- ablate → targetNodeId set, targetEdgeId null, severity null
- Severity maps as: minor=0.2, notable=0.4, serious=0.6, severe=0.8, catastrophic=1.0
- Return an empty interventions array if the article has no clear graph-mappable causal implications.`;

export async function POST(req: NextRequest) {
  try {
    const { articleText, nodes, edges, apiKey, model, provider } = (await req.json()) as {
      articleText: string;
      nodes: { id: string; label: string; category: string; domain: string }[];
      edges: { id: string; source: string; target: string; physicalMechanism?: string }[];
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

    if (!articleText || articleText.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Article text too short" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const nodeCatalog = nodes
      .map((n) => `- ${n.id}: "${n.label}" (${n.category} / ${n.domain})`)
      .join("\n");

    const edgeCatalog = edges
      .map((e) => {
        const mech = e.physicalMechanism ? ` [${e.physicalMechanism}]` : "";
        return `- ${e.id}: ${e.source} → ${e.target}${mech}`;
      })
      .join("\n");

    const userMessage = `GRAPH NODES (${nodes.length}):
${nodeCatalog}

GRAPH EDGES (${edges.length}):
${edgeCatalog}

ARTICLE:
${articleText}

Extract the graph-mappable interventions.`;

    const resolvedProvider: LLMProvider =
      provider ?? (model?.startsWith("gemini") ? "gemini" : "anthropic");

    let responseText: string;

    if (resolvedProvider === "gemini") {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model: model || "gemini-2.5-flash",
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
