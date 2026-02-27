"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { CausalNode } from "@/lib/types";
import { getCategoryColor } from "@/lib/graph-data";

interface DAGNode3DProps {
  node: CausalNode;
  position: [number, number, number];
  isInterventionTarget: boolean;
  isVerifiedRestricted: boolean;
  onClick?: () => void;
}

export default function DAGNode3D({
  node,
  position,
  isInterventionTarget,
  isVerifiedRestricted,
  onClick,
}: DAGNode3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = getCategoryColor(node.category);
  const size = 0.8 + node.riskScore * 1.2;

  useFrame((_, delta) => {
    if (meshRef.current) {
      // Gentle pulse
      const scale = 1 + Math.sin(Date.now() * 0.002 * (1 + node.riskScore)) * 0.03;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group position={position} onClick={onClick}>
      {/* Glow sphere (outer) */}
      <mesh>
        <sphereGeometry args={[size * 1.6, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={hovered ? 0.12 : 0.06}
        />
      </mesh>

      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.4 + node.riskScore * 0.3}
          transparent
          opacity={0.9}
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

      {/* Label */}
      <Billboard position={[0, size + 1.2, 0]}>
        <Text
          fontSize={0.7}
          color={hovered ? "#ffffff" : color}
          anchorX="center"
          anchorY="bottom"
          font={undefined}
        >
          {node.label}
        </Text>
        <Text
          fontSize={0.4}
          color="rgba(90,94,114,1)"
          anchorX="center"
          anchorY="top"
          position={[0, -0.2, 0]}
          font={undefined}
        >
          {node.category.toUpperCase()} | {Math.round(node.riskScore * 100)}%
        </Text>
      </Billboard>
    </group>
  );
}
