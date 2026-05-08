"use server";

import { SITE } from "@/lib/site";

export type AccessResult =
  | { ok: true }
  | { ok: false; error: string };

const TO_ADDRESS = "info@apexanalytica.co";
// Default Resend "no-domain-verification" sender. To send from a
// verified apexanalytica.co address, verify the domain in the Resend
// dashboard and update FROM_ADDRESS via env or in this file.
const FROM_ADDRESS =
  process.env.ACCESS_FROM_ADDRESS ?? "Apex Website <onboarding@resend.dev>";

const DOMAIN_OPTIONS = new Set([
  "",
  "manufacturing",
  "infrastructure",
  "economic",
  "finance",
  "energy",
  "geopolitical",
  "science",
  "other",
]);

/**
 * Recognized `source` values forwarded from the form's hidden field
 * (populated client-side from `?source=` in the URL on /founding +
 * /audit pages). Used to flag the email subject + body so Junaid
 * can immediately see which offer the request came from. Mirrors
 * SOURCE_LABELS in AccessForm.tsx — keep in sync.
 */
const SOURCE_LABELS: Record<string, string> = {
  "founding-10": "Founding 10",
  "mini-audit": "ΩF Mini-Audit",
};

function s(value: FormDataEntryValue | null, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function submitAccessRequest(
  _prev: AccessResult | null,
  formData: FormData,
): Promise<AccessResult> {
  // Honeypot — bots fill every field; this one is hidden from humans.
  const honeypot = s(formData.get("company_website"), 200);
  if (honeypot.length > 0) {
    // Pretend it succeeded; don't tell the bot.
    return { ok: true };
  }

  const name = s(formData.get("name"), 200);
  const email = s(formData.get("email"), 320);
  const org = s(formData.get("org"), 200);
  const domain = s(formData.get("domain"), 64).toLowerCase();
  const useCase = s(formData.get("useCase"), 4000);
  const sourceRaw = s(formData.get("source"), 64);
  const sourceLabel = SOURCE_LABELS[sourceRaw] ?? "";

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid work email." };
  }
  const safeDomain = DOMAIN_OPTIONS.has(domain) ? domain : "";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(
      "[access] RESEND_API_KEY not set — email NOT sent. Submission:",
      { name, email, org, domain: safeDomain, useCase, source: sourceLabel || sourceRaw },
    );
    return {
      ok: false,
      error: `Submissions are temporarily unavailable. Please email ${TO_ADDRESS} directly.`,
    };
  }

  // Subject line gets a [Founding 10] / [ΩF Mini-Audit] prefix when
  // the visitor came in via one of those offer pages, so the inbox
  // sorts cleanly without having to read the body.
  const subjectPrefix = sourceLabel ? `[${sourceLabel}] ` : "[Manifold] ";
  const subject = `${subjectPrefix}Access request — ${org || name}`;

  const lines = [
    sourceLabel
      ? `>> ROUTING: ${sourceLabel} (visitor clicked the primary CTA on /${sourceRaw === "founding-10" ? "founding" : "audit"})`
      : "",
    sourceLabel ? "" : null,
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization: ${org || "(not provided)"}`,
    `Domain interest: ${safeDomain || "(not specified)"}`,
    "",
    "Use case:",
    useCase || "(not provided)",
    "",
    "—",
    sourceLabel
      ? `Submitted via the ${sourceLabel} order CTA on apexanalytica.co. Stripe checkout for this offer is not yet wired — handle this submission manually (send Stripe invoice or similar).`
      : `Submitted via ${SITE.platformUrl} access form.`,
  ].filter((line): line is string => line !== null);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [TO_ADDRESS],
        reply_to: email,
        subject,
        text: lines.join("\n"),
      }),
      // Don't hang the form indefinitely if Resend is slow.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[access] resend non-ok:", res.status, body);
      return {
        ok: false,
        error: `We couldn't send your request. Please email ${TO_ADDRESS} directly.`,
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("[access] unexpected error:", err);
    return {
      ok: false,
      error: `Something went wrong. Please email ${TO_ADDRESS} directly.`,
    };
  }
}
