import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isExpired, type Tier } from "@/lib/billing";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes — no auth required at the middleware layer. This
  // list controls *session-cookie* auth gating; routes here can still
  // implement their own auth (e.g. API-key header, webhook signature)
  // inside the handler. Adding `/api/discovery` so the per-route
  // API-key validator from PR #337 actually gets to run — the
  // session middleware was 307-redirecting valid API-key requests to
  // /login before the validator could see them.
  //
  // `/api/feeds` is here because every handler under it just proxies
  // a public data source (FRED, EIA, World Bank, ClinicalTrials.gov,
  // OFAC, OpenFDA, plus the derivation stub) — no user context, no
  // per-tier quota, no PII. Routing them through the session check
  // added a `supabase.auth.getUser()` round-trip on every poll, which
  // cold-starts to ~18s on the derivations endpoint and starves
  // Chrome's per-origin connection pool — surfacing as
  // ERR_CONNECTION_TIMED_OUT spam in the browser console during the
  // Hormuz demo. Making feeds public eliminates that hop while leaving
  // session auth on every other API path untouched.
  const publicRoutes = ["/login", "/trial-signup", "/trusted-signup", "/api/trusted-signup", "/api/webhooks", "/expired", "/forgot-password", "/reset-password", "/auth", "/pricing", "/request-access", "/api/request-access", "/api/discovery", "/api/feeds"];
  const isPublic =
    publicRoutes.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico");

  if (isPublic) {
    return supabaseResponse;
  }

  // No user — redirect to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Load tier + period bounds from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, current_period_end")
    .eq("id", user.id)
    .single<{ tier: Tier; current_period_end: string | null }>();

  if (!profile) {
    // No profile row — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Admin-only routes — gated by ADMIN_EMAILS allowlist
  if (pathname.startsWith("/admin")) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = user.email?.toLowerCase() ?? "";
    if (!adminEmails.includes(email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  if (isExpired(profile)) {
    const url = request.nextUrl.clone();
    url.pathname = "/expired";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
