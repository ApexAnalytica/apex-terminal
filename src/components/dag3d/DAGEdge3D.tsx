"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { CausalEdge } from "@/lib/types";

interface DAGEdge3DProps {
  edge: CausalEdge;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  isHighlighted: boolean;
  isDimmed: boolean;
  isVerifiedInconsistent: boolean;
}

function getEdgeColor(edge: CausalEdge, isVerifiedInconsistent: boolean): string {
  if (isVerifiedInconsistent) return "#ff1744";
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
}: DAGEdge3DProps) {
  const color = getEdgeColor(edge, isVerifiedInconsistent);

  const { points, arrowPosition, arrowRotation } = useMemo(() => {
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
    const pts = curve.getPoints(24);

    // Arrow at 80% along path
    const arrowPos = curve.getPoint(0.8);
    const tangent = curve.getTangent(0.8);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return {
      points: pts,
      arrowPosition: arrowPos,
      arrowRotation: euler,
    };
  }, [sourcePos, targetPos]);

  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [points]);

  const dashSize = edge.type === "confounded" || isVerifiedInconsistent ? 0.5 : 0;
  const gapSize = edge.type === "confounded" || isVerifiedInconsistent ? 0.3 : 0;

  return (
    <group>
      {/* Edge line */}
      {dashSize > 0 ? (
        <line>
          <bufferGeometry attach="geometry" {...lineGeometry} />
          <lineDashedMaterial
            color={color}
            transparent
            opacity={isDimmed ? 0.15 : isHighlighted ? 0.9 : 0.5}
            dashSize={dashSize}
            gapSize={gapSize}
            linewidth={1}
          />
        </line>
      ) : (
        <line>
          <bufferGeometry attach="geometry" {...lineGeometry} />
          <lineBasicMaterial
            color={color}
            transparent
            opacity={isDimmed ? 0.15 : isHighlighted ? 0.9 : 0.5}
            linewidth={1}
          />
        </line>
      )}

      {/* Arrowhead */}
      <mesh position={arrowPosition} rotation={arrowRotation}>
        <coneGeometry args={[0.2, 0.6, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isDimmed ? 0.15 : 0.7}
        />
      </mesh>
    </group>
  );
}

