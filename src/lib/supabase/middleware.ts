import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Public routes — no auth required
  const publicRoutes = ["/login", "/trial-signup", "/expired"];
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

  // Check access type and trial expiry
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_type, trial_expires_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // No profile row — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Trusted users — always allowed
  if (profile.access_type === "trusted") {
    return supabaseResponse;
  }

  // Trial users — check expiry
  if (profile.access_type === "trial") {
    const expiresAt = new Date(profile.trial_expires_at);
    if (expiresAt <= new Date()) {
      const url = request.nextUrl.clone();
      url.pathname = "/expired";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
