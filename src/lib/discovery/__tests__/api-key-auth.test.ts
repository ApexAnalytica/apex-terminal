// @vitest-environment node
//
// API key auth unit tests. The Supabase client is mocked so these
// tests don't depend on a real DB / network. Verifies:
//   - hashApiKey is deterministic + SHA-256-shaped
//   - generateApiKey produces self-consistent key/hash/prefix
//   - validateApiKey rejects missing / malformed / unknown / revoked
//   - validateApiKey accepts a valid live key and returns customer id
//   - last_used_at update fires (best-effort) on success
//   - service-unavailable when client is stub

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  hashApiKey,
  generateApiKey,
  validateApiKey,
  validateRequestApiKey,
  setAuthClientForTesting,
  API_KEY_HEADER,
  API_KEY_PREFIX,
} from "../api-key-auth";

// ─── Fake client ──────────────────────────────────────────────────────

function makeFakeAuthClient(opts: {
  // What the select(...).eq(...).maybeSingle() returns
  selectResult?: {
    data:
      | {
          id: string;
          customer_id: string;
          key_prefix: string;
          scopes: string[] | null;
          revoked_at: string | null;
        }
      | null;
    error: { message: string } | null;
  };
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue(
    opts.selectResult ?? { data: null, error: null },
  );
  // The update path returns a thenable so the fire-and-forget chain
  // doesn't explode. Production uses `.then(resolve, reject)` (two-arg
  // form, since Supabase's builder is PromiseLike without .catch);
  // the helper supports either form.
  const updateThenable = {
    then: (
      resolve: () => void,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _reject?: (e: unknown) => void,
    ) => {
      resolve();
      return { catch: () => {} };
    },
  };
  const updateEqSpy = vi.fn().mockReturnValue(updateThenable);
  const updateSpy = vi.fn().mockReturnValue({ eq: updateEqSpy });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryBuilder: any = {
    select() {
      return queryBuilder;
    },
    eq() {
      return queryBuilder;
    },
    maybeSingle,
    update: updateSpy,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fake: any = {
    from: vi.fn().mockReturnValue(queryBuilder),
  };
  return { fake, maybeSingle, updateSpy, updateEqSpy };
}

// ─── Tests: hash / generate ──────────────────────────────────────────

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("apx_live_abc")).toBe(hashApiKey("apx_live_abc"));
  });

  it("returns 64-char hex (SHA-256)", () => {
    const h = hashApiKey("apx_live_anything");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different inputs produce different hashes", () => {
    expect(hashApiKey("apx_live_a")).not.toBe(hashApiKey("apx_live_b"));
  });
});

describe("generateApiKey", () => {
  it("produces a prefixed URL-safe key", () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^apx_live_[A-Za-z0-9_-]+$/);
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it("hash matches hashApiKey(key)", () => {
    const { key, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(key));
  });

  it("prefix is API_KEY_PREFIX + first 8 random chars", () => {
    const { key, prefix } = generateApiKey();
    const randomPart = key.slice(API_KEY_PREFIX.length);
    expect(prefix).toBe(`${API_KEY_PREFIX}${randomPart.slice(0, 8)}`);
  });

  it("two consecutive keys differ", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });
});

// ─── Tests: validateApiKey ───────────────────────────────────────────

describe("validateApiKey — pre-flight rejections (no DB hit)", () => {
  beforeEach(() => {
    setAuthClientForTesting(null);
  });
  afterEach(() => {
    setAuthClientForTesting(null);
  });

  it("missing-header on null", async () => {
    const r = await validateApiKey(null);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("missing-header");
  });

  it("missing-header on empty string", async () => {
    const r = await validateApiKey("");
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("missing-header");
  });

  it("malformed when prefix is wrong", async () => {
    const r = await validateApiKey("not_an_apx_key_at_all");
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("malformed");
  });

  it("malformed when only the prefix is present (too short)", async () => {
    const r = await validateApiKey("apx_live_");
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("malformed");
  });

  it("service-unavailable when client is stub", async () => {
    // generateApiKey() returns a well-formed key; we just don't have
    // a service client wired, so the validator can't look it up.
    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("service-unavailable");
  });
});

describe("validateApiKey — with mocked client", () => {
  beforeEach(() => {
    setAuthClientForTesting(null);
  });
  afterEach(() => {
    setAuthClientForTesting(null);
  });

  it("returns valid + customerId on hit (key not revoked)", async () => {
    const { fake, maybeSingle, updateSpy } = makeFakeAuthClient({
      selectResult: {
        data: {
          id: "key-uuid-1",
          customer_id: "customer-x",
          key_prefix: "apx_live_K8qR1234",
          scopes: ["discovery:read", "discovery:write"],
          revoked_at: null,
        },
        error: null,
      },
    });
    setAuthClientForTesting(fake);

    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error("type narrow");
    expect(r.customerId).toBe("customer-x");
    expect(r.keyId).toBe("key-uuid-1");
    expect(r.keyPrefix).toBe("apx_live_K8qR1234");
    expect(r.scopes).toEqual(["discovery:read", "discovery:write"]);

    // The lookup happened
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    // Fire-and-forget last_used_at update fired
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg.last_used_at).toBeDefined();
  });

  it("unknown-key on miss", async () => {
    const { fake } = makeFakeAuthClient({
      selectResult: { data: null, error: null },
    });
    setAuthClientForTesting(fake);

    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("unknown-key");
  });

  it("revoked when revoked_at is non-null", async () => {
    const { fake, updateSpy } = makeFakeAuthClient({
      selectResult: {
        data: {
          id: "key-uuid-2",
          customer_id: "customer-y",
          key_prefix: "apx_live_RvK12345",
          scopes: null,
          revoked_at: "2026-05-12T00:00:00Z",
        },
        error: null,
      },
    });
    setAuthClientForTesting(fake);

    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("revoked");
    // last_used_at not updated for revoked keys
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("scopes default to [] when row has null scopes", async () => {
    const { fake } = makeFakeAuthClient({
      selectResult: {
        data: {
          id: "key-uuid-3",
          customer_id: "customer-z",
          key_prefix: "apx_live_NoScope1",
          scopes: null,
          revoked_at: null,
        },
        error: null,
      },
    });
    setAuthClientForTesting(fake);

    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    if (!r.valid) throw new Error("expected valid");
    expect(r.scopes).toEqual([]);
  });

  it("service-unavailable when query throws unexpectedly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exploding: any = {
      from: () => {
        throw new Error("connection dropped");
      },
    };
    setAuthClientForTesting(exploding);

    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("service-unavailable");
  });

  it("unknown-key when Supabase returns an error", async () => {
    const { fake } = makeFakeAuthClient({
      selectResult: {
        data: null,
        error: { message: "permission denied" },
      },
    });
    setAuthClientForTesting(fake);

    const { key } = generateApiKey();
    const r = await validateApiKey(key);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("unknown-key");
  });
});

describe("validateRequestApiKey — reads from Headers", () => {
  beforeEach(() => {
    setAuthClientForTesting(null);
  });
  afterEach(() => {
    setAuthClientForTesting(null);
  });

  it("missing-header when the header isn't set", async () => {
    const h = new Headers();
    const r = await validateRequestApiKey(h);
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe("missing-header");
  });

  it("reads the header case-insensitively (HTTP spec)", async () => {
    const { fake } = makeFakeAuthClient({
      selectResult: {
        data: {
          id: "k1",
          customer_id: "c1",
          key_prefix: "apx_live_Abcd1234",
          scopes: [],
          revoked_at: null,
        },
        error: null,
      },
    });
    setAuthClientForTesting(fake);

    const { key } = generateApiKey();
    // Headers normalises to lowercase internally; we test both cases
    // to make sure the canonical lookup works.
    const h1 = new Headers({ "X-Apex-Api-Key": key });
    const r1 = await validateRequestApiKey(h1);
    expect(r1.valid).toBe(true);

    const h2 = new Headers({ "x-apex-api-key": key });
    const r2 = await validateRequestApiKey(h2);
    expect(r2.valid).toBe(true);
  });

  it("exports the canonical header name", () => {
    expect(API_KEY_HEADER).toBe("x-apex-api-key");
  });
});
