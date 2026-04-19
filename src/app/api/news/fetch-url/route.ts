import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { NextRequest } from "next/server";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };

    if (!url || typeof url !== "string") {
      return jsonError("URL required", 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return jsonError("Invalid URL", 400);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return jsonError("Only http(s) URLs are supported", 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return jsonError(
        isAbort
          ? "Fetch timed out (12s). The site may be slow or blocking requests."
          : `Fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
        502
      );
    }
    clearTimeout(timeout);

    if (!res.ok) {
      return jsonError(
        `Upstream returned ${res.status}. The site may require login, a paywall, or is blocking scrapers. Try pasting the article text manually.`,
        502
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xml")) {
      return jsonError(
        `Unsupported content-type (${contentType || "unknown"}). URL must point to an HTML article.`,
        415
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return jsonError("Empty response body", 502);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return jsonError("Page too large (>2MB). Refusing to parse.", 413);
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    const html = new TextDecoder("utf-8").decode(buf);

    const dom = new JSDOM(html, { url: parsed.toString() });
    const article = new Readability(dom.window.document).parse();

    if (!article || !article.textContent) {
      return jsonError(
        "Couldn't extract article text. The page may be an index, login wall, or JS-rendered app. Paste the article manually.",
        422
      );
    }

    const text = article.textContent.trim().replace(/\n{3,}/g, "\n\n");

    if (text.length < 100) {
      return jsonError(
        `Extracted text is very short (${text.length} chars). The page may not be a full article. Paste manually if needed.`,
        422
      );
    }

    return new Response(
      JSON.stringify({
        title: article.title ?? "",
        byline: article.byline ?? "",
        siteName: article.siteName ?? parsed.hostname,
        excerpt: article.excerpt ?? "",
        text,
        url: parsed.toString(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Unknown error",
      500
    );
  }
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
