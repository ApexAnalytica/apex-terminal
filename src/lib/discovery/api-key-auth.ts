// ─── API Key Auth (Discovery API) ─────────────────────────────────────
//
// Per-customer credentials gating the /api/discovery/* endpoints. Keys
// are random URL-safe strings prefixed `apx_live_` so they're
// recognisable to humans and grep-able in logs. Only SHA-256 hashes
// are persisted (table: public.api_keys, schema in
// supabase-api-keys.sql); the plaintext key is shown to the customer
// once at issuance.
//
// Lookup path on every authenticated request:
//   1. Read X-Apex-Api-Key header.
//   2. Hash it.
//   3. Single point-lookup on api_keys by key_hash with revoked_at IS NULL.
//   4. On hit: return { valid: true, customerId, keyId, scopes };
//              update last_used_at fire-and-forget.
//   5. On miss / revoked / malformed header: return { valid: false, reason }.
//
// PERFORMANCE: the hash lookup is O(1) via the unique index. The
// fire-and-forget last_used_at update keeps the request hot path
// synchronous-write-free.
//
// SECURITY:
//   - No timing-attack mitigation on the hash compare itself —
//     Postgres equality on a hash is constant-ish-time and the cost
//     of an attack is dominated by network RTT, not crypto.
//   - We never log the plaintext key. Logging surfaces use keyPrefix
//     (the non-secret first 8 chars after the `apx_live_` namespace).
//   - revoked_at is the kill switch. To revoke a key: set revoked_at
//     to now(); the validator's filter `where revoked_at is null`
//     rejects it on the next request.
//   - Keys do NOT expire automatically. Add an `expires_at` column
//     and filter when that's required.

import { createHash, randomBytes } from "crypto";
import {
  setServiceClientForTesting as _setServiceClientForTesting,
  resetServiceClientForTesting as _resetServiceClientForTesting,
} from "./persistence";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Service client (separate state from persistence's) ──────────────
//
// We could share the persistence module's service client, but the
// auth module being injection-friendly on its own keeps the test
// surface predictable: a test that exercises persistence with one
// fake and auth with another doesn't have to thread state.

type AuthServiceState =
  | { kind: "uninit" }
  | { kind: "live"; client: SupabaseClient }
  | { kind: "disabled" };

let _authState: AuthServiceState = { kind: "uninit" };

function isStubEnv(url: string, key: string): boolean {
  if (!url || !key) return true;
  if (
    url.includes("placeholder") ||
    url.includes("ci-stub") ||
    url.includes("example.invalid")
  )
    return true;
  if (key.includes("placeholder") || key.includes("ci-stub")) return true;
  return false;
}

function getAuthService(): SupabaseClient | null {
  if (_authState.kind === "live") return _authState.client;
  if (_authState.kind === "disabled") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (isStubEnv(url, key)) {
    _authState = { kind: "disabled" };
    return null;
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _authState = { kind: "live", client };
  return client;
}

/** Test hook: inject a fake SupabaseClient (or null to disable). */
export function setAuthClientForTesting(
  client: SupabaseClient | null,
): void {
  _authState = client === null ? { kind: "disabled" } : { kind: "live", client };
}

/** Test hook: reset module state so the next call re-reads env. */
export function resetAuthClientForTesting(): void {
  _authState = { kind: "uninit" };
}

// Re-export the persistence test hooks so tests that touch both
// modules in one suite can reset both in beforeEach without two
// imports. Not used in production code.
export const setServiceClientForTesting = _setServiceClientForTesting;
export const resetServiceClientForTesting = _resetServiceClientForTesting;

// ─── Key shape ────────────────────────────────────────────────────────

/**
 * Canonical key prefix. Identifies the key as an Apex Discovery API
 * credential. Customers and ops can grep for `apx_live_` in logs /
 * config / leaked credential scans.
 */
export const API_KEY_PREFIX = "apx_live_";

/** Length of the random part of the key (URL-safe base64 chars). */
const API_KEY_RANDOM_BYTES = 24;

/**
 * Hash an API key for storage / lookup. SHA-256 hex, lowercase. The
 * plaintext key is never persisted; only this hash is.
 */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Generate a new API key. Returns the plaintext (handed to the
 * customer ONCE — store it on their side, we don't), the hash (what
 * goes into api_keys.key_hash), and the prefix (what goes into
 * api_keys.key_prefix for display).
 *
 * Use from a one-off admin script or a Supabase function:
 *   const { key, hash, prefix } = generateApiKey();
 *   // INSERT INTO api_keys (customer_id, key_hash, key_prefix, name)
 *   //   VALUES ('customer-x', '<hash>', '<prefix>', 'name');
 *   // Give 'key' to the customer.
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  // URL-safe base64 (no padding, no +/) — safe to paste anywhere.
  const random = randomBytes(API_KEY_RANDOM_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const key = `${API_KEY_PREFIX}${random}`;
  const hash = hashApiKey(key);
  // Prefix for display: API_KEY_PREFIX + first 8 chars of the random
  // segment. Long enough to be useful in audit trails ("the key
  // starting with apx_live_K8qR..."), short enough that revealing it
  // doesn't leak the secret.
  const prefix = `${API_KEY_PREFIX}${random.slice(0, 8)}`;
  return { key, hash, prefix };
}

// ─── Validation ───────────────────────────────────────────────────────

export type ValidationResult =
  | {
      valid: true;
      customerId: string;
      keyId: string;
      keyPrefix: string;
      scopes: string[];
    }
  | {
      valid: false;
      reason:
        | "missing-header"
        | "malformed"
        | "service-unavailable"
        | "unknown-key"
        | "revoked";
    };

/**
 * Header name the validator reads. Case-insensitive in HTTP, but
 * exported as the canonical spelling for docs.
 */
export const API_KEY_HEADER = "x-apex-api-key";

/**
 * Validate an incoming header value against the api_keys table.
 * Returns a discriminated union: valid → carries customerId + key
 * metadata; invalid → carries a reason code.
 *
 * "service-unavailable" is the graceful-degrade signal when env vars
 * are stub or the Supabase service is unreachable. The route layer
 * decides whether to return 401 or 503 in that case; we just report
 * the state.
 */
export async function validateApiKey(
  headerValue: string | null | undefined,
): Promise<ValidationResult> {
  if (!headerValue) {
    return { valid: false, reason: "missing-header" };
  }
  // Trim & basic shape check. We don't enforce length precisely —
  // future keys may be longer — but we reject obviously-wrong values
  // before paying the round-trip cost.
  const trimmed = headerValue.trim();
  if (!trimmed.startsWith(API_KEY_PREFIX) || trimmed.length < API_KEY_PREFIX.length + 8) {
    return { valid: false, reason: "malformed" };
  }

  const service = getAuthService();
  if (!service) {
    return { valid: false, reason: "service-unavailable" };
  }

  const hash = hashApiKey(trimmed);
  try {
    const { data, error } = await service
      .from("api_keys")
      .select("id, customer_id, key_prefix, scopes, revoked_at")
      .eq("key_hash", hash)
      .maybeSingle();
    if (error || !data) {
      return { valid: false, reason: "unknown-key" };
    }
    const row = data as {
      id: string;
      customer_id: string;
      key_prefix: string;
      scopes: string[] | null;
      revoked_at: string | null;
    };
    if (row.revoked_at !== null) {
      return { valid: false, reason: "revoked" };
    }
    // Fire-and-forget last_used_at update. We don't await — the
    // request shouldn't block on this and a failed update isn't
    // observable (we just lose a timestamp, the key still works).
    // Use the two-arg .then(resolve, reject) form because Supabase's
    // query-builder return value is PromiseLike, which doesn't carry
    // a .catch method in the type system.
    service
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(
        () => {
          /* no-op */
        },
        () => {
          // Intentional no-op; see comment above.
        },
      );
    return {
      valid: true,
      customerId: row.customer_id,
      keyId: row.id,
      keyPrefix: row.key_prefix,
      scopes: row.scopes ?? [],
    };
  } catch {
    // Unexpected client error → treat as service-unavailable so the
    // route layer can choose to 503 rather than 401 (the request
    // might be valid; we just can't tell right now).
    return { valid: false, reason: "service-unavailable" };
  }
}

/**
 * Convenience: pull the API key from a Headers-shaped object and
 * validate. Route handlers receive a `Headers` instance from the
 * NextRequest; this saves them three lines.
 */
export async function validateRequestApiKey(
  headers: Headers,
): Promise<ValidationResult> {
  return validateApiKey(headers.get(API_KEY_HEADER));
}

// ─── Route-layer helper ──────────────────────────────────────────────
//
// The three /api/discovery/* routes share an auth pattern: if the
// header is missing / invalid → 401; if Supabase itself is down →
// 503; otherwise attach the validated context to the handler. This
// helper bundles the response shape so all three routes report the
// same error body to clients.
//
// Lives in lib/ rather than as middleware because Discovery is the
// only API surface using it today and Next.js middleware runs on the
// Edge runtime (where node:crypto isn't available the same way).
// Route-level guarding stays simpler and node-runtime-compatible.

import { NextResponse } from "next/server";

/** Discriminated return type from {@link requireApiKey}. */
export type RequireApiKeyResult =
  | {
      ok: true;
      customerId: string;
      keyId: string;
      keyPrefix: string;
      scopes: string[];
    }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard. Call as the first line of a Discovery API
 * route:
 *
 *   const auth = await requireApiKey(req);
 *   if (!auth.ok) return auth.response;
 *   // ... auth.customerId is now usable downstream
 *
 * Returns a discriminated union: either the validated context or a
 * pre-built NextResponse that the handler should return verbatim.
 * 401 for missing / invalid / revoked; 503 for service-unavailable
 * (the validator couldn't reach Supabase — different signal from
 * "your key is wrong").
 */
export async function requireApiKey(
  request: Request | { headers: Headers },
): Promise<RequireApiKeyResult> {
  const result = await validateRequestApiKey(request.headers);
  if (result.valid) {
    return {
      ok: true,
      customerId: result.customerId,
      keyId: result.keyId,
      keyPrefix: result.keyPrefix,
      scopes: result.scopes,
    };
  }
  if (result.reason === "service-unavailable") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "auth service unavailable",
          hint:
            "the Discovery API requires a Supabase-backed api_keys table to validate credentials; retry shortly",
        },
        { status: 503 },
      ),
    };
  }
  // 401 covers missing-header / malformed / unknown-key / revoked.
  // Reason is included so debuggers can tell why their request was
  // rejected, but no key material is ever echoed back.
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "unauthorized",
        reason: result.reason,
        hint: `set the ${API_KEY_HEADER} header to a valid API key`,
      },
      {
        status: 401,
        headers: { "WWW-Authenticate": "ApiKey" },
      },
    ),
  };
}
