"use client";

import { useMemo, useRef, useState } from "react";
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

function getEdgeColor(edge: CausalEdge, isVerifiedInconsistent: boolean, isCrossDomain: boolean): string {
  if (isVerifiedInconsistent) return "#ff1744";
  if (isCrossDomain) return "#e040fb";
  switch (edge.type) {
    case "directed": return "#00e5ff";
    case "temporal": return "#ffab00";
    case "confounded": return "#ff6d00";
    default: return "#2a2d45";
  }
}

export default function DAGEdge3D({
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
  const particleRef = useRef<THREE.Mesh>(null);
  const curveRef = useRef<THREE.QuadraticBezierCurve3 | null>(null);
  const baseColor = getEdgeColor(edge, isVerifiedInconsistent, isCrossDomain);
  const color = isAblated ? "#e040fb" : isSevered ? "#ff1744" : isConsequenceEdge ? "#ff6d00" : baseColor;
  const lineWidth = 0.5 + edge.weight * 1.5;

  const { points, arrowPosition, arrowRotation, midpoint } = useMemo(() => {
    const src = new THREE.Vector3(...sourcePos);
    const tgt = new THREE.Vector3(...targetPos);
    const mid = new THREE.Vector3().lerpVectors(src, tgt, 0.5);
    // Add slight curve
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    mid.add(offset);

    const curve = new THREE.QuadraticBezierCurve3(src, mid, tgt);
    curveRef.current = curve;
    const pts = curve.getPoints(24);

    // Arrow at 80% along path
    const arrowPos = curve.getPoint(0.8);
    const tangent = curve.getTangent(0.8);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    const midPt = curve.getPoint(0.5);

    return {
      points: pts,
      arrowPosition: arrowPos,
      arrowRotation: euler,
      midpoint: midPt,
    };
  }, [sourcePos, targetPos]);

  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [points]);

  const useDashed = isAblated || isSevered || edge.type === "confounded" || isVerifiedInconsistent || isCrossDomain;
  const dashSize = useDashed ? (isAblated ? 0.6 : isSevered ? 0.6 : isCrossDomain ? 0.8 : 0.5) : 0;
  const gapSize = useDashed ? (isAblated ? 0.4 : isSevered ? 0.4 : isCrossDomain ? 0.4 : 0.3) : 0;

  // Selection-aware opacity: dim non-connected edges when a node is selected
  const selectionDim = anyNodeSelected && !isConnectedToSelected;
  const propSignal = epochState ? epochState.propagationSignal : 0;
  const propBoost = propSignal * 0.5; // brighter edges during propagation
  const baseOpacity = isAblated ? 0.15 : isSevered ? 0.25 : isDimmed ? 0.15 : isHighlighted ? 0.9 : hovered ? 0.8 : isConsequenceEdge ? 0.85 : (0.5 + propBoost);
  const lineOpacity = selectionDim ? 0.05 : isConnectedToSelected ? 1.0 : Math.min(1, baseOpacity);
  const arrowBaseOpacity = isSevered ? 0 : isDimmed ? 0.15 : (0.7 + propBoost);
  const arrowOpacity = selectionDim ? 0.05 : isConnectedToSelected ? 1.0 : Math.min(1, arrowBaseOpacity);

  // Animate flowing particle along the edge curve
  const shouldAnimate = !isSevered && !isAblated && !selectionDim && (edge.type === "directed" || edge.type === "temporal" || propSignal > 0.3);
  const animSpeed = edge.type === "temporal" ? 0.35 : 0.25 + propSignal * 0.4;

  useFrame((_, delta) => {
    if (!particleRef.current || !curveRef.current || !shouldAnimate) return;
    const t = ((performance.now() * 0.001 * animSpeed) % 1);
    const pos = curveRef.current.getPoint(t);
    particleRef.current.position.set(pos.x, pos.y, pos.z);
    // Pulse the scale slightly for a glowing effect
    const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.3;
    particleRef.current.scale.setScalar(pulse);
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

      {/* Edge line */}
      {useDashed ? (
        <line>
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
        <line>
          <bufferGeometry attach="geometry" {...lineGeometry} />
          <lineBasicMaterial
            color={color}
            transparent
            opacity={lineOpacity}
            linewidth={lineWidth}
          />
        </line>
      )}

      {/* Arrowhead */}
      <mesh position={arrowPosition} rotation={arrowRotation}>
        <coneGeometry args={[0.2 + edge.weight * 0.15, 0.6, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={arrowOpacity}
        />
      </mesh>

      {/* Animated flowing particle */}
      {shouldAnimate && (
        <mesh ref={particleRef}>
          <sphereGeometry args={[0.12 + edge.weight * 0.08, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={lineOpacity * 0.9}
          />
        </mesh>
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
