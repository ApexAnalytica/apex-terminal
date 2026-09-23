#!/usr/bin/env -S npx tsx
// ─── Copilot Eval CLI ──────────────────────────────────────────
//
// Usage:
//   npx tsx scripts/eval-copilot.ts                    # default: gemini-2.5-flash
//   npx tsx scripts/eval-copilot.ts --model gemini-2.5-pro-preview-06-05
//   npx tsx scripts/eval-copilot.ts --provider anthropic --model claude-sonnet-4-20250514
//   npx tsx scripts/eval-copilot.ts --json results.json   # also write a JSON report
//
// Reads API keys from process.env:
//   - GEMINI_API_KEY   (gemini provider)
//   - ANTHROPIC_API_KEY (anthropic provider)
//
// Exit code:
//   0  — all cases passed
//   1  — at least one failure or runtime error

import { writeFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import type { LLMProvider } from "../src/lib/llm-providers";
import { runEval, formatResultLine, formatReport } from "../src/lib/copilot/eval/runner";
import { SEED_CASES } from "../src/lib/copilot/eval/cases/seed";

loadDotenv({ path: ".env.local" });
loadDotenv(); // also load .env if present

interface CliArgs {
  provider: LLMProvider;
  model: string;
  jsonOut?: string;
  filterTag?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { provider: "gemini", model: "gemini-2.5-flash" };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--provider" && next) {
      if (next === "gemini" || next === "anthropic" || next === "ollama") {
        args.provider = next;
      } else {
        throw new Error(`Unknown provider: ${next}`);
      }
      i++;
    } else if (flag === "--model" && next) {
      args.model = next;
      i++;
    } else if (flag === "--json" && next) {
      args.jsonOut = next;
      i++;
    } else if (flag === "--tag" && next) {
      args.filterTag = next;
      i++;
    } else if (flag === "--help" || flag === "-h") {
      console.log(
        `usage: npx tsx scripts/eval-copilot.ts ` +
          `[--provider gemini|anthropic] [--model <id>] [--json <path>] [--tag <tag>]`,
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  const apiKey =
    args.provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : args.provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : undefined;
  if (!apiKey) {
    console.error(
      `Missing API key for provider "${args.provider}". Set ` +
        (args.provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY") +
        " in .env.local",
    );
    process.exit(1);
  }

  const cases = args.filterTag
    ? SEED_CASES.filter((c) => c.tags?.includes(args.filterTag!))
    : SEED_CASES;

  if (cases.length === 0) {
    console.error(`No cases match tag "${args.filterTag}".`);
    process.exit(1);
  }

  console.log(
    `Running ${cases.length} case(s) against ${args.provider}/${args.model}…\n`,
  );

  const report = await runEval({
    cases,
    provider: args.provider,
    model: args.model,
    apiKey,
    onCaseComplete: (r) => console.log(formatResultLine(r)),
  });

  console.log(formatReport(report));

  if (args.jsonOut) {
    writeFileSync(args.jsonOut, JSON.stringify(report, null, 2));
    console.log(`Wrote JSON report to ${args.jsonOut}`);
  }

  process.exit(report.failed === 0 && report.errored === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("eval-copilot crashed:", err);
  process.exit(1);
});
