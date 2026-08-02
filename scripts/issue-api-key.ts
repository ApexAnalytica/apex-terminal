#!/usr/bin/env -S npx tsx
/**
 * Issue a Discovery API key — terminal alternative to the SQL snippet
 * in docs/DISCOVERY_DEPLOY.md §8.2.
 *
 *   npx tsx scripts/issue-api-key.ts <customer-id> "<key name>"
 *     [--scopes discovery:read,discovery:write]
 *
 *   npx tsx scripts/issue-api-key.ts apex-internal "Junaid admin"
 *   npx tsx scripts/issue-api-key.ts acme-corp "Acme prod pipeline" \
 *     --scopes discovery:read
 *
 * Output (to stdout):
 *
 *   ╔══════════════════════════════════════════════════════════════════╗
 *   ║  SAVE THIS KEY NOW — it cannot be recovered.                     ║
 *   ╚══════════════════════════════════════════════════════════════════╝
 *
 *   apx_live_K8qR3xZhrGfTzPnVm9bN1Lp...
 *
 *   id:          <uuid>
 *   customer_id: acme-corp
 *   key_prefix:  apx_live_K8qR3xZh
 *   scopes:      discovery:read
 *   created_at:  2026-05-15T03:00:00Z
 *
 * Pipe-friendly: the plaintext key is on its own line surrounded by
 * blank lines, so you can grab it with grep or pbcopy:
 *
 *   npx tsx scripts/issue-api-key.ts foo "bar" | grep apx_live | pbcopy
 *
 * Required env vars (any of these patterns):
 *   - Set inline:                 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx ...
 *   - .env.local in repo root:    pulled automatically below
 *   - From Vercel:                `npx vercel env pull` once, then run unprefixed
 *
 * Uses the service-role key to bypass RLS (same pattern as the Discovery
 * API's persistence layer in production). The plaintext key is generated
 * locally with `crypto.randomBytes` and never sent over the wire — only
 * its SHA-256 hash + a non-secret prefix land in the database.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

// Load .env.local from repo root if present. We try both because some
// workflows use .env.local (Next.js convention) and others use .env.
for (const candidate of [".env.local", ".env"]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

function bail(msg: string): never {
  console.error(`error: ${msg}`);
  console.error("");
  console.error("usage:");
  console.error("  npx tsx scripts/issue-api-key.ts <customer-id> <name>");
  console.error("    [--scopes discovery:read,discovery:write]");
  process.exit(1);
}

// ─── Args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional: string[] = [];
let scopesArg = "discovery:read,discovery:write";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--scopes") {
    scopesArg = argv[++i] ?? bail("--scopes requires a value");
  } else if (a.startsWith("--scopes=")) {
    scopesArg = a.slice("--scopes=".length);
  } else {
    positional.push(a);
  }
}
if (positional.length < 2) {
  bail("expected <customer-id> and <name>");
}
const [customerId, name] = positional;
const scopes = scopesArg.split(",").map((s) => s.trim()).filter(Boolean);

// ─── Env ─────────────────────────────────────────────────────────────
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  bail(
    "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) not set. " +
      "Either export it in your shell, drop it in .env.local, or run " +
      "`npx vercel env pull` to mirror prod.",
  );
}
if (!serviceRoleKey) {
  bail(
    "SUPABASE_SERVICE_ROLE_KEY not set. Pull it from Vercel " +
      "(`npx vercel env pull`) or copy it from Supabase Dashboard → " +
      "Project Settings → API → service_role.",
  );
}

// ─── Key generation ──────────────────────────────────────────────────
// 24 random bytes → 32 base64 chars (without trailing padding). Plenty
// of entropy. The apx_live_ prefix lets us spot keys by their first
// byte if someone accidentally commits one — matches the GitHub
// secret-scanner pattern.
function generateApiKey(): string {
  const random = randomBytes(24)
    .toString("base64")
    // strip url-unsafe chars + padding so the key is a clean token
    .replace(/[+/=]/g, (c) => ({ "+": "A", "/": "B", "=": "" }[c]!));
  return `apx_live_${random}`;
}

const plaintext = generateApiKey();
const keyHash = createHash("sha256").update(plaintext).digest("hex");
const keyPrefix = plaintext.slice(0, 16);

// ─── Insert + output ─────────────────────────────────────────────────
// Wrapped in an async main() because tsx transforms to CJS (no
// top-level await) when running outside a workspace with ESM
// configured. main().catch() ensures any rejection prints + exits
// non-zero instead of becoming an UnhandledPromiseRejection warning.
async function main() {
  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      customer_id: customerId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      scopes,
    })
    .select("id, customer_id, key_prefix, scopes, created_at")
    .single();

  if (error) {
    console.error("insert failed:", error.message);
    if (
      error.message.includes("relation") &&
      error.message.includes("api_keys")
    ) {
      console.error("");
      console.error(
        "the api_keys table doesn't exist yet — run supabase-api-keys.sql " +
          "in the Supabase SQL Editor first (docs/DISCOVERY_DEPLOY.md §8.1).",
      );
    }
    process.exit(1);
  }

  console.log("");
  console.log(
    "╔══════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║  SAVE THIS KEY NOW — it cannot be recovered.                     ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════╝",
  );
  console.log("");
  console.log(plaintext);
  console.log("");
  console.log(`id:          ${data.id}`);
  console.log(`customer_id: ${data.customer_id}`);
  console.log(`key_prefix:  ${data.key_prefix}`);
  console.log(`scopes:      ${(data.scopes as string[]).join(", ")}`);
  console.log(`created_at:  ${data.created_at}`);
  console.log("");
  console.log(
    "use with:  curl -H \"X-Apex-Api-Key: " + plaintext + "\" ...",
  );
  console.log("");
}

main().catch((err: unknown) => {
  console.error("unexpected failure:", err instanceof Error ? err.message : err);
  process.exit(1);
});
