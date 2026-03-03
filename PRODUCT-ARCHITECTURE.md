# APEX Terminal — Product Architecture Document

## Executive Summary

APEX Terminal is a causal intelligence platform for critical infrastructure risk analysis. It combines 3D interactive DAG visualization with multi-module causal reasoning engines, real-time shock propagation, and a dataset import pipeline.

**Stack**: Next.js 16 + Turbopack, React 19, React Three Fiber, Zustand, Tailwind, Framer Motion, D3-Force-3D
**Deployments**: APEX Analytica (`/`) + Athena Defense Systems (`/client`)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Client-Side)                         │
│                                                                         │
│  ┌─────────────┐   ┌──────────────────────┐   ┌──────────────────────┐ │
│  │  HeaderBar   │   │    CDΩ Monitor        │   │   + IMPORT Button   │ │
│  │  Module Tabs │   │  Buffer / Alert Level │   │                      │ │
│  └──────┬───────┘   └──────────┬───────────┘   └──────────┬───────────┘ │
│         │                      │                           │             │
│  ┌──────▼───────────────────────▼───────────────────────────▼──────────┐ │
│  │                        ZUSTAND STORE                                │ │
│  │  graphData │ shocks │ selectedNode │ activeModule │ importModalOpen │ │
│  │  interventionMode │ scissorsMode │ severedEdges │ copilotMessages   │ │
│  └──────┬──────────────────┬─────────────────────┬────────────────────┘ │
│         │                  │                     │                       │
│  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────────▼──────────┐          │
│  │ System      │   │  3D Canvas  │   │   Module Panel       │          │
│  │ Copilot     │   │  + Overlay  │   │   (SPIRTES/TARSKI/   │          │
│  │ (Left)      │   │  + Risk     │   │    PEARL/PARETO)     │          │
│  │             │   │    Cards    │   │   + Node Inspector   │          │
│  └─────────────┘   │  + Metrics  │   └──────────────────────┘          │
│                     └─────────────┘                                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      IMPORT PIPELINE (Modal)                        │ │
│  │   File Drop → Parser → Validator → Preview → Merge → Graph Update  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ APEX ◇SPIRTES ⊢TARSKI ⟐PEARL ⚠PARETO   [CDΩ Monitor]   +IMPORT   │
├───────────┬───────────────────────────────────────────┬──────────────┤
│           │                                           │              │
│  System   │            3D Causal DAG                  │   Module     │
│  Copilot  │         (React Three Fiber)               │   Panel      │
│           │                                           │              │
│  Messages │   ┌─────────────────────────────────┐     │  Node        │
│  Actions  │   │  Nodes (spheres, Ω-sized)       │     │  Inspector   │
│  Input    │   │  Edges (tubes, weighted)        │     │              │
│           │   │  Camera Rig (zoom-to-node)      │     │  Engine UI   │
│           │   │  DAG Overlay (labels, legend)   │     │  (per module)│
│           │   └─────────────────────────────────┘     │              │
│           ├───────────────────────────────────────────┤              │
│           │  Risk Propagation Cards (scrollable)      │              │
│           ├───────────────────────────────────────────┤              │
│           │  Structural Metrics Footer                │              │
└───────────┴───────────────────────────────────────────┴──────────────┘
```

---

## Component Tree

```
page.tsx (Main)
├── ImportModal (overlay)
│   ├── DropZone
│   ├── ValidationSummary + PreviewTable
│   └── Merge confirmation
├── HeaderBar
│   ├── Logo + Module Tabs (SPIRTES | TARSKI | PEARL | PARETO)
│   ├── CDOmegaMonitor (buffer bar, alert level, T-days)
│   ├── ImportButton
│   └── Session status
├── SystemCopilot (left sidebar)
│   ├── Message list (animated)
│   ├── Action buttons (DISCOVER | EXPLAIN | VERIFY)
│   └── Query input
├── Center Column
│   ├── CausalDAG3D (or CausalDAG2D fallback)
│   │   ├── Canvas + WebGL + OrbitControls
│   │   ├── CameraRig (animated zoom-to-node)
│   │   ├── DAGNode3D × N (spheres with glow, labels, hover cards)
│   │   ├── DAGEdge3D × N (tubes with arrowheads)
│   │   └── DAGOverlay (title, legend, leaderboard, controls)
│   ├── RiskPropagationFlow (horizontal scrolling cards)
│   └── StructuralMetrics (footer stats)
└── ModulePanel (right sidebar)
    ├── NodeInspector (Ω profile, metadata, connected edges)
    └── Module-specific content:
        ├── SPIRTES: CascadeHeader + TrinityPanel (DCD/PCMCI+/FCI)
        ├── TARSKI: TruthFilter + AxiomLibrary + ProofTraces
        ├── PEARL: InterventionControls + Scissors Tool
        └── PARETO: DoomsdayClock + ShockPanel + Fragility Index
```

---

## Store Architecture (Zustand)

**File**: `src/stores/useApexStore.ts`

| Slice | Type | Consumers |
|-------|------|-----------|
| `activeModule` | `"spirtes" \| "tarski" \| "pearl" \| "pareto"` | HeaderBar, ModulePanel |
| `graphData` | `CausalGraph` | CausalDAG3D, RiskPropagationFlow, ModulePanel, SystemCopilot, NodeInspector |
| `initialGraph` | `CausalGraph` | resetSeveredEdges (restores after scissors) |
| `shocks` | `CausalShock[]` | HeaderBar (Ω engine), CDOmegaMonitor, ShockPanel |
| `viewMode` | `"2d" \| "3d"` | DAG renderer toggle |
| `selectedNode` | `string \| null` | CausalDAG3D (camera), NodeInspector, SystemCopilot (context inject) |
| `interventionMode` | `boolean` | CausalDAG3D (highlight downstream), InterventionControls |
| `interventionTarget` | `string \| null` | CausalDAG3D (amber ring), InterventionControls (counterfactual) |
| `scissorsMode` | `boolean` | CausalDAG3D (edge click handler), InterventionControls |
| `severedEdges` | `string[]` | CausalDAG3D (greyed-out nodes), DAGEdge3D (severed styling) |
| `truthFilter` | `"raw" \| "verified"` | DAGNode3D (restricted badge), DAGEdge3D (inconsistent styling) |
| `axiomLevelFilter` | `"all" \| 0 \| 1 \| 2` | AxiomLibrary |
| `copilotMessages` | `CopilotMessage[]` | SystemCopilot |
| `importModalOpen` | `boolean` | ImportModal, ImportButton |

---

## Data Flow Diagrams

### Flow 1: Node Selection

```
User clicks node in 3D
  │
  ▼
setSelectedNode(nodeId) ──────────────────────────────────────┐
  │                                                            │
  ├──▶ CausalDAG3D                                            │
  │     ├─ Compute neighbor nodes + connected edges            │
  │     ├─ DAGNode3D: selected = cyan glow, 1.15× scale       │
  │     ├─ Other nodes: dimmed to 20% opacity                  │
  │     ├─ Connected edges: 100% opacity                       │
  │     ├─ Other edges: 5% opacity                             │
  │     └─ CameraRig: animate to [node + offset] over 400ms   │
  │                                                            │
  ├──▶ NodeInspector                                           │
  │     ├─ Expand with slide animation                         │
  │     ├─ Show Ω composite + 4-axis breakdown bars            │
  │     ├─ Show metadata (concentration, replacement, domain)  │
  │     └─ List connected edges with mechanisms                │
  │                                                            │
  └──▶ SystemCopilot                                           │
        └─ Inject: "NODE FOCUSED: {label} (Ω {score})"        │
```

### Flow 2: Shock Injection

```
User clicks shock in PARETO panel
  │
  ▼
addShock(shock) ──────────────────────────────────────────────┐
  │                                                            │
  ├──▶ HeaderBar                                               │
  │     ├─ computeOmegaState(shocks) → buffer, status          │
  │     ├─ computeDoomsdayState(shocks, buffer) → T-days       │
  │     └─ CDOmegaMonitor re-renders                           │
  │         ├─ Buffer bar color shifts (green→amber→red)       │
  │         ├─ Status: NOMINAL → ELEVATED → CRITICAL → BREACH  │
  │         ├─ T-{days} countdown updates                      │
  │         └─ Dragon King detection flag                      │
  │                                                            │
  └──▶ RiskPropagationFlow                                     │
        └─ buildRiskCards() re-prioritizes by Ω                │
```

### Flow 3: Scissors (Pearl Graph Surgery)

```
User enables scissors mode → clicks edge
  │
  ▼
severEdge(edgeId) + setGraphData(severEdgeAndSpawnConsequences())
  │
  ├──▶ Edge marked isSevered = true
  │     └─ DAGEdge3D: red, dashed, 25% opacity
  │
  ├──▶ 2 consequence nodes spawned (domain-specific templates)
  │     ├─ Ω scores: 7.5–9.5 (high criticality)
  │     ├─ Marked isConsequence = true
  │     ├─ Connected to original edge target (weight 0.8)
  │     └─ DAGNode3D: orange (#ff6d00), birth animation 500ms
  │
  └──▶ greyedOutNodes recomputed
        └─ Nodes with Ω < 7, not downstream of cuts = grey
```

### Flow 4: Dataset Import

```
User drops file into ImportModal
  │
  ▼
parseFile(file)
  ├─ detectFormat(): extension → CSV/JSON/GraphML/DOT
  ├─ content sniff fallback if no extension match
  └─ dispatch to format-specific parser
      │
      ▼
  ParsedGraph { nodes: RawNode[], edges: RawEdge[], warnings }
      │
      ▼
validateParsedGraph(parsed, existingGraph)
  ├─ ERRORS (block): duplicate IDs, missing edge refs
  ├─ WARNINGS (allow): invalid category, out-of-range values
  ├─ INFO: default values applied
  └─ applyNodeDefaults() / applyEdgeDefaults()
      │
      ▼
  ValidationResult { valid, issues, resolvedNodes, resolvedEdges }
      │
      ▼ (user clicks MERGE)
mergeGraphs(existing, incoming)
  ├─ Skip duplicate node/edge IDs
  ├─ Skip edges with invalid refs
  ├─ Recompute metadata (density, counts)
  └─ Set verificationStatus = "UNVERIFIED"
      │
      ▼
mergeGraphData(nodes, edges) → store update
  ├─ graphData = merged graph
  ├─ initialGraph = merged graph
  ├─ computeLayout3D() re-runs (50 iterations, preserves existing positions)
  ├─ disconnectedNodes computed (largest connected component)
  │   ├─ Connected to main graph → normal colors
  │   └─ Floating cluster → grey (#3a3d50)
  └─ Copilot: "Dataset imported: +X nodes, +Y edges"
```

### Flow 5: Module Switch

```
User clicks TARSKI tab
  │
  ▼
setActiveModule("tarski")
  │
  ├──▶ ModulePanel swaps content
  │     ├─ Hide: CascadeHeader + TrinityPanel (SPIRTES)
  │     └─ Show: TruthFilter + AxiomLibrary (TARSKI)
  │
  └──▶ User clicks VERIFIED filter
        │
        ▼
      setTruthFilter("verified")
        ├──▶ DAGNode3D: restricted nodes get red badge
        └──▶ DAGEdge3D: inconsistent edges turn red + dashed
```

### Flow 6: do(X) Intervention (Pearl)

```
User enables intervention mode → clicks target node
  │
  ▼
setInterventionTarget(nodeId)
  │
  ├──▶ CausalDAG3D
  │     ├─ BFS downstream from target
  │     ├─ Target node: amber ring
  │     ├─ Downstream edges: 90% opacity (causal path visible)
  │     └─ Upstream edges to target: 15% opacity (severed influence)
  │
  └──▶ InterventionControls
        ├─ E[U] = target.Ω × avg_downstream_weight × 10
        ├─ Regret Bound = (1 - avg_weight) × target.Ω
        ├─ Affected nodes with ΔΩ estimates
        ├─ Method: DeepCFR (if confounded) | BackdoorAdjustment
        └─ Policy recommendation text
```

---

## Core Engines

### Omega Engine (`src/lib/omega-engine.ts`)

Computes system-wide fragility state from active shocks.

| Function | Input | Output |
|----------|-------|--------|
| `computeOmegaState(shocks)` | CausalShock[] | `{ buffer: 0-100, status, lastUpdate }` |
| `computeDoomsdayState(shocks, buffer)` | shocks + buffer | `{ timeToFailureDays, dragonKing, regimeType, fragilityIndex, LPPLS params }` |
| `computeAlertLevel(status, doomsday)` | OmegaStatus + DoomsdayState | `"GREEN" \| "AMBER" \| "RED"` |
| `computeCascadeAnalysis(graph)` | CausalGraph | `{ λ_max, isStable, topCentralityNodes, dampingCoeff }` |

**Status Thresholds**:
- NOMINAL: buffer 65–100%
- ELEVATED: buffer 35–65%
- CRITICAL: buffer 15–35%
- OMEGA_BREACH: buffer 0–15%

**Preset Shocks** (7): Subsea Cable Severance, HBM Yield Collapse, Taiwan Strait Blockade, Grid Cascade Failure, Coolant Shortage, Rare Earth Embargo, Carrington Event

### Intervention Engine (`src/lib/intervention-engine.ts`)

Pearl's graph surgery: `severEdgeAndSpawnConsequences(graph, edgeId)`

- Marks edge as severed
- Spawns 2 consequence nodes from domain-specific templates (10 domains covered)
- Consequence nodes: high Ω (7.5–9.5), orange rendering, birth animation
- New edges connect consequences to original target (weight 0.8)

### Copilot Engine (`src/lib/copilot-engine.ts`)

Processes 3 action types + free-text queries:
- **DISCOVER_STRUCTURE**: Domain analysis, top-Ω nodes, cross-domain cascades
- **EXPLAIN_REJECTION**: Inconsistent edges, violated axioms, Tarski recommendations
- **VERIFY_LOGIC**: do(X) scenarios, expected Ω propagation
- **Free queries**: Pattern-matched (RISK, COUNTERFACT, SHOCK) → data-driven responses

### Tarski Axiom System (`src/lib/tarski-data.ts`)

12 axioms across 3 levels:
- **L0 Physics** (6): Temporal Priority, Conservation of Flow, DAG Integrity, Speed Limits, Carnot Bound, Shannon Capacity
- **L1 Regulatory** (4): Sanction Logic, Force Majeure, Capital Adequacy, EUV Export Control
- **L2 Heuristic** (2): Lead-Lag Reversal, Capacity Saturation

---

## 3D Rendering Pipeline

```
graphData (CausalGraph)
  │
  ▼
computeLayout3D(nodes, edges, existingPositions?)
  ├─ d3-force-3d simulation (200 iterations cold / 50 warm)
  │   ├─ Link force: distance=25, strength=0.4
  │   ├─ Charge force: strength=-120 (repulsion)
  │   └─ Center force: origin (0,0,0)
  ├─ Domain z-layering (10 layers from z=-4 to z=+4, scaled ×5)
  └─ Normalize to bounds: ±55 (x), ±40 (y), ±35 (z)
      │
      ▼
  NodePosition[] { id, x, y, z }
      │
      ├──▶ DAGNode3D (per node)
      │     ├─ Size: 0.5 + (Ω/10)^2.2 × 4.5  →  range [0.5, 5.0]
      │     ├─ Color: getCategoryColor(category) or grey if disconnected
      │     ├─ Glow: getOmegaGlowColor(composite) → red(>9) / amber(≥7) / green
      │     ├─ Label: HTML overlay, distance-scaled at 35
      │     └─ Hover card: Ω breakdown, metadata, 4-axis bars
      │
      ├──▶ DAGEdge3D (per edge)
      │     ├─ Quadratic Bézier tube
      │     ├─ Color: directed(cyan) / temporal(amber) / confounded(orange)
      │     ├─ Cross-domain: purple, dashed
      │     ├─ Arrowhead: cone at 80% along path
      │     └─ Hover: physicalMechanism label
      │
      └──▶ CameraRig
            ├─ Home: [40, 30, 80] looking at origin
            ├─ Selection: animate to [node + (18, 14, 30)] over 400ms
            └─ Easing: ease-out cubic
```

---

## Import Pipeline

```
src/lib/import/
├── types.ts             RawNode, RawEdge, ParsedGraph, ValidationResult, MergeResult
├── defaults.ts          applyNodeDefaults(), applyEdgeDefaults()
├── parsers/
│   ├── index.ts         detectFormat(), parseFile() dispatcher
│   ├── json-parser.ts   { nodes, edges } or array detection
│   ├── csv-parser.ts    Header aliasing, quoted fields, node vs edge detection
│   ├── graphml-parser.ts  DOMParser XML, <key> mapping, <data> extraction
│   └── dot-parser.ts    Regex-based: digraph { node [attrs]; a -> b [attrs] }
├── validation.ts        Schema checks, error/warning/info classification
└── merge.ts             Skip duplicates, recompute metadata, set UNVERIFIED

src/components/import/
├── ImportButton.tsx      Header trigger ("+ IMPORT")
├── ImportModal.tsx       3-step state machine (select → preview → confirm)
├── DropZone.tsx          Drag-and-drop + file picker
├── PreviewTable.tsx      Tabbed node/edge table with row-level validation
└── ValidationSummary.tsx  Error/warning count banner
```

**Supported Formats**: CSV, JSON, GraphML (.graphml/.gml), DOT (.dot/.gv)

**Smart Defaults**: Missing fields auto-filled — category→"infrastructure", domain→"Imported", Ω→5.0 midpoint, discoverySource→"merged"

**Merge Behavior**: Always merge (never replace). Duplicate IDs skipped. Disconnected clusters render grey until bridged by edges.

---

## Type System

### CausalNode
```
id, label, shortLabel, category (8 types), domain (10+ domains)
omegaFragility: { composite, substitutionFriction, downstreamLoad,
                  cascadingVoltage, existentialTailWeight } (all 0-10)
globalConcentration, replacementTime, physicalConstraint?
discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged"
isConfounded, isRestricted, isConsequence?, consequenceOf?
```

### CausalEdge
```
id, source, target, weight (0-1), lag, confidence (0-1)
type: "directed" | "confounded" | "temporal"
isInconsistent, physicalMechanism
isSevered?, isConsequenceEdge?
```

### CausalGraph
```
nodes: CausalNode[], edges: CausalEdge[]
metadata: { density, constraintType, verificationStatus,
            totalNodes, totalEdges, inconsistentEdges, restrictedNodes }
```

---

## Graph Data

### MAIN_GRAPH (25 nodes, 35+ edges)
**File**: `src/lib/graph-data.ts`

10 domains: EUV Lithography (3), Undersea Cables (3), Rare Earth (2), HVDC Power (2), AI Compute (3), Fertilizer (3), Data Centers (3), Dollar Funding (3), Geopolitical (2)

### ATHENA_GRAPH (18 nodes, defense-focused)
**File**: `src/lib/athena-graph-data.ts`

ISR domains: Drone Swarms, SATCOM, ISR Fusion, Chip Embargo, Secure Compute, Kill Chain

---

## Key Algorithms

| Algorithm | Location | Description |
|-----------|----------|-------------|
| Force-directed layout | `graph-layout.ts` | d3-force-3d with domain z-layering |
| Connected components | `CausalDAG3D.tsx` | BFS to find largest component; others grey |
| Cascade λ_max | `omega-engine.ts` | Max weighted row sum ≈ spectral radius |
| Ω buffer | `omega-engine.ts` | `100 - totalSeverity × 100`, clamped [0, 100] |
| Doomsday T-days | `omega-engine.ts` | `365 × (buffer / 100)`, min 3 |
| Dragon King detection | `omega-engine.ts` | fragilityIndex > 70 |
| Counterfactual E[U] | `InterventionControls` | `target.Ω × avg_weight × 10` |
| Graph surgery | `intervention-engine.ts` | Sever edge + spawn domain-specific consequences |
| CSV header aliasing | `csv-parser.ts` | Normalized header → canonical field mapping |
| Format detection | `parsers/index.ts` | Extension map → content sniffing fallback |
