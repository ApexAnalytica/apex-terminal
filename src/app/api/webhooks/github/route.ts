import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

function extractFeedbackId(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/Feedback-ID:\s*(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const payload = JSON.parse(raw) as {
    action?: string;
    pull_request?: {
      merged?: boolean;
      html_url?: string;
      body?: string | null;
      title?: string | null;
      number?: number;
    };
  };

  if (event !== "pull_request" || payload.action !== "closed") {
    return NextResponse.json({ ignored: true });
  }
  const pr = payload.pull_request;
  if (!pr?.merged || !pr.html_url) {
    return NextResponse.json({ ignored: true });
  }

  const feedbackId =
    extractFeedbackId(pr.body) ?? extractFeedbackId(pr.title);
  if (!feedbackId) {
    return NextResponse.json({ ignored: true, reason: "No Feedback-ID trailer" });
  }

  const { error } = await service
    .from("feedback")
    .update({ status: "in_progress", pr_url: pr.html_url })
    .eq("id", feedbackId)
    .eq("status", "approved");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, feedbackId, pr_url: pr.html_url });
}
