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
  /**
   * χ★ tier — discrete midpoint marker tells the user this edge is
   * in the load-bearing skeleton without smudging the cyan / amber
   * line color (which encodes causal type). Two visual tiers so the
   * categorical difference between strict bridges and top-BES reads
   * at a glance:
   *   "bridge"  — filled violet octahedron. Cutting this disconnects
   *                the (undirected) graph.
   *   "top-bes" — hollow violet octahedron (wireframe). High shortest-
   *                path load, but not a disconnector.
   *   null / undef — edge isn't in χ★; no marker rendered.
   * Computed once per graph at the parent level — see CausalDAG3D's
   * chiStarInfo useMemo.
   */
  chiStarTier?: "bridge" | "top-bes" | null;
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
    default: return "#42466a";
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
  chiStarTier = null,
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
  // Power-scale weight to widen visible thickness range. Real weights
  // cluster 0.4–0.8 so the previous linear `0.5 + w * 1.5` mapping
  // produced 1.1–1.7 — basically uniform on screen. See the parallel
  // change in `CausalDAG2D.tsx` (EmphasizedEdge memo).
  const w = Math.max(0, Math.min(1, edge.weight));
  const lineWidth = 0.7 + Math.pow(w, 2.4) * 3.3;

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

  const { curvePoints, midpoint, curve, chiTrackTop, chiTrackBottom } = useMemo(() => {
    const src = new THREE.Vector3(...sourcePos);
    const tgt = new THREE.Vector3(...targetPos);
    const mid = new THREE.Vector3().lerpVectors(src, tgt, 0.5);
    mid.add(curveOffset);

    const c = new THREE.QuadraticBezierCurve3(src, mid, tgt);
    const N = 32;
    const pts = c.getPoints(N);
    const midPt = c.getPoint(0.5);

    // χ★ parallel-track offsets. For each point on the curve, compute
    // the tangent there, cross with world-up to get a "side" vector
    // perpendicular to the curve in the horizontal plane, then offset
    // by ±CHI_TRACK_OFFSET along it. The result is two parallel
    // 3D curves running alongside the main one — visible as
    // train-tracks from the standard top-down camera angle. Fallback
    // when the tangent is parallel to up (rare; vertical edges):
    // use world-X as the reference perpendicular.
    const CHI_TRACK_OFFSET = 0.85;
    const worldUp = new THREE.Vector3(0, 1, 0);
    const worldX = new THREE.Vector3(1, 0, 0);
    const top: [number, number, number][] = [];
    const bottom: [number, number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = pts[i];
      const tangent = c.getTangent(t);
      // side = tangent × up, normalised. If tangent is parallel to up
      // (cross is ~zero), use tangent × worldX as fallback.
      const side = new THREE.Vector3().crossVectors(tangent, worldUp);
      if (side.lengthSq() < 1e-6) {
        side.crossVectors(tangent, worldX);
      }
      side.normalize().multiplyScalar(CHI_TRACK_OFFSET);
      top.push([p.x + side.x, p.y + side.y, p.z + side.z]);
      bottom.push([p.x - side.x, p.y - side.y, p.z - side.z]);
    }

    return {
      curvePoints: pts.map(p => [p.x, p.y, p.z] as [number, number, number]),
      midpoint: midPt,
      curve: c,
      chiTrackTop: top,
      chiTrackBottom: bottom,
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

  // Animate particle along curve for temporal/causal edges.
  // Reads from the pre-cached curvePoints array (allocated once per
  // posKey change) instead of re-evaluating the bezier each frame —
  // saves ~one Vector3 allocation + a sqrt per animating edge per
  // frame. With ~100 animating edges at 60fps that's ~6k fewer
  // allocations/sec and noticeably less GC pressure during replay.
  useFrame((_, delta) => {
    if (!particleRef.current || !shouldAnimate) return;
    particleT.current = (particleT.current + delta * animSpeed) % 1;
    const samples = curvePoints.length;
    const i = Math.min(samples - 1, Math.floor(particleT.current * samples));
    const [x, y, z] = curvePoints[i];
    particleRef.current.position.set(x, y, z);
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
        {/* Invisible hitbox — raycast cost scales with triangle count,
            so keep the tessellation low. 4×4 segments = 8 triangles
            vs 8×8 = 64 with no visual difference (it's transparent). */}
        <sphereGeometry args={[scissorsMode || ablationMode ? 3.5 : 2, 4, 4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* χ★ parallel tracks — TWO thin violet lines running alongside
          the main edge, offset perpendicular to the curve tangent by
          CHI_TRACK_OFFSET world-units (see chiTrackTop / chiTrackBottom
          in the curve memo above). The cyan/amber main line stays
          untouched in the middle — this is "train-track" outlining,
          not a halo. Solid for strict bridges, dashed for top-BES.
          Skipped on severed / ablated edges (their own markers take
          priority). */}
      {chiStarTier && !isSevered && !isAblated && (
        <>
          <Line
            points={chiTrackTop}
            color="#7B68EE"
            lineWidth={1.5}
            transparent
            opacity={0.85}
            dashed={chiStarTier === "top-bes"}
            dashSize={chiStarTier === "top-bes" ? 0.4 : undefined}
            gapSize={chiStarTier === "top-bes" ? 0.35 : undefined}
          />
          <Line
            points={chiTrackBottom}
            color="#7B68EE"
            lineWidth={1.5}
            transparent
            opacity={0.85}
            dashed={chiStarTier === "top-bes"}
            dashSize={chiStarTier === "top-bes" ? 0.4 : undefined}
            gapSize={chiStarTier === "top-bes" ? 0.35 : undefined}
          />
        </>
      )}

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
          {/* 6×6 segments = 36 triangles, indistinguishable from 8×8
              (64 tri) at this radius (0.25). Saves vertex work
              proportional to active orb count. */}
          <sphereGeometry args={[0.25, 6, 6]} />
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

/**
 * Custom equality check for the React.memo wrap below. Same problem as in
 * DAGNode3D — sourcePos / targetPos rebuild fresh `[x, y, z]` tuples each
 * parent render, epochState is sometimes a fresh object literal, and the
 * onClick / onScissorsClick / onAblationClick closures are inline. That
 * defeated default shallow equality and re-rendered all ~323 edges on
 * every selection change, costing frame budget that the per-frame
 * particle animations needed.
 *
 * Compares value props by content and ignores callback identity (closures
 * are pure functions of stable bound `edge.id` + store actions).
 */
function arePropsEqual(prev: DAGEdge3DProps, next: DAGEdge3DProps) {
  if (prev.edge !== next.edge) return false;
  if (
    prev.sourcePos[0] !== next.sourcePos[0] ||
    prev.sourcePos[1] !== next.sourcePos[1] ||
    prev.sourcePos[2] !== next.sourcePos[2]
  ) return false;
  if (
    prev.targetPos[0] !== next.targetPos[0] ||
    prev.targetPos[1] !== next.targetPos[1] ||
    prev.targetPos[2] !== next.targetPos[2]
  ) return false;
  if (prev.isHighlighted !== next.isHighlighted) return false;
  if (prev.isDimmed !== next.isDimmed) return false;
  if (prev.isVerifiedInconsistent !== next.isVerifiedInconsistent) return false;
  if (prev.isCrossDomain !== next.isCrossDomain) return false;
  if (prev.isConnectedToSelected !== next.isConnectedToSelected) return false;
  if (prev.anyNodeSelected !== next.anyNodeSelected) return false;
  if (prev.isSevered !== next.isSevered) return false;
  if (prev.isConsequenceEdge !== next.isConsequenceEdge) return false;
  if (prev.scissorsMode !== next.scissorsMode) return false;
  if (prev.isAblated !== next.isAblated) return false;
  if (prev.ablationMode !== next.ablationMode) return false;
  if (prev.chiStarTier !== next.chiStarTier) return false;
  // epochState — only `propagationSignal` is read (drives shouldAnimate).
  const pe = prev.epochState;
  const ne = next.epochState;
  if (pe !== ne) {
    if (!pe || !ne) return false;
    if (pe.propagationSignal !== ne.propagationSignal) return false;
  }
  // Intentionally not comparing onScissorsClick / onAblationClick / onEdgeClick.
  return true;
}

const DAGEdge3D = React.memo(DAGEdge3DInner, arePropsEqual);
export default DAGEdge3D;
