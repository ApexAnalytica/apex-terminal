import { describe, it, expect } from "vitest";
import { executeTag } from "@/lib/copilot/tool-registry";
import "@/lib/copilot/tools";
import type { ApexState } from "@/stores/useApexStore";

// ─── Spy store for the axiom-config tools ───────────────────────

interface AxiomSpy {
  enabled: Set<string> | null;
  level: "all" | 0 | 1 | 2 | null;
  validations: number;
}

function makeCtx() {
  const spy: AxiomSpy = { enabled: null, level: null, validations: 0 };
  const fakeStore = {
    tarskiReport: {
      inconsistentEdgeIds: new Set<string>(["e1"]),
      restrictedNodeIds: new Set<string>(),
      proofTraces: [],
    },
    setEnabledAxioms: (s: Set<string>) => {
      spy.enabled = s;
    },
    setAxiomLevelFilter: (f: "all" | 0 | 1 | 2) => {
      spy.level = f;
    },
    runTarskiWithAxioms: () => {
      spy.validations++;
    },
  } as unknown as ApexState;
  return { ctx: { getStore: () => fakeStore }, spy };
}

describe("enable_axioms", () => {
  it("resolves axiom ids, sets the active set, and re-runs validation", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "enable_axioms", payload: "axioms=A-01|R-01", raw: "" },
      ctx,
    );
    expect(spy.enabled).not.toBeNull();
    expect([...(spy.enabled ?? [])].sort()).toEqual(["A-01", "R-01"]);
    expect(spy.validations).toBe(1);
    expect(result).toMatch(/Enabled 2 axiom/);
    expect(result).toContain("A-01");
  });

  it("resolves by name fragment (case-insensitive)", async () => {
    const { ctx, spy } = makeCtx();
    await executeTag(
      { name: "enable_axioms", payload: "axioms=temporal priority", raw: "" },
      ctx,
    );
    expect([...(spy.enabled ?? [])]).toContain("A-01");
  });

  it("reports unmatched tokens but still enables the valid ones", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "enable_axioms", payload: "axioms=A-01|NOPE", raw: "" },
      ctx,
    );
    expect([...(spy.enabled ?? [])]).toEqual(["A-01"]);
    expect(result).toMatch(/no match: NOPE/);
  });

  it("returns an error and skips mutation when nothing matches", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "enable_axioms", payload: "axioms=ZZZ|QQQ", raw: "" },
      ctx,
    );
    expect(spy.enabled).toBeNull();
    expect(spy.validations).toBe(0);
    expect(result).toMatch(/No axioms matched/);
  });
});

describe("set_axiom_level", () => {
  it("maps numeric levels and re-runs validation", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_axiom_level", payload: "level=0", raw: "" },
      ctx,
    );
    expect(spy.level).toBe(0);
    expect(spy.validations).toBe(1);
    expect(result).toContain("0");
  });

  it("maps the 'all' level", async () => {
    const { ctx, spy } = makeCtx();
    await executeTag({ name: "set_axiom_level", payload: "all", raw: "" }, ctx);
    expect(spy.level).toBe("all");
  });

  it("rejects an out-of-enum level at coercion", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_axiom_level", payload: "level=9", raw: "" },
      ctx,
    );
    expect(spy.level).toBeNull();
    expect(result).toMatch(/not in \[/);
  });
});
