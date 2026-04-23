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

type PullRequestEvent = {
  action?: string;
  pull_request?: {
    merged?: boolean;
    html_url?: string;
    body?: string | null;
    title?: string | null;
    number?: number;
  };
};

type DeploymentStatusEvent = {
  deployment_status?: { state?: string };
  deployment?: { environment?: string };
};

async function handlePullRequest(payload: PullRequestEvent) {
  if (payload.action !== "closed") return { ignored: true };
  const pr = payload.pull_request;
  if (!pr?.merged || !pr.html_url) return { ignored: true };

  const feedbackId =
    extractFeedbackId(pr.body) ?? extractFeedbackId(pr.title);
  if (!feedbackId) {
    return { ignored: true, reason: "No Feedback-ID trailer" };
  }

  const { error } = await service
    .from("feedback")
    .update({ status: "in_progress", pr_url: pr.html_url })
    .eq("id", feedbackId)
    .eq("status", "approved");

  if (error) throw new Error(error.message);
  return { success: true, feedbackId, pr_url: pr.html_url };
}

async function handleDeploymentStatus(payload: DeploymentStatusEvent) {
  const state = payload.deployment_status?.state;
  const env = payload.deployment?.environment?.toLowerCase() ?? "";

  if (state !== "success") {
    return { ignored: true, reason: `deployment state ${state}` };
  }
  // Vercel reports env as "Production" (or production URL). Match loosely.
  if (!env.includes("production")) {
    return { ignored: true, reason: `env ${env}` };
  }

  // Any feedback row at in_progress (= PR merged to main) is necessarily part
  // of the latest prod deploy once it succeeds — flip all to shipped.
  const { data, error } = await service
    .from("feedback")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .eq("status", "in_progress")
    .select("id");

  if (error) throw new Error(error.message);
  return {
    success: true,
    shipped_count: data?.length ?? 0,
    shipped_ids: data?.map((r) => r.id) ?? [],
  };
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const payload = JSON.parse(raw);

  try {
    if (event === "pull_request") {
      return NextResponse.json(await handlePullRequest(payload));
    }
    if (event === "deployment_status") {
      return NextResponse.json(await handleDeploymentStatus(payload));
    }
    return NextResponse.json({ ignored: true, reason: `event ${event}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
