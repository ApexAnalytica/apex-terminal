import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<
  | { ok: true; email: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(user.email.toLowerCase())) {
    return { ok: false, status: 403, error: "Not authorized" };
  }

  return { ok: true, email: user.email };
}
