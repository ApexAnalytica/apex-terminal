import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Public lead-capture endpoint. Anonymous; rate-limiting and bot
// protection are out of scope here — Vercel/middleware can layer on
// later if abuse becomes real. Insert via service-role to bypass
// RLS predictably (the policy already allows anon inserts, this is
// belt-and-suspenders).

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 500;
const MAX_USE_CASE = 4000;

interface LeadBody {
  name?: unknown;
  email?: unknown;
  organization?: unknown;
  useCase?: unknown;
  source?: unknown;
}

function asBoundedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(req: NextRequest) {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = asBoundedString(body.name, MAX_FIELD);
  const email = asBoundedString(body.email, MAX_FIELD);
  const organization = asBoundedString(body.organization, MAX_FIELD);
  const useCase =
    body.useCase == null ? null : asBoundedString(body.useCase, MAX_USE_CASE);
  const source =
    asBoundedString(body.source, MAX_FIELD) ?? "request-access";

  if (!name) {
    return NextResponse.json(
      { error: "name is required (1-500 chars)" },
      { status: 400 }
    );
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "valid email is required" },
      { status: 400 }
    );
  }
  if (!organization) {
    return NextResponse.json(
      { error: "organization is required (1-500 chars)" },
      { status: 400 }
    );
  }

  const { error } = await service.from("leads").insert({
    name,
    email: email.toLowerCase(),
    organization,
    use_case: useCase,
    source,
  });

  if (error) {
    console.error("request-access insert error:", error);
    return NextResponse.json(
      { error: "Could not record request. Please email us instead." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
