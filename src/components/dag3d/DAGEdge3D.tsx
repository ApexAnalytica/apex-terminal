"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text, Line } from "@react-three/drei";
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
  const dashOffsetRef = useRef(0);

  // Color: match 2D exactly
  const baseColor = getEdgeColor(edge, isVerifiedInconsistent);
  const color = isAblated ? "#e040fb" : isSevered ? "#ff1744" : isConsequenceEdge ? "#ff6d00" : baseColor;
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

  const { curvePoints, midpoint } = useMemo(() => {
    const src = new THREE.Vector3(...sourcePos);
    const tgt = new THREE.Vector3(...targetPos);
    const mid = new THREE.Vector3().lerpVectors(src, tgt, 0.5);
    mid.add(curveOffset);

    const curve = new THREE.QuadraticBezierCurve3(src, mid, tgt);
    const pts = curve.getPoints(32);
    const midPt = curve.getPoint(0.5);
    return { curvePoints: pts.map(p => [p.x, p.y, p.z] as [number, number, number]), midpoint: midPt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, curveOffset]);

  // Dash configuration — matching 2D behavior
  const isTemporalFlow = edge.type === "temporal";
  const useDashed =
    isAblated || isSevered || edge.type === "confounded" ||
    isVerifiedInconsistent || isTemporalFlow;

  const dashSize = isTemporalFlow ? 0.6 : (isAblated || isSevered) ? 0.6 : 0.5;
  const gapSize = isTemporalFlow ? 0.4 : (isAblated || isSevered) ? 0.4 : 0.3;

  // Selection-aware opacity
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

  // Animate dash offset for temporal edges
  const shouldAnimate = !isSevered && !isAblated && !selectionDim &&
    (isTemporalFlow || propSignal > 0.3);
  const animSpeed = isTemporalFlow ? 1.5 : 1.0 + propSignal * 1.5;

  // Use useFrame to update dashOffset on the Line's material
  useFrame(() => {
    if (!shouldAnimate || !useDashed) return;
    dashOffsetRef.current -= 0.015 * animSpeed;
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

      {/* Edge line using drei's Line component for reliable rendering */}
      {useDashed ? (
        <DashedEdgeLine
          points={curvePoints}
          color={color}
          lineWidth={Math.max(1, lineWidth)}
          opacity={lineOpacity}
          dashSize={dashSize}
          gapSize={gapSize}
          shouldAnimate={shouldAnimate}
          animSpeed={animSpeed}
        />
      ) : (
        <Line
          points={curvePoints}
          color={color}
          lineWidth={Math.max(1, lineWidth)}
          transparent
          opacity={lineOpacity}
        />
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

/**
 * Dashed line with animated dashOffset — uses Three.js Line + LineDashedMaterial
 * imperatively so computeLineDistances() and dashOffset animation work correctly.
 */
function DashedEdgeLine({
  points,
  color,
  lineWidth,
  opacity,
  dashSize,
  gapSize,
  shouldAnimate,
  animSpeed,
}: {
  points: [number, number, number][];
  color: string;
  lineWidth: number;
  opacity: number;
  dashSize: number;
  gapSize: number;
  shouldAnimate: boolean;
  animSpeed: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lineObjRef = useRef<THREE.Line | null>(null);
  const matRef = useRef<THREE.LineDashedMaterial | null>(null);

  // Build line imperatively so computeLineDistances works
  useEffect(() => {
    if (!groupRef.current) return;

    // Clean up previous
    if (lineObjRef.current) {
      groupRef.current.remove(lineObjRef.current);
      lineObjRef.current.geometry.dispose();
      (lineObjRef.current.material as THREE.Material).dispose();
      lineObjRef.current = null;
      matRef.current = null;
    }

    const vecs = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const geometry = new THREE.BufferGeometry().setFromPoints(vecs);
    const material = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize,
      gapSize,
    });

    const line = new THREE.Line(geometry, material);
    line.computeLineDistances(); // Required for dashes to render
    lineObjRef.current = line;
    matRef.current = material;
    groupRef.current.add(line);

    return () => {
      if (lineObjRef.current && groupRef.current) {
        groupRef.current.remove(lineObjRef.current);
      }
      geometry.dispose();
      material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, dashSize, gapSize]);

  // Update color/opacity reactively without recreating the line
  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.color.set(color);
    matRef.current.opacity = opacity;
  }, [color, opacity]);

  // Animate dash offset
  useFrame(() => {
    if (!matRef.current || !shouldAnimate) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (matRef.current as any).dashOffset -= 0.015 * animSpeed;
  });

  return <group ref={groupRef} />;
}

const DAGEdge3D = React.memo(DAGEdge3DInner);
export default DAGEdge3D;
