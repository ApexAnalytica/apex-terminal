import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha1", secret)
    .update(payload)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-vercel-signature");
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as {
    type?: string;
    payload?: {
      target?: string;
      deployment?: { url?: string; meta?: Record<string, string> };
    };
  };

  // Only act on successful production deploys
  if (
    payload.type !== "deployment.succeeded" &&
    payload.type !== "deployment-ready"
  ) {
    return NextResponse.json({ ignored: true, reason: "not a success event" });
  }
  if (payload.payload?.target !== "production") {
    return NextResponse.json({ ignored: true, reason: "not production" });
  }

  // Best-effort: any feedback row that is in_progress (= PR merged to main) is
  // necessarily part of the latest production deploy once it succeeds, since
  // Vercel auto-deploys every merge to main. Flip all in_progress → shipped.
  const { data, error } = await service
    .from("feedback")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .eq("status", "in_progress")
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    shipped_count: data?.length ?? 0,
    shipped_ids: data?.map((r) => r.id) ?? [],
  });
}
