"use client";

import React, { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CausalNode, NodeEpochState } from "@/lib/types";
import { getCategoryColor, getDomainColor } from "@/lib/graph-data";
import { NodeMetrics } from "@/lib/graph-layout";
import { useApexStore } from "@/stores/useApexStore";
import { resolveDomainProfile } from "@/lib/domain-profiles";

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
  isSelected: boolean;
  isNeighborOfSelected: boolean;
  anyNodeSelected: boolean;
  isConsequence?: boolean;
  isGreyedOut?: boolean;
  isAblated?: boolean;
  ablationMode?: boolean;
  metrics?: NodeMetrics;
  epochState?: NodeEpochState;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

function getOmegaGlowColor(composite: number): string {
  if (composite > 9) return "#ff1744";
  if (composite >= 7) return "#ffab00";
  return "#00e676";
}

function getBarColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

function getCentralityLabel(ec: number): string {
  if (ec >= 0.8) return "CRITICAL HUB";
  if (ec >= 0.5) return "HIGH INFLUENCE";
  if (ec >= 0.2) return "MODERATE";
  return "PERIPHERAL";
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
  onClick,
  onDoubleClick,
}: DAGNode3DProps) {
  const isOrbiting = useOrbitActive();
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const nodeSizeMetric = useApexStore((s) => s.nodeSizeMetric);
  const profile = resolveDomainProfile(selectedDomains);
  const pillarLabels = profile.pillarLabels;
  const meshRef = useRef<THREE.Mesh>(null);
  const selectionRingRef = useRef<THREE.Mesh>(null);
  const birthProgress = useRef(isConsequence ? 0 : 1);
  const displayOmega = useRef(node.omegaFragility.composite);
  const [hovered, setHovered] = useState(false);
  const baseColor = node.datasetColor ?? getCategoryColor(node.category);
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

  useFrame(({ clock }, delta) => {
    // Gate all per-frame work: skip static nodes that don't need animation (item #2)
    const needsAnimation = isConsequence || shockGlow > 0 || birthProgress.current < 1 || isSelected;
    if (!needsAnimation) return;

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
      const pulseIntensity = isConsequence ? 0.08 : (0.03 + shockGlow * 0.12);
      // Use clock.elapsedTime instead of Date.now() (item #2)
      const t = clock.elapsedTime;
      const pulseSpeed = isConsequence ? 5 : (2 + shockGlow * 3);
      const pulse = Math.sin(t * pulseSpeed * (1 + composite / 10)) * pulseIntensity;
      meshRef.current.scale.setScalar(baseScale + pulse);
    }
    if (selectionRingRef.current) {
      const t = clock.elapsedTime;
      const ringPulse = 0.3 + Math.sin(t * 4) * 0.15;
      const mat = selectionRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = ringPulse;
    }
  });

  const axes = [
    { label: pillarLabels.irreplaceability, value: node.omegaFragility.irreplaceability },
    { label: pillarLabels.restorationLatency, value: node.omegaFragility.restorationLatency },
    { label: pillarLabels.jurisdictionalHazard, value: node.omegaFragility.jurisdictionalHazard },
    { label: pillarLabels.cascadeLoad, value: node.omegaFragility.cascadeLoad },
    { label: pillarLabels.tailDepth, value: node.omegaFragility.tailDepth },
  ];

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

      {/* Label — only visible on hover, single-select, or multi-select.
           v1 painted a label on every orb permanently and dense graphs read
           as a hodgepodge of overlapping text. The hover detail card below
           still surfaces full info on demand. */}
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
                color: isSelected ? "rgba(0,229,255,0.7)" : "rgba(90,94,114,1)",
                textShadow: "0 0 4px rgba(0,0,0,0.9)",
                marginTop: "1px",
              }}
            >
              {node.domain.toUpperCase()} | {"\u03A9"} {composite.toFixed(1)}
            </div>
          </div>
        </Html>
      )}

      {/* Detail Card — full ΩF profile + network metrics. Was previously
           gated on `hovered`, which made the heavy card pop up on every
           mouse-move and obscured the canvas. User feedback: the small
           floating label (above) is the right hover affordance; the
           heavy card should only appear on explicit selection (click).
           Mirrors the 2D view's hover-vs-click split. */}
      {isSelected && !dimmed && (
        <Html
          position={[0, size + (isSelected ? 3.5 : 2.5), 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(10, 11, 16, 0.95)",
              border: `1px solid ${isSelected ? "rgba(0, 229, 255, 0.6)" : "rgba(90, 94, 114, 0.4)"}`,
              borderRadius: "6px",
              padding: "12px 14px",
              fontFamily: "monospace",
              fontSize: "11px",
              color: "#c8cad0",
              width: "280px",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontWeight: "bold", color: "#ffffff", fontSize: "12px" }}>
                {node.label}
              </div>
              <div
                style={{
                  fontSize: "9px",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  backgroundColor: `${getDomainColor(node.domain)}15`,
                  color: getDomainColor(node.domain),
                  border: `1px solid ${getDomainColor(node.domain)}40`,
                }}
              >
                {node.domain.toUpperCase()}
              </div>
            </div>

            {/* Omega Composite */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "10px" }}>
              <span style={{ fontSize: "22px", fontWeight: "bold", color: getBarColor(composite) }}>
                {"\u03A9"} {composite.toFixed(1)}
              </span>
              <span style={{ fontSize: "9px", color: "#5a5e72" }}>/ 10.0</span>
            </div>

            {/* 5-axis bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
              {axes.map((axis) => (
                <div key={axis.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "90px", fontSize: "8px", color: "#5a5e72", flexShrink: 0 }}>
                    {axis.label}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: "4px",
                      backgroundColor: "rgba(90, 94, 114, 0.2)",
                      borderRadius: "2px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(axis.value / 10) * 100}%`,
                        height: "100%",
                        backgroundColor: getBarColor(axis.value),
                        borderRadius: "2px",
                      }}
                    />
                  </div>
                  <div style={{ width: "28px", fontSize: "9px", color: getBarColor(axis.value), textAlign: "right" }}>
                    {axis.value.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>

            {/* Network Position Metrics — explains SIZE and DISTANCE */}
            {metrics && (
              <div style={{
                borderTop: "1px solid rgba(90, 94, 114, 0.2)",
                paddingTop: "8px",
                marginBottom: "8px",
              }}>
                <div style={{ fontSize: "8px", color: "#5a5e72", marginBottom: "6px", letterSpacing: "1px" }}>
                  NETWORK POSITION
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                  <div style={{ fontSize: "9px" }}>
                    <span style={{ color: "#5a5e72" }}>CENTRALITY: </span>
                    <span style={{ color: ec >= 0.5 ? "#ffab00" : "#c8cad0", fontWeight: ec >= 0.5 ? "bold" : "normal" }}>
                      {(ec * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ fontSize: "9px" }}>
                    <span style={{ color: "#5a5e72" }}>DEGREE: </span>
                    <span style={{ color: "#c8cad0" }}>{metrics.degree}</span>
                  </div>
                  <div style={{ fontSize: "9px" }}>
                    <span style={{ color: "#5a5e72" }}>BETWEENNESS: </span>
                    <span style={{ color: metrics.betweennessCentrality >= 0.3 ? "#00e5ff" : "#c8cad0" }}>
                      {(metrics.betweennessCentrality * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ fontSize: "9px" }}>
                    <span style={{ color: "#5a5e72" }}>CLUSTERING: </span>
                    <span style={{ color: "#c8cad0" }}>{metrics.clusteringCoeff.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ fontSize: "8px", color: "#5a5e72", marginTop: "5px", fontStyle: "italic" }}>
                  {getCentralityLabel(ec)} — size ∝{" "}
                  {nodeSizeMetric === "omega"
                    ? "ΩF composite"
                    : nodeSizeMetric === "betweenness"
                      ? "betweenness centrality"
                      : "eigenvector centrality"}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div style={{ borderTop: "1px solid rgba(90, 94, 114, 0.2)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <div style={{ fontSize: "9px" }}>
                <span style={{ color: "#5a5e72" }}>CONCENTRATION: </span>
                <span style={{ color: "#c8cad0" }}>{node.globalConcentration}</span>
              </div>
              <div style={{ fontSize: "9px" }}>
                <span style={{ color: "#5a5e72" }}>REPLACEMENT: </span>
                <span style={{ color: "#c8cad0" }}>{node.replacementTime}</span>
              </div>
              {node.physicalConstraint && (
                <div style={{ fontSize: "9px" }}>
                  <span style={{ color: "#5a5e72" }}>CONSTRAINT: </span>
                  <span style={{ color: "#ff6d00" }}>{node.physicalConstraint}</span>
                </div>
              )}
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
  // Intentionally not comparing onClick / onDoubleClick — closures rebuild
  // every parent render but their behavior is stable per node.id.
  return true;
}

const DAGNode3D = React.memo(DAGNode3DInner, arePropsEqual);
export default DAGNode3D;
