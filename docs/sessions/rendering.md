# Session: Rendering

Owns how the causal graph is drawn: 3D WebGL force-directed canvas, 2D React Flow canvas, MAP geographic projection, and the shared selection / viewport / camera mechanics across all three. Owns render performance.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- The canvas substrate that hosts all three views, mounting all three to preserve WebGL context across switches:
  - **3D** — WebGL force-directed (default). Components: `src/components/CausalDAG3D.tsx`, `src/components/dag3d/DAGNode3D.tsx`, `src/components/dag3d/DAGEdge3D.tsx`, `src/components/dag3d/DAGOverlay.tsx`. Likely uses `@react-three/fiber` / `three`.
  - **2D** — flat React Flow layout with animated causal flow. Component: `src/components/CausalDAG2D.tsx`.
  - **MAP** — geographic projection via MapLibre for domains with real-world coordinates (energy infrastructure, etc.). Component: `src/components/CausalDAGMap.tsx`.
- Top-level switcher / coordinator: `src/components/CausalDAG.tsx`.
- Layout algorithms (force-directed, hierarchical, geo-projection) and view-mode buttons (top-right of canvas).
- Viewport: orbit/zoom/pan, drag to orbit (3D), scroll to zoom, shift+drag for box-select.
- Selection mechanics: click to select node and open inspector, shift+drag for subgraph selection.
- Visual encoding: node size and color intensity for Ω-Fragility (hotter = more systemic risk), solid arrows for directed causal edges, dashed lines for confounded/latent.
- Ancillary canvas UI: `RiskPropagationFlow.tsx` (per-node vulnerability cards above the time dial), `CanvasWatermark.tsx`.
- Render performance — memoization, frustum culling, instancing, layout throttling, framerate budgets.

## Scope summary (out — route elsewhere)

- Tour anchors (`data-tour="..."`) on canvas chrome, including view-mode buttons → **UX & Onboarding** owns the anchor placement and tour mechanics; Rendering owns the underlying control. If a tour step requires a control to render/position differently, that's a Rendering ↔ UX collaboration.
- Graph data — nodes, edges, domain profiles → respective **data sessions** (Geopolitical/Macro, T1D). Rendering consumes whatever the data layer hands it.
- Engine outputs that drive node coloring (Ω-Fragility scores, criticality signals) → respective **engine sessions**. Rendering visualizes the values; engines compute them.
- Inspector panel that opens on node click → **UX & Onboarding** for layout/copy; engine sessions for the per-pillar / per-criticality content inside.
- Time-dial cascade replay scrubber → coordinated with PEARL (counterfactual timelines) and PARETO (criticality replay).

## Boundary clarifications

- **Tour ↔ Rendering**: anchors and overlays are UX's; the canvas controls themselves are Rendering's. Adding a `data-tour` attribute is UX. Repositioning or restyling a control to make it tour-able is Rendering.
- **Empty / loading states on canvas**: copy is UX, presence-of-state is Rendering. If the canvas has no graph yet, Rendering renders the placeholder structure; UX writes the words.
- **Map projection**: Rendering owns the MapLibre setup and projection math. Whether a domain *has* coordinates to project is a data-session concern.

## Anchor files

- `src/components/CausalDAG.tsx` — top-level switcher.
- `src/components/CausalDAG2D.tsx` — React Flow.
- `src/components/CausalDAG3D.tsx` + `src/components/dag3d/*` — three.js / r3f.
- `src/components/CausalDAGMap.tsx` — MapLibre.
- `src/components/RiskPropagationFlow.tsx` — risk cards.
- `src/components/CanvasWatermark.tsx` — branding overlay on canvas.

## Likely upcoming themes

- Performance with larger graphs (>500 nodes).
- Cross-view consistency (same selection across 3D/2D/MAP).
- Counterfactual visualization when PEARL injects an intervention timeline.
- Mobile/touch viewport — currently desktop-only.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (canvas, layout, viewport, selection, render perf).
2. Be careful not to break the all-three-mounted invariant — switching views must not lose WebGL context.
3. Coordinate with engine sessions when changing how engine outputs are visualized.
