"use client";

import React, { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CausalNode, NodeEpochState } from "@/lib/types";
import { getCategoryColor } from "@/lib/graph-color";
import { getDomainCardColor } from "@/lib/domains";
import { NodeMetrics } from "@/lib/graph-layout";
import { useApexStore } from "@/stores/useApexStore";

// Shared reactive flag: set by CameraRig when orbit controls are actively dragging.
// Uses a subscription pattern so nodes re-render when orbiting starts/stops.
const orbitListeners = new Set<(active: boolean) => void>();
export const orbitActiveRef = {
  current: false,
  set(val: boolean) {
    if (this.current === val) return;
    this.current = val;
    orbitListeners.forEach(fn => fn(val));
  },
};
export function useOrbitActive(): boolean {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    orbitListeners.add(setActive);
    return () => { orbitListeners.delete(setActive); };
  }, []);
  return active;
}

interface DAGNode3DProps {
  node: CausalNode;
  position: [number, number, number];
  isInterventionTarget: boolean;
  isVerifiedRestricted: boolean;
  // True if this node is the singular click-selected node OR a member of
  // a marquee/domain multi-selection. Drives ring + scale + label.
  isSelected: boolean;
  isNeighborOfSelected: boolean;
  anyNodeSelected: boolean;
  isConsequence?: boolean;
  isGreyedOut?: boolean;
  isAblated?: boolean;
  ablationMode?: boolean;
  metrics?: NodeMetrics;
  epochState?: NodeEpochState;
  /**
   * 1-indexed ordinal indicating when this node first activated in the
   * current replay (1 = first to fire, 2 = second, …). When set, the
   * node carries a small floating badge so analysts can see propagation
   * order at a glance. `undefined` = no badge (replay isn't active OR
   * this node hasn't joined the cascade yet at the current epoch).
   */
  activationOrdinal?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

function getOmegaGlowColor(composite: number): string {
  if (composite > 9) return "#ff1744";
  if (composite >= 7) return "#ffab00";
  return "#00e676";
}

function DAGNode3DInner({
  node,
  position,
  isInterventionTarget,
  isVerifiedRestricted,
  isSelected,
  isNeighborOfSelected,
  anyNodeSelected,
  isConsequence = false,
  isGreyedOut = false,
  isAblated = false,
  ablationMode = false,
  metrics,
  epochState,
  activationOrdinal,
  onClick,
  onDoubleClick,
}: DAGNode3DProps) {
  const isOrbiting = useOrbitActive();
  const nodeSizeMetric = useApexStore((s) => s.nodeSizeMetric);
  const meshRef = useRef<THREE.Mesh>(null);
  const selectionRingRef = useRef<THREE.Mesh>(null);
  const birthProgress = useRef(isConsequence ? 0 : 1);
  const displayOmega = useRef(node.omegaFragility.composite);
  const [hovered, setHovered] = useState(false);
  // Color priority: domain-card colour (matches the bottom-left panel
  // row colour) → per-node datasetColor → category palette fallback.
  // See parallel resolution in CausalDAG2D / CausalDAGMap.
  const baseColor =
    getDomainCardColor(node.domain) ??
    node.datasetColor ??
    getCategoryColor(node.category);
  const color = isGreyedOut ? "#3a3d50" : isConsequence ? "#ff6d00" : baseColor;
  const composite = epochState ? epochState.omegaComposite : node.omegaFragility.composite;

  // Node radius driven by the user-selected metric. v1 was hardwired to
  // eigenvector centrality at 0.2 → 0.75; users complained the orbs were
  // "near invisible" at the low end. New range 0.45 → 1.05 (≈ 2× bigger
  // across the board) keeps small/large differentiation but lifts the
  // floor enough that even peripheral nodes read as orbs, not dots.
  const ec = metrics?.eigenvectorCentrality ?? 0.5;
  const bc = metrics?.betweennessCentrality ?? 0.5;
  // Map composite (0..10) → 0..1 for the omega path.
  const omegaUnit = Math.max(0, Math.min(1, composite / 10));
  const sizeUnit =
    nodeSizeMetric === "omega"
      ? omegaUnit
      : nodeSizeMetric === "betweenness"
        ? Math.max(0, Math.min(1, bc))
        : Math.max(0, Math.min(1, ec));
  const size = 0.45 + sizeUnit * 0.6;

  const glowColor = isConsequence ? "#ff6d00" : getOmegaGlowColor(composite);
  const shockGlow = epochState ? epochState.shockIntensity : 0;

  // Compute opacity based on selection state
  const dimmed = anyNodeSelected && !isSelected && !isNeighborOfSelected;
  const nodeOpacity = isAblated ? 0.15 : isGreyedOut ? 0.08 : dimmed ? 0.2 : 0.9;

  // Stable per-node phase offset so 192 orbs don't breathe in lockstep
  // (which would read as a UI sync glitch, not life). djb2-style hash
  // on node.id → 0..2π, computed once at mount. Cheap, deterministic.
  const phaseOffsetRef = useRef<number>((() => {
    let h = 5381;
    for (let i = 0; i < node.id.length; i++) h = ((h << 5) + h + node.id.charCodeAt(i)) >>> 0;
    return (h % 1000) / 1000 * Math.PI * 2;
  })());

  useFrame(({ clock }, delta) => {
    // Per-frame work is now baseline-idle by default — every visible
    // orb gets a slow breathing pulse so the canvas reads as alive
    // when nothing's happening. Reasons to skip outright:
    //   - greyed out (off-active-domain — animating invisible orbs
    //     spends GPU on nothing)
    //   - ablated (functionally removed from the cascade; static
    //     reads correctly)
    //   - mid-orbit camera (existing perf gate to keep drag smooth)
    if (isGreyedOut || isAblated || isOrbiting) return;

    // Birth animation for consequence nodes
    if (birthProgress.current < 1) {
      birthProgress.current = Math.min(1, birthProgress.current + delta * 2);
    }

    // Smooth interpolation toward epoch target
    const targetOmega = epochState ? epochState.omegaComposite : node.omegaFragility.composite;
    displayOmega.current += (targetOmega - displayOmega.current) * 0.15;

    if (meshRef.current) {
      const birth = birthProgress.current;
      const baseScale = (isSelected ? 1.15 : 1) * birth;
      const t = clock.elapsedTime;
      const phase = phaseOffsetRef.current;

      // Baseline idle pulse — always-on, low amplitude (≈ ±1.5%),
      // slow (~one cycle every 4-6 s). Each orb runs at its own
      // phase so the field of 192 orbs reads as a gentle living
      // breath rather than a synchronised pump.
      const idleAmp = 0.015;
      const idleSpeed = 1.1 + composite / 50; // hotter nodes a touch faster
      const idlePulse = Math.sin(t * idleSpeed + phase) * idleAmp;

      // Stronger pulse layered on top for active states (shock,
      // consequence) — same shape as before but additive to the
      // baseline so the idle breath doesn't visibly start/stop when
      // those states change.
      let activePulse = 0;
      if (isConsequence || shockGlow > 0 || isSelected) {
        const pulseIntensity = isConsequence ? 0.08 : (0.03 + shockGlow * 0.12);
        const pulseSpeed = isConsequence ? 5 : (2 + shockGlow * 3);
        activePulse =
          Math.sin(t * pulseSpeed * (1 + composite / 10) + phase) * pulseIntensity;
      }

      meshRef.current.scale.setScalar(baseScale + idlePulse + activePulse);
    }
    if (selectionRingRef.current) {
      const t = clock.elapsedTime;
      const ringPulse = 0.3 + Math.sin(t * 4) * 0.15;
      const mat = selectionRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = ringPulse;
    }
  });

  return (
    <group position={position} onClick={onClick} onDoubleClick={onDoubleClick}>
      {/* Selection ring (bright cyan pulsing) */}
      {isSelected && (
        <mesh ref={selectionRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.8, size * 2.2, 32]} />
          <meshBasicMaterial
            color="#00e5ff"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Ablation ring (magenta) */}
      {isAblated && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.8, size * 2.2, 32]} />
          <meshBasicMaterial
            color="#e040fb"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Omega glow ring — opacity floor lifted so the ΩF colour signal
           reads at idle (was 0.15 / 0.35; now 0.32 / 0.55). */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 1.3, size * 1.5, 32]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={(hovered ? 0.55 : 0.32) * (dimmed ? 0.3 : 1)}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Glow sphere (outer) — bumped from 0.06/0.12 to 0.16/0.32 so the
           orb has visible presence at idle, not just on hover. v1 was
           "near invisible" against the dark background. */}
      <mesh>
        <sphereGeometry args={[size * 1.6, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={(hovered ? 0.32 : 0.16) * (dimmed ? 0.3 : 1)}
        />
      </mesh>

      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
          // Trigger a frame in demand mode (item #1)
          window.dispatchEvent(new Event("dag3d-invalidate"));
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
          window.dispatchEvent(new Event("dag3d-invalidate"));
        }}
      >
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={isGreyedOut ? "#1a1a2e" : isSelected ? "#00e5ff" : color}
          // Idle floor lifted from 0.4 to 0.7 so orbs are clearly emissive
          // out of the box, not just when hovered.
          emissiveIntensity={isGreyedOut ? 0.02 : isSelected ? 1.0 : hovered ? 0.95 : (0.7 + (composite / 10) * 0.3 + shockGlow * 0.6)}
          transparent
          opacity={nodeOpacity}
        />
      </mesh>

      {/* Intervention target ring */}
      {isInterventionTarget && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.8, size * 2.2, 32]} />
          <meshBasicMaterial color="#ffab00" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Restricted badge */}
      {isVerifiedRestricted && (
        <mesh position={[size * 1.2, size * 1.2, 0]}>
          <sphereGeometry args={[0.3, 12, 12]} />
          <meshBasicMaterial color="#ff1744" />
        </mesh>
      )}

      {/* Cascade sequence badge — small numbered chip floating above
           the orb during replay. The number is this node's 1-indexed
           rank in the activation timeline (1 = first to fire). Only
           renders when an ordinal is supplied AND the orb isn't
           greyed-out / orbit-camera-active, so it stays out of the
           way during normal exploration. Suppressed for ablated nodes
           because they're not contributing to the cascade by
           construction. */}
      {activationOrdinal !== undefined && !isOrbiting && !isGreyedOut && !isAblated && (
        <Html
          position={[size * 0.9, size * 0.9, 0]}
          center
          style={{ pointerEvents: "none" }}
          zIndexRange={[0, 0]}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "10px",
              fontWeight: 700,
              color: "#0a0c14",
              backgroundColor: "#ffd54f",
              border: "1px solid rgba(10,12,20,0.7)",
              borderRadius: "999px",
              minWidth: "16px",
              height: "16px",
              padding: "0 4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              userSelect: "none",
              lineHeight: 1,
              boxShadow: "0 0 4px rgba(0,0,0,0.6)",
            }}
            title={`Activation order: ${activationOrdinal} — fired ${
              activationOrdinal === 1 ? "first" : "after " + (activationOrdinal - 1) + " other node" + (activationOrdinal === 2 ? "" : "s")
            } in the current cascade`}
          >
            {activationOrdinal}
          </div>
        </Html>
      )}

      {/* Label — only visible on hover, single-select, neighbour-of-
           select, or multi-select. v1 painted a label on every orb
           permanently and dense graphs read as a hodgepodge of overlapping
           text. The earlier path also rendered a heavy in-canvas detail
           card on click; that's been removed because the user wants 3D to
           match 2D — small floating label + neighbour spotlight, with the
           full ΩF profile / network metrics surfacing in NodeInspector
           and ModulePanel side panels rather than over the canvas. */}
      {!dimmed && !isOrbiting && (hovered || isSelected || isNeighborOfSelected) && (
        <Html
          position={[0, size * 1.6 + 0.6, 0]}
          center
          style={{ pointerEvents: "none" }}
          zIndexRange={[0, 0]}
        >
          <div
            style={{
              fontFamily: "monospace",
              textAlign: "center",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            <div
              style={{
                fontSize: isSelected ? "11px" : "8px",
                fontWeight: "bold",
                color: isSelected ? "#00e5ff" : hovered ? "#ffffff" : color,
                textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
              }}
            >
              {node.label}
            </div>
            <div
              style={{
                fontSize: isSelected ? "8px" : "7px",
                color: isSelected ? "rgba(0,229,255,0.7)" : "var(--text-muted)",
                textShadow: "0 0 4px rgba(0,0,0,0.9)",
                marginTop: "1px",
              }}
            >
              {node.domain.toUpperCase()} | {"\u03A9"} {composite.toFixed(1)}
            </div>
          </div>
        </Html>
      )}

    </group>
  );
}

/**
 * Custom equality check for the React.memo wrap below. The default shallow
 * comparator was being defeated for every node on every parent re-render
 * because three props rebuild fresh refs each time:
 *
 *   - `position`: a new `[x, y, z]` tuple from posMap[node.id]
 *   - `epochState`: a fresh object literal in the non-snapshot fallback path
 *     (see CausalDAG3D.tsx, where the parent maps the nodes)
 *   - `onClick` / `onDoubleClick`: inline closures
 *
 * That meant ~169 nodes re-rendering on every parent update — each with its
 * own framer-motion / R3F work — which competed with the per-frame edge
 * particle animations and made the orbs glitch when domain selection
 * touched many nodes at once.
 *
 * This comparator compares the value-bearing props by content (not by ref)
 * and ignores callback identity. Closures are functionally pure (they close
 * over `node.id` + stable store actions), so re-render isn't required when
 * only their reference flips.
 */
function arePropsEqual(prev: DAGNode3DProps, next: DAGNode3DProps) {
  if (prev.node !== next.node) return false;
  // position is a tuple — compare element-wise
  if (
    prev.position[0] !== next.position[0] ||
    prev.position[1] !== next.position[1] ||
    prev.position[2] !== next.position[2]
  ) return false;
  if (prev.isInterventionTarget !== next.isInterventionTarget) return false;
  if (prev.isVerifiedRestricted !== next.isVerifiedRestricted) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isNeighborOfSelected !== next.isNeighborOfSelected) return false;
  if (prev.anyNodeSelected !== next.anyNodeSelected) return false;
  if (prev.isConsequence !== next.isConsequence) return false;
  if (prev.isGreyedOut !== next.isGreyedOut) return false;
  if (prev.isAblated !== next.isAblated) return false;
  if (prev.ablationMode !== next.ablationMode) return false;
  if (prev.metrics !== next.metrics) return false;
  // epochState fields actually read by the component (omegaComposite +
  // shockIntensity). The object reference often changes per render even when
  // the contents don't, so reference compare would always invalidate.
  const pe = prev.epochState;
  const ne = next.epochState;
  if (pe !== ne) {
    if (!pe || !ne) return false;
    if (pe.omegaComposite !== ne.omegaComposite) return false;
    if (pe.shockIntensity !== ne.shockIntensity) return false;
  }
  // Cascade-sequence badge updates as the TimeDial scrubs through replay
  // (ordinal flips between defined / undefined as nodes join the cascade).
  // Plain value compare — both are number | undefined.
  if (prev.activationOrdinal !== next.activationOrdinal) return false;
  // Intentionally not comparing onClick / onDoubleClick — closures rebuild
  // every parent render but their behavior is stable per node.id.
  return true;
}

const DAGNode3D = React.memo(DAGNode3DInner, arePropsEqual);
export default DAGNode3D;
