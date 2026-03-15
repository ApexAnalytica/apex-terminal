/**
 * Custom Vitest HTML Reporter for APEX Terminal
 *
 * Generates APEX-Terminal-Test-Suite.html with live pass/fail/error status
 * after every test run. Matches the APEX dark-theme styling and maps each
 * test to its paper/spec foundation.
 *
 * Vitest 4.x API: uses onTestRunEnd(testModules) with TestModule objects.
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

// ── Paper/spec mapping for each test file ────────────────────────────
interface SectionMeta {
  id: string;
  title: string;
  badge: string;       // badge class
  badgeLabel: string;
  paper: string;
  equations: string[];  // math block content
  filePattern: string;  // substring match on file path
}

const SECTIONS: SectionMeta[] = [
  {
    id: "omega",
    title: "Omega Engine",
    badge: "badge-red",
    badgeLabel: "Paper 2",
    paper: "\u03A9-Robustness (D.Eng. [4], v10) + Pareto Spec",
    equations: [
      "Paper 2 \u2014 Criticality Buffer:\u2003\u03A9_buffer = max(0, min(100, 100 - \u03A3severity \u00b7 100))",
      "Paper 2 \u2014 Status Thresholds:\u2003NOMINAL(\u003E65) | ELEVATED(\u003E35) | CRITICAL(\u003E15) | OMEGA_BREACH(\u226415)",
      "Pareto \u2014 LPPLS Frequency:\u2003\u03C9 = 6.36 + severity \u00b7 2.1",
      "Pareto \u2014 Dragon King P:\u2003P = clamp((F - 50)/50, 0, 1)",
      "Pareto \u2014 CSD Fragility:\u2003F = min(100, severity\u00b750 + (100 - buffer)\u00b70.5)",
    ],
    filePattern: "omega-engine.test",
  },
  {
    id: "cascade",
    title: "Cascade Simulator",
    badge: "badge-amber",
    badgeLabel: "Paper 5",
    paper: "Catastrophic Forgetting (D.Eng. V1)",
    equations: [
      "Paper 5 \u2014 Knowledge Decay:\u2003dK/dt = -\u03b1K(t) \u21d2 K_n = K_0 \u00b7 (1 - \u03b1)^n",
      "Paper 5 \u2014 Signal Propagation:\u2003dS(v_i)/dt = -\u03a3_j \u03b2_ij \u00b7 S(v_j) + \u03b3_i(t)",
      "Paper 5 \u2014 Spectral Radius:\u2003\u03bb_max = max row sum of weighted adjacency (Gershgorin)",
    ],
    filePattern: "cascade-simulator.test",
  },
  {
    id: "ablation",
    title: "Ablation Engine",
    badge: "badge-amber",
    badgeLabel: "Paper 5",
    paper: "Controlled Deletion (D.Eng. V1)",
    equations: [
      "Paper 5 \u2014 Ablation:\u2003Remove node v_i \u21d2 cascade-delete all edges (v_i, v_j) and (v_j, v_i)",
      "Density:\u2003D = |E| / (|V| \u00b7 (|V| - 1)) for directed graph",
    ],
    filePattern: "ablation-engine.test",
  },
  {
    id: "intervention",
    title: "Intervention Engine",
    badge: "badge-purple",
    badgeLabel: "Pearl Spec",
    paper: "do-Calculus / Graph Surgery",
    equations: [
      "Pearl \u2014 do(X):\u2003Sever all incoming edges to X, leaving outgoing intact",
      "Consequence Spawning:\u2003weight = 0.8, confidence = 0.7, domain-inherited",
    ],
    filePattern: "intervention-engine.test",
  },
  {
    id: "terminal",
    title: "Terminal Engine",
    badge: "badge-green",
    badgeLabel: "Spirtes + Tarski",
    paper: "Module Integration (OODA Loop)",
    equations: [
      "Tarski L0:\u2003Reject claims containing EXCEED | INFINITE | PERPETUAL | 100% EFFICIENCY",
      "Spirtes \u2192 Tarski \u2192 Pearl \u2192 Pareto routing via command dispatch",
    ],
    filePattern: "terminal-engine.test",
  },
  {
    id: "copilot",
    title: "Copilot Engine",
    badge: "badge-cyan",
    badgeLabel: "Manifold",
    paper: "OODA Loop Routing",
    equations: [
      "Action Routing:\u2003DISCOVER_STRUCTURE \u2192 spirtes | EXPLAIN_REJECTION \u2192 tarski | VERIFY_LOGIC \u2192 pearl",
      "Query Keywords:\u2003RISK \u2192 spirtes | COUNTERFACTUAL \u2192 pearl | SHOCK \u2192 pareto",
    ],
    filePattern: "copilot-engine.test",
  },
  {
    id: "import-defaults",
    title: "Import Defaults",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Data Integrity \u2014 \u03A9 Clamping & Defaults",
    equations: [
      "\u03A9 dimensions clamped to [0, 10]:\u2003composite, irreplaceability, cascadeLoad, tailDepth, restorationLatency, jurisdictionalHazard",
    ],
    filePattern: "import/defaults.test",
  },
  {
    id: "import-validation",
    title: "Import Validation",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Data Integrity \u2014 Referential Integrity",
    equations: [],
    filePattern: "import/validation.test",
  },
  {
    id: "import-merge",
    title: "Import Merge",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Data Integrity \u2014 Dedup & Density",
    equations: [
      "Post-merge density:\u2003D = |E| / (|V| \u00b7 (|V| - 1))",
    ],
    filePattern: "import/merge.test",
  },
  {
    id: "import-csv",
    title: "CSV Parser",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Format Parsers",
    equations: [],
    filePattern: "import/csv-parser.test",
  },
  {
    id: "import-json",
    title: "JSON Parser",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Format Parsers",
    equations: [],
    filePattern: "import/json-parser.test",
  },
  {
    id: "import-dot",
    title: "DOT Parser",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Format Parsers",
    equations: [],
    filePattern: "import/dot-parser.test",
  },
  {
    id: "import-graphml",
    title: "GraphML Parser",
    badge: "badge-cyan",
    badgeLabel: "Import",
    paper: "Format Parsers (jsdom env)",
    equations: [],
    filePattern: "import/graphml-parser.test",
  },
];

// ── Types ────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  fullName: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  error?: string;
}

interface SuiteResult {
  file: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
}

// ── Reporter (Vitest 4.x API) ────────────────────────────────────────

export default class ApexHtmlReporter {
  private suites: SuiteResult[] = [];
  private startTime = 0;

  onInit() {
    this.suites = [];
    this.startTime = Date.now();
  }

  onTestRunEnd(testModules: any[]) {
    if (!testModules) return;

    for (const mod of testModules) {
      const suite: SuiteResult = {
        file: mod.relativeModuleId ?? mod.id ?? "",
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 0,
      };

      const collect = (node: any) => {
        if (!node.children) return;
        for (const child of node.children) {
          if (child.type === "test") {
            const taskResult = child.task?.result;
            const state = taskResult?.state;
            const status: "pass" | "fail" | "skip" =
              state === "pass" ? "pass" : state === "fail" ? "fail" : "skip";
            const errorMsg = taskResult?.errors?.[0]?.message ?? undefined;
            suite.tests.push({
              name: child.name,
              fullName: child.name,
              status,
              duration: taskResult?.duration ?? 0,
              error: errorMsg,
            });
            if (status === "pass") suite.passed++;
            else if (status === "fail") suite.failed++;
            else suite.skipped++;
          } else if (child.type === "suite") {
            collect(child);
          }
        }
      };

      collect(mod);
      this.suites.push(suite);
    }

    const html = this.generateHtml();
    const outPath = resolve(process.cwd(), "APEX-Terminal-Test-Suite.html");
    writeFileSync(outPath, html, "utf-8");
  }

  // ── HTML Generation ──────────────────────────────────────────────

  private generateHtml(): string {
    const totalPassed = this.suites.reduce((s, f) => s + f.passed, 0);
    const totalFailed = this.suites.reduce((s, f) => s + f.failed, 0);
    const totalSkipped = this.suites.reduce((s, f) => s + f.skipped, 0);
    const totalTests = totalPassed + totalFailed + totalSkipped;
    const totalFiles = this.suites.length;
    const allGreen = totalFailed === 0;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    // Map suites to sections
    const sectionSuites = new Map<string, SuiteResult[]>();
    for (const suite of this.suites) {
      for (const sec of SECTIONS) {
        if (suite.file.includes(sec.filePattern)) {
          if (!sectionSuites.has(sec.id)) sectionSuites.set(sec.id, []);
          sectionSuites.get(sec.id)!.push(suite);
          break;
        }
      }
    }

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // Build section HTML
    let sectionsHtml = "";
    let tocHtml = "";
    let sectionIdx = 0;

    for (const sec of SECTIONS) {
      const suites = sectionSuites.get(sec.id) ?? [];
      if (suites.length === 0) continue;
      sectionIdx++;

      const secPassed = suites.reduce((s, f) => s + f.passed, 0);
      const secFailed = suites.reduce((s, f) => s + f.failed, 0);
      const secTotal = suites.reduce((s, f) => s + f.tests.length, 0);
      const secStatus = secFailed > 0 ? "FAILING" : "ALL PASS";
      const secStatusBadge = secFailed > 0 ? "badge-red" : "badge-green";

      tocHtml += `      <li><a href="#${sec.id}">${sec.title} &mdash; ${sec.paper}</a></li>\n`;

      let testsHtml = "";
      for (const suite of suites) {
        for (const t of suite.tests) {
          if (t.status === "pass") {
            testsHtml += `    <div class="test-pass">${esc(t.name)}</div>\n`;
          } else if (t.status === "fail") {
            testsHtml += `    <div class="test-fail">${esc(t.name)}</div>\n`;
            if (t.error) {
              testsHtml += `    <div class="test-error">${esc(t.error.substring(0, 500))}</div>\n`;
            }
          } else {
            testsHtml += `    <div class="test-skip">${esc(t.name)}</div>\n`;
          }
        }
      }

      let equationsHtml = "";
      for (const eq of sec.equations) {
        equationsHtml += `    <div class="math">${eq}</div>\n`;
      }

      sectionsHtml += `
  <div class="section" id="${sec.id}">
    <h1>${String(sectionIdx).padStart(2, "0")}. ${sec.title}</h1>
    <p><span class="badge ${sec.badge}">${sec.badgeLabel}</span> ${sec.paper}
    &emsp;<span class="badge ${secStatusBadge}">${secStatus}</span> ${secPassed}/${secTotal} tests</p>
${equationsHtml}
${testsHtml}
  </div>
`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>APEX Terminal \u2014 Test Suite${totalFailed > 0 ? ` \u26a0 ${totalFailed} FAILING` : ""}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg: #0a0b10;
      --surface: #12131a;
      --surface-elevated: #1a1b24;
      --border: #2a2b36;
      --text: #c8cad0;
      --text-muted: #5a5e72;
      --heading: #ffffff;
      --cyan: #00e5ff;
      --green: #00e676;
      --amber: #ffab00;
      --red: #ff1744;
      --purple: #7c4dff;
      --orange: #ff6d00;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      font-size: 14px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 60px 40px;
    }

    /* Cover */
    .cover {
      text-align: center;
      padding: 100px 0 80px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 60px;
    }
    .cover-logo {
      font-family: 'JetBrains Mono', monospace;
      font-size: 42px;
      font-weight: 700;
      letter-spacing: 0.3em;
      color: var(--heading);
      margin-bottom: 4px;
    }
    .cover-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      letter-spacing: 0.5em;
      color: var(--cyan);
      margin-bottom: 40px;
    }
    .cover-title {
      font-size: 20px;
      font-weight: 300;
      color: var(--text);
      margin-bottom: 8px;
    }
    .cover-version {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
    }
    .cover-stat {
      display: inline-block;
      margin: 30px 20px 0;
      text-align: center;
    }
    .cover-stat-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 36px;
      font-weight: 700;
    }
    .cover-stat-label {
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    /* Headings */
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: var(--heading);
      margin: 60px 0 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--cyan);
    }
    h1:first-of-type { margin-top: 0; }
    h2 {
      font-size: 18px;
      font-weight: 600;
      color: var(--heading);
      margin: 40px 0 14px;
    }
    h3 {
      font-size: 15px;
      font-weight: 600;
      color: var(--cyan);
      margin: 28px 0 10px;
    }

    p { margin-bottom: 14px; }

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      background: var(--surface-elevated);
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--cyan);
    }
    pre {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      line-height: 1.6;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 20px;
      overflow-x: auto;
      margin: 16px 0;
      color: var(--text);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 13px;
    }
    th {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      text-align: left;
      padding: 10px 14px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    tr:hover td { background: var(--surface); }

    /* Badges */
    .badge {
      display: inline-block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 3px;
      margin-right: 6px;
    }
    .badge-cyan { background: rgba(0,229,255,0.1); color: var(--cyan); border: 1px solid rgba(0,229,255,0.3); }
    .badge-green { background: rgba(0,230,118,0.1); color: var(--green); border: 1px solid rgba(0,230,118,0.3); }
    .badge-amber { background: rgba(255,171,0,0.1); color: var(--amber); border: 1px solid rgba(255,171,0,0.3); }
    .badge-red { background: rgba(255,23,68,0.1); color: var(--red); border: 1px solid rgba(255,23,68,0.3); }
    .badge-purple { background: rgba(124,77,255,0.1); color: var(--purple); border: 1px solid rgba(124,77,255,0.3); }

    .section { margin-bottom: 50px; }

    /* TOC */
    .toc {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px 30px;
      margin: 30px 0 50px;
    }
    .toc-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.2em;
      color: var(--text-muted);
      margin-bottom: 14px;
    }
    .toc ol { counter-reset: toc; list-style: none; margin-left: 0; }
    .toc li { counter-increment: toc; margin-bottom: 6px; }
    .toc li::before {
      content: counter(toc, decimal-leading-zero) ".";
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--cyan);
      margin-right: 10px;
    }
    .toc a { color: var(--text); text-decoration: none; }
    .toc a:hover { color: var(--cyan); }

    /* Test results */
    .test-pass {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      padding: 4px 0;
      color: var(--green);
    }
    .test-pass::before {
      content: "\\2713  ";
      color: var(--green);
    }
    .test-fail {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      padding: 4px 0;
      color: var(--red);
      font-weight: 600;
    }
    .test-fail::before {
      content: "\\2717  ";
      color: var(--red);
    }
    .test-error {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--red);
      background: rgba(255,23,68,0.08);
      border-left: 3px solid var(--red);
      padding: 8px 14px;
      margin: 4px 0 8px 20px;
      border-radius: 0 4px 4px 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .test-skip {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      padding: 4px 0;
      color: var(--text-muted);
    }
    .test-skip::before {
      content: "\\25CB  ";
      color: var(--text-muted);
    }

    /* Math block */
    .math {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--amber);
      background: var(--surface);
      padding: 12px 18px;
      border-radius: 4px;
      border-left: 3px solid var(--amber);
      margin: 12px 0;
      overflow-x: auto;
    }

    /* Status banner */
    .status-banner {
      text-align: center;
      padding: 16px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1em;
      margin: 30px 0;
    }
    .status-banner.green {
      background: rgba(0,230,118,0.1);
      border: 1px solid rgba(0,230,118,0.3);
      color: var(--green);
    }
    .status-banner.red {
      background: rgba(255,23,68,0.1);
      border: 1px solid rgba(255,23,68,0.3);
      color: var(--red);
    }

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 50px 0;
    }

    /* Print styles */
    @media print {
      body { background: #fff; color: #222; font-size: 11px; }
      .container { padding: 20px; }
      pre { background: #f5f5f5; border-color: #ddd; color: #333; }
      code { background: #f0f0f0; color: #0066cc; }
      table { font-size: 10px; }
      th { background: #f5f5f5; }
      h1 { border-bottom-color: #0066cc; color: #000; }
      h3 { color: #0066cc; }
      .cover-logo { color: #000; }
      .cover-sub { color: #0066cc; }
      .toc { background: #f9f9f9; }
      .badge-cyan { color: #0066cc; }
      .test-pass { color: #2e7d32; }
      .test-fail { color: #c62828; }
      .math { color: #e65100; background: #fff8e1; }
      .cover-stat-num { color: #2e7d32; }
      .status-banner.green { background: #e8f5e9; color: #2e7d32; }
      .status-banner.red { background: #ffebee; color: #c62828; }
    }
  </style>
</head>
<body>
<div class="container">

  <!-- Cover -->
  <div class="cover">
    <div class="cover-logo">APEX</div>
    <div class="cover-sub">ANALYTICA</div>
    <div class="cover-title">Test Suite &mdash; Paper-Grounded Verification</div>
    <div class="cover-version">Auto-generated &mdash; ${timestamp} &mdash; ${elapsed}s</div>
    <div>
      <div class="cover-stat">
        <div class="cover-stat-num" style="color: var(--green)">${totalPassed}</div>
        <div class="cover-stat-label">Passed</div>
      </div>
${totalFailed > 0 ? `      <div class="cover-stat">
        <div class="cover-stat-num" style="color: var(--red)">${totalFailed}</div>
        <div class="cover-stat-label">Failed</div>
      </div>` : ""}
      <div class="cover-stat">
        <div class="cover-stat-num" style="color: var(--cyan)">${totalFiles}</div>
        <div class="cover-stat-label">Test Files</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num" style="color: ${allGreen ? "var(--green)" : "var(--red)"}">${totalTests}</div>
        <div class="cover-stat-label">Total Tests</div>
      </div>
    </div>
  </div>

  <!-- Status Banner -->
  <div class="status-banner ${allGreen ? "green" : "red"}">
    ${allGreen
      ? "\u2713 ALL MATH VERIFIED \u2014 No paper equation violations detected"
      : `\u26a0 ${totalFailed} TEST${totalFailed > 1 ? "S" : ""} FAILING \u2014 Paper math violation detected! Review failures below.`}
  </div>

  <!-- TOC -->
  <div class="toc">
    <div class="toc-title">CONTENTS</div>
    <ol>
${tocHtml}    </ol>
  </div>

${sectionsHtml}

  <hr>
  <p style="text-align: center; color: var(--text-muted); font-size: 11px; font-family: 'JetBrains Mono', monospace;">
    APEX Terminal Test Suite &mdash; Auto-generated by Vitest HTML Reporter &mdash; ${timestamp}
  </p>

</div>
</body>
</html>`;
  }
}
