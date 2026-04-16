"use client";

import React, { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { CausalEdge, EdgeEpochState } from "@/lib/types";

interface DAGEdge3DProps {
  edge: CausalEdge;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  isHighlighted: boolean;
  isDimmed: boolean;
  isVerifiedInconsistent: boolean;
  isCrossDomain: boolean;
  isConnectedToSelected: boolean;
  anyNodeSelected: boolean;
  isSevered?: boolean;
  isConsequenceEdge?: boolean;
  scissorsMode?: boolean;
  onScissorsClick?: () => void;
  isAblated?: boolean;
  ablationMode?: boolean;
  onAblationClick?: () => void;
  onEdgeClick?: () => void;
  epochState?: EdgeEpochState;
}

/**
 * Edge color — matches 2D ReactFlow edge styling:
 *   directed  → cyan (#00e5ff)  — solid line
 *   temporal  → amber (#ffab00) — solid line + animated particle
 *   confounded → orange (#ff6d00) — dashed line
 *   inconsistent → red (#ff1744) — overrides type color
 */
function getEdgeColor(edge: CausalEdge, isVerifiedInconsistent: boolean): string {
  if (isVerifiedInconsistent) return "#ff1744";
  switch (edge.type) {
    case "directed": return "#00e5ff";
    case "temporal": return "#ffab00";
    case "confounded": return "#ff6d00";
    default: return "#2a2d45";
  }
}

function DAGEdge3DInner({
  edge,
  sourcePos,
  targetPos,
  isHighlighted,
  isDimmed,
  isVerifiedInconsistent,
  isCrossDomain,
  isConnectedToSelected,
  anyNodeSelected,
  isSevered = false,
  isConsequenceEdge = false,
  scissorsMode = false,
  onScissorsClick,
  isAblated = false,
  ablationMode = false,
  onAblationClick,
  onEdgeClick,
  epochState,
}: DAGEdge3DProps) {
  const [hovered, setHovered] = useState(false);
  const particleRef = useRef<THREE.Mesh>(null);
  const particleT = useRef(Math.random()); // stagger start positions

  // Color: match 2D exactly
  //   ablated   → magenta (#e040fb)   — Pearl do(X) node isolation
  //   severed   → slate  (#78909c)   — Pearl link-break (distinct from Tarski red)
  //   consequence → orange (#ff6d00) — downstream of intervention
  //   else → type-based color or Tarski red if inconsistent
  const baseColor = getEdgeColor(edge, isVerifiedInconsistent);
  const color = isAblated ? "#e040fb" : isSevered ? "#78909c" : isConsequenceEdge ? "#ff6d00" : baseColor;
  const lineWidth = 0.5 + edge.weight * 1.5;

  // Deterministic curve offset based on edge ID
  const curveOffset = useMemo(() => {
    let h = 0;
    for (let i = 0; i < edge.id.length; i++) {
      h = ((h << 5) - h + edge.id.charCodeAt(i)) | 0;
    }
    const seed = Math.abs(h);
    return new THREE.Vector3(
      ((seed % 100) / 100 - 0.5) * 2,
      (((seed >> 8) % 100) / 100 - 0.5) * 2,
      (((seed >> 16) % 100) / 100 - 0.5) * 2
    );
  }, [edge.id]);

  const posKey = `${sourcePos[0]},${sourcePos[1]},${sourcePos[2]}|${targetPos[0]},${targetPos[1]},${targetPos[2]}`;

  const { curvePoints, midpoint, curve } = useMemo(() => {
    const src = new THREE.Vector3(...sourcePos);
    const tgt = new THREE.Vector3(...targetPos);
    const mid = new THREE.Vector3().lerpVectors(src, tgt, 0.5);
    mid.add(curveOffset);

    const c = new THREE.QuadraticBezierCurve3(src, mid, tgt);
    const pts = c.getPoints(32);
    const midPt = c.getPoint(0.5);
    return {
      curvePoints: pts.map(p => [p.x, p.y, p.z] as [number, number, number]),
      midpoint: midPt,
      curve: c,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, curveOffset]);

  // Edge type determines rendering style
  const isTemporalFlow = edge.type === "temporal";
  const isDashed = edge.type === "confounded" || isVerifiedInconsistent ||
    isAblated || isSevered;

  // Selection-aware opacity
  const selectionDim = anyNodeSelected && !isConnectedToSelected;
  const propSignal = epochState ? epochState.propagationSignal : 0;
  const propBoost = propSignal * 0.5;
  const baseOpacity = isAblated ? 0.15
    : isSevered ? 0.45
    : isDimmed ? 0.15
    : isHighlighted ? 0.9
    : hovered ? 0.8
    : isConsequenceEdge ? 0.85
    : (0.5 + propBoost);
  const lineOpacity = selectionDim ? 0.05
    : isConnectedToSelected ? 1.0
    : Math.min(1, baseOpacity);

  // Should the particle flow animate?
  const shouldAnimate = !isSevered && !isAblated && !selectionDim &&
    (isTemporalFlow || propSignal > 0.3);
  const animSpeed = isTemporalFlow ? 0.4 : 0.3 + propSignal * 0.5;

  // Animate particle along curve for temporal/causal edges
  useFrame((_, delta) => {
    if (!particleRef.current || !shouldAnimate) return;
    particleT.current = (particleT.current + delta * animSpeed) % 1;
    const pos = curve.getPoint(particleT.current);
    particleRef.current.position.set(pos.x, pos.y, pos.z);
  });

  return (
    <group>
      {/* Invisible wider hitbox for hover + edge click — fully transparent,
          depthWrite off so it never shows as a black orb */}
      <mesh
        position={[midpoint.x, midpoint.y, midpoint.z]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (ablationMode && onAblationClick) {
            onAblationClick();
          } else if (scissorsMode && onScissorsClick && !isSevered) {
            onScissorsClick();
          } else if (onEdgeClick) {
            onEdgeClick();
          }
        }}
      >
        <sphereGeometry args={[scissorsMode || ablationMode ? 3.5 : 2, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Edge line — using drei Line for reliable rendering:
          directed = solid cyan
          temporal = solid amber (+ animated particle)
          confounded = dashed orange
          inconsistent = dashed red */}
      <Line
        points={curvePoints}
        color={color}
        lineWidth={Math.max(1, lineWidth)}
        transparent
        opacity={lineOpacity}
        dashed={isDashed}
        dashSize={isDashed ? 0.5 : undefined}
        gapSize={isDashed ? 0.3 : undefined}
      />

      {/* Animated flowing particle for temporal/causal edges —
          small glowing sphere that travels source → target along the curve */}
      {shouldAnimate && (
        <mesh ref={particleRef}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={lineOpacity * 0.9}
          />
        </mesh>
      )}

      {/* Edge highlight glow on hover — no popup text, just visual feedback */}
      {hovered && (
        <Line
          points={curvePoints}
          color={color}
          lineWidth={Math.max(2, lineWidth + 2)}
          transparent
          opacity={0.3}
        />
      )}

      {/* Sever marker — two crossed bars at the curve midpoint in Pearl-red.
          Makes severed edges visually unmistakable even in dense scenes and
          differentiates them from Tarski-inconsistent edges (which are red
          dashed lines with NO marker). */}
      {isSevered && (
        <group position={[midpoint.x, midpoint.y, midpoint.z]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[2.2, 0.35, 0.35]} />
            <meshBasicMaterial color="#ff1744" transparent opacity={0.95} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[2.2, 0.35, 0.35]} />
            <meshBasicMaterial color="#ff1744" transparent opacity={0.95} />
          </mesh>
        </group>
      )}
    </group>
  );
}

const DAGEdge3D = React.memo(DAGEdge3DInner);
export default DAGEdge3D;
