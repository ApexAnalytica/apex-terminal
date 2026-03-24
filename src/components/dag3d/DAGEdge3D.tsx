"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
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
  epochState?: EdgeEpochState;
}

/**
 * Edge color — matches 2D ReactFlow edge styling:
 *   directed  → cyan (#00e5ff)  — solid line
 *   temporal  → amber (#ffab00) — animated dashed line
 *   confounded → orange (#ff6d00) — static dashed line
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
  epochState,
}: DAGEdge3DProps) {
  const [hovered, setHovered] = useState(false);
  const lineRef = useRef<THREE.Line>(null);
  const curveRef = useRef<THREE.QuadraticBezierCurve3 | null>(null);

  // Color: match 2D exactly (no cross-domain magenta — keeps it clean)
  const baseColor = getEdgeColor(edge, isVerifiedInconsistent);
  const color = isAblated ? "#e040fb" : isSevered ? "#ff1744" : isConsequenceEdge ? "#ff6d00" : baseColor;
  const lineWidth = 0.5 + edge.weight * 1.5;

  // Deterministic curve offset based on edge ID — prevents random re-rolls on rerender
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

  // Use string key for position comparison to avoid array reference issues
  const posKey = `${sourcePos[0]},${sourcePos[1]},${sourcePos[2]}|${targetPos[0]},${targetPos[1]},${targetPos[2]}`;

  const { points, midpoint } = useMemo(() => {
    const src = new THREE.Vector3(...sourcePos);
    const tgt = new THREE.Vector3(...targetPos);
    const mid = new THREE.Vector3().lerpVectors(src, tgt, 0.5);
    mid.add(curveOffset);

    const curve = new THREE.QuadraticBezierCurve3(src, mid, tgt);
    curveRef.current = curve;
    const pts = curve.getPoints(32); // more points for smoother curves

    const midPt = curve.getPoint(0.5);
    return { points: pts, midpoint: midPt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, curveOffset]);

  const prevGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const lineGeometry = useMemo(() => {
    if (prevGeometryRef.current) prevGeometryRef.current.dispose();
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    // computeLineDistances is required for dashed lines to work in Three.js
    const line = new THREE.Line(geometry);
    line.computeLineDistances();
    const distances = line.geometry.attributes.lineDistance;
    geometry.setAttribute("lineDistance", distances);
    prevGeometryRef.current = geometry;
    return geometry;
  }, [points]);

  useEffect(() => {
    return () => {
      if (prevGeometryRef.current) prevGeometryRef.current.dispose();
    };
  }, []);

  // Dash configuration — matching 2D behavior:
  //   directed:    solid line (no dashes)
  //   temporal:    dashed + animated flow (like 2D's animated: true)
  //   confounded:  dashed, static (like 2D's strokeDasharray)
  //   inconsistent: dashed, static
  //   ablated/severed: dashed, static
  const isTemporalFlow = edge.type === "temporal";
  const useDashed =
    isAblated || isSevered || edge.type === "confounded" ||
    isVerifiedInconsistent || isTemporalFlow;

  const dashSize = isTemporalFlow ? 0.6 : (isAblated || isSevered) ? 0.6 : 0.5;
  const gapSize = isTemporalFlow ? 0.4 : (isAblated || isSevered) ? 0.4 : 0.3;

  // Selection-aware opacity — consistent with 2D dimming
  const selectionDim = anyNodeSelected && !isConnectedToSelected;
  const propSignal = epochState ? epochState.propagationSignal : 0;
  const propBoost = propSignal * 0.5;
  const baseOpacity = isAblated ? 0.15
    : isSevered ? 0.25
    : isDimmed ? 0.15
    : isHighlighted ? 0.9
    : hovered ? 0.8
    : isConsequenceEdge ? 0.85
    : (0.5 + propBoost);
  const lineOpacity = selectionDim ? 0.05
    : isConnectedToSelected ? 1.0
    : Math.min(1, baseOpacity);

  // Animate dash offset for temporal/causal edges — creates the
  // flowing dashed line effect that matches the 2D CSS animation.
  // Also animate when propagation signal is active.
  const shouldAnimate = !isSevered && !isAblated && !selectionDim &&
    (isTemporalFlow || propSignal > 0.3);
  const animSpeed = isTemporalFlow ? 1.5 : 1.0 + propSignal * 1.5;

  useFrame(() => {
    if (!lineRef.current) return;
    const rawMat = lineRef.current.material;
    if (!rawMat || Array.isArray(rawMat)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = rawMat as any;
    if (typeof mat.dashOffset !== "number") return;

    if (shouldAnimate) {
      // Animate dashOffset — negative moves dashes forward (source → target)
      mat.dashOffset -= 0.015 * animSpeed;
    }
  });

  return (
    <group>
      {/* Invisible wider hitbox for hover + scissors click */}
      <mesh
        position={[midpoint.x, midpoint.y, midpoint.z]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={
          ablationMode && onAblationClick
            ? onAblationClick
            : scissorsMode && onScissorsClick && !isSevered
              ? onScissorsClick
              : undefined
        }
      >
        <sphereGeometry args={[scissorsMode || ablationMode ? 3.5 : 2, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Edge line — consistent with 2D:
          directed = solid cyan line
          temporal = animated dashed amber line (flowing toward target)
          confounded = static dashed orange line
          inconsistent = static dashed red line */}
      {useDashed ? (
        // @ts-expect-error — R3F <line> is THREE.Line, not SVG line
        <line ref={lineRef}>
          <bufferGeometry attach="geometry" {...lineGeometry} />
          <lineDashedMaterial
            color={color}
            transparent
            opacity={lineOpacity}
            dashSize={dashSize}
            gapSize={gapSize}
            linewidth={lineWidth}
          />
        </line>
      ) : (
        // @ts-expect-error — R3F <line> is THREE.Line, not SVG line
        <line ref={lineRef}>
          <bufferGeometry attach="geometry" {...lineGeometry} />
          <lineBasicMaterial
            color={color}
            transparent
            opacity={lineOpacity}
            linewidth={lineWidth}
          />
        </line>
      )}

      {/* Hover: physical mechanism label */}
      {hovered && edge.physicalMechanism && (
        <Billboard position={[midpoint.x, midpoint.y + 1.5, midpoint.z]}>
          <Text
            fontSize={0.5}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            font={undefined}
            maxWidth={20}
          >
            {edge.physicalMechanism}
          </Text>
          {isCrossDomain && (
            <Text
              fontSize={0.35}
              color="#e040fb"
              anchorX="center"
              anchorY="top"
              position={[0, -0.5, 0]}
              font={undefined}
            >
              CROSS-DOMAIN
            </Text>
          )}
        </Billboard>
      )}
    </group>
  );
}

const DAGEdge3D = React.memo(DAGEdge3DInner);
export default DAGEdge3D;
