"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CausalNode } from "@/lib/types";
import { getCategoryColor, getDomainColor } from "@/lib/graph-data";

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

export default function DAGNode3D({
  node,
  position,
  isInterventionTarget,
  isVerifiedRestricted,
  isSelected,
  isNeighborOfSelected,
  anyNodeSelected,
  isConsequence = false,
  isGreyedOut = false,
  onClick,
  onDoubleClick,
}: DAGNode3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const selectionRingRef = useRef<THREE.Mesh>(null);
  const birthProgress = useRef(isConsequence ? 0 : 1);
  const [hovered, setHovered] = useState(false);
  const baseColor = getCategoryColor(node.category);
  const color = isGreyedOut ? "#3a3d50" : isConsequence ? "#ff6d00" : baseColor;
  const composite = node.omegaFragility.composite;
  const t = composite / 10;
  const size = 0.5 + Math.pow(t, 2.2) * 4.5; // range 0.5–5.0, power curve
  const glowColor = isConsequence ? "#ff6d00" : getOmegaGlowColor(composite);

  // Compute opacity based on selection state
  const dimmed = anyNodeSelected && !isSelected && !isNeighborOfSelected;
  const nodeOpacity = isGreyedOut ? 0.08 : dimmed ? 0.2 : 0.9;

  useFrame((_, delta) => {
    // Birth animation for consequence nodes
    if (birthProgress.current < 1) {
      birthProgress.current = Math.min(1, birthProgress.current + delta * 2); // ~500ms
    }

    if (meshRef.current) {
      const birth = birthProgress.current;
      const baseScale = (isSelected ? 1.15 : 1) * birth;
      const pulseIntensity = isConsequence ? 0.08 : 0.03;
      const pulseSpeed = isConsequence ? 0.005 : 0.002;
      const pulse = Math.sin(Date.now() * pulseSpeed * (1 + composite / 10)) * pulseIntensity;
      meshRef.current.scale.setScalar(baseScale + pulse);
    }
    if (selectionRingRef.current) {
      const ringPulse = 0.3 + Math.sin(Date.now() * 0.004) * 0.15;
      const mat = selectionRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = ringPulse;
    }
  });

  const axes = [
    { label: "SUBST FRICTION", value: node.omegaFragility.substitutionFriction },
    { label: "DOWNSTREAM LD", value: node.omegaFragility.downstreamLoad },
    { label: "CASCADE VOLT", value: node.omegaFragility.cascadingVoltage },
    { label: "TAIL WEIGHT", value: node.omegaFragility.existentialTailWeight },
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

      {/* Omega glow ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 1.3, size * 1.5, 32]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={(hovered ? 0.35 : 0.15) * (dimmed ? 0.3 : 1)}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Glow sphere (outer) */}
      <mesh>
        <sphereGeometry args={[size * 1.6, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={(hovered ? 0.12 : 0.06) * (dimmed ? 0.3 : 1)}
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
          emissive={isGreyedOut ? "#1a1a2e" : isSelected ? "#00e5ff" : color}
          emissiveIntensity={isGreyedOut ? 0.02 : isSelected ? 1.0 : hovered ? 0.8 : 0.4 + (composite / 10) * 0.3}
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

      {/* Label — always visible, HTML overlay above glow radius */}
      {!dimmed && (
        <Html
          position={[0, size * 1.6 + 1.5, 0]}
          center
          style={{ pointerEvents: "none" }}
          distanceFactor={35}
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
                fontSize: isSelected ? "13px" : "10px",
                fontWeight: "bold",
                color: isSelected ? "#00e5ff" : hovered ? "#ffffff" : color,
                textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
              }}
            >
              {node.label}
            </div>
            <div
              style={{
                fontSize: isSelected ? "10px" : "8px",
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

      {/* Hover Detail Card */}
      {hovered && !dimmed && (
        <Html
          position={[0, size + (isSelected ? 4.5 : 3), 0]}
          center
          style={{ pointerEvents: "none" }}
          distanceFactor={40}
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
              width: "260px",
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

            {/* 4-axis bars */}
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
