"use client";

import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { Map as MapGL, Source, Layer, Popup, type MapRef } from "@vis.gl/react-maplibre";
import type { MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FeatureCollection, Point, LineString, Feature } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
import { getDomainCardColor } from "@/lib/domains";
import { getNodeCoordinates } from "@/lib/geo-coordinates";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import DAGOverlay from "@/components/dag3d/DAGOverlay";
import EdgeInspector from "@/components/EdgeInspector";
import type { CausalEdge } from "@/lib/types";

// Error boundary to catch MapLibre crashes and recover gracefully
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn("[CausalDAGMap] Caught render error:", error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-background gap-3">
          <div className="text-[10px] font-mono text-accent-red">
            MAP RENDERER ERROR
          </div>
          <button
            className="text-[9px] font-mono px-3 py-1.5 rounded border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
            onClick={() => this.setState({ hasError: false })}
          >
            REINITIALIZE MAP
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function CausalDAGMapInner() {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    selectedNode,
    setSelectedNode,
    selectedNodes,
    setSelectedNodes,
    isolateSelection,
  } = useApexStore();
  // Use the same filtered graph as 2D and 3D views for consistent data
  const activeGraph = useFilteredGraph();

  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    label: string;
    domain: string;
    omega: number;
    lng: number;
    lat: number;
  } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CausalEdge | null>(null);

  // --- Shift+Drag box selection ---
  const [selectionRect, setSelectionRect] = useState<{
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);
  const shiftDragRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Pre-compute node screen coordinates for hit testing
  const nodeCoords = useMemo(() => {
    return activeGraph.nodes.map((node) => ({
      id: node.id,
      lngLat: getNodeCoordinates(node.id, node.globalConcentration ?? "", node.domain),
    }));
  }, [activeGraph.nodes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      shiftDragRef.current = true;
      dragStartRef.current = { x, y };
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y });
      // Disable map panning during box select
      mapRef.current?.getMap().dragPan.disable();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!shiftDragRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionRect((prev) =>
        prev ? { ...prev, x2: x, y2: y } : null,
      );
    };

    const onPointerUp = () => {
      if (!shiftDragRef.current) return;
      shiftDragRef.current = false;
      mapRef.current?.getMap().dragPan.enable();

      setSelectionRect((rect) => {
        if (!rect) return null;
        const minX = Math.min(rect.x1, rect.x2);
        const maxX = Math.max(rect.x1, rect.x2);
        const minY = Math.min(rect.y1, rect.y2);
        const maxY = Math.max(rect.y1, rect.y2);

        // Ignore tiny drags (< 5px)
        if (maxX - minX < 5 && maxY - minY < 5) return null;

        const map = mapRef.current?.getMap();
        if (!map) return null;

        const ids: string[] = [];
        for (const node of nodeCoords) {
          const projected = map.project(node.lngLat as [number, number]);
          if (
            projected.x >= minX && projected.x <= maxX &&
            projected.y >= minY && projected.y <= maxY
          ) {
            ids.push(node.id);
          }
        }
        if (ids.length > 0) {
          setSelectedNodes(ids);
        }
        return null;
      });
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
    };
  }, [nodeCoords, setSelectedNodes]);

  // Build GeoJSON for nodes
  const nodeGeoJSON = useMemo<FeatureCollection<Point>>(() => {
    const selectedSet = new Set(selectedNodes);
    const features = activeGraph.nodes.map((node) => {
      const [lng, lat] = getNodeCoordinates(
        node.id,
        node.globalConcentration ?? "",
        node.domain,
      );
      // Color priority: domain-card colour (panel ↔ canvas alignment) →
      // node.datasetColor → raw-domain palette. Same precedence as 2D / 3D.
      const domainColor =
        getDomainCardColor(node.domain) ??
        node.datasetColor ??
        getDomainColor(node.domain);
      const isSelected = selectedNode === node.id || selectedSet.has(node.id);
      // Two dim modes:
      //  - isolate ON  → opacity 0.15 (existing behaviour)
      //  - isolate OFF → opacity 0.35 (multi-select spotlight, matches 2D
      //    where multiSelected.length > 0 alone dims non-selected nodes)
      const isMultiSelectActive = selectedSet.size > 0;
      const isOutOfScope = isMultiSelectActive && !selectedSet.has(node.id);
      const isDimmed = isOutOfScope;
      const dimOpacity = isolateSelection ? 0.15 : 0.35;
      const omega = node.omegaFragility.composite;

      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
        properties: {
          id: node.id,
          label: node.label,
          shortLabel: node.shortLabel,
          domain: node.domain,
          category: node.category,
          omega,
          color: domainColor,
          isSelected,
          isDimmed,
          // Size based on omega score
          radius: Math.max(4, omega * 1.2),
          opacity: isDimmed ? dimOpacity : 1,
          strokeColor: isSelected ? "#00e5ff" : "rgba(255,255,255,0.3)",
          strokeWidth: isSelected ? 2.5 : 0.5,
        },
      };
    });
    return { type: "FeatureCollection", features };
  }, [activeGraph.nodes, selectedNode, selectedNodes, isolateSelection]);

  // Build GeoJSON for edges — split into solid and dashed to match 3D conventions:
  //   directed  → cyan (#00e5ff) — solid
  //   temporal  → amber (#ffab00) — solid + animated particle
  //   confounded → orange (#ff6d00) — dashed
  //   inconsistent → red (#ff1744) — dashed  (Tarski)
  //   severed → slate (#78909c) — dashed     (Pearl link-break)
  const { solidEdgeGeoJSON, dashedEdgeGeoJSON } = useMemo(() => {
    const nodeMap = new Map<string, [number, number]>();
    activeGraph.nodes.forEach((node) => {
      nodeMap.set(
        node.id,
        getNodeCoordinates(node.id, node.globalConcentration ?? "", node.domain),
      );
    });

    const selectedSet = new Set(selectedNodes);
    const solidFeatures: Feature<LineString>[] = [];
    const dashedFeatures: Feature<LineString>[] = [];

    activeGraph.edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;

      // Three modes for edges when a multi-selection is active:
      //  - isolate ON   → cull edges that don't connect two selected nodes
      //  - isolate OFF  → render but dim edges with no selected endpoint
      //                   (matches 2D's `multiInScope` spotlight)
      //  - no selection → render normally
      const inScope =
        selectedSet.size === 0 ||
        selectedSet.has(edge.source) ||
        selectedSet.has(edge.target);
      const fullScope =
        selectedSet.size === 0 ||
        (selectedSet.has(edge.source) && selectedSet.has(edge.target));
      if (isolateSelection && selectedSet.size > 0 && !fullScope) return;
      const edgeIsDimmed = !isolateSelection && selectedSet.size > 0 && !inScope;

      // Curved line via midpoint offset (MapLibre renders LineStrings as
      // straight segments between vertices, so we sample the quadratic
      // bezier into BEZIER_SAMPLES+1 points to approximate a smooth curve).
      const midLng = (source[0] + target[0]) / 2;
      const midLat = (source[1] + target[1]) / 2;
      const dx = target[0] - source[0];
      const dy = target[1] - source[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Guard against zero distance (same coordinates) to avoid NaN
      let perpLng = midLng;
      let perpLat = midLat;
      if (dist > 0.0001) {
        const curveAmount = Math.min(dist * 0.15, 3);
        perpLng = midLng + (-dy / dist) * curveAmount;
        perpLat = midLat + (dx / dist) * curveAmount;
      }

      // Sample the quadratic bezier (source, control, target) into a
      // dense polyline so the rendered line and the particle path
      // (which lerps along this same array) are visually identical.
      const BEZIER_SAMPLES = 24;
      const coordinates: [number, number][] = [];
      if (dist <= 0.0001) {
        coordinates.push(source, target);
      } else {
        for (let i = 0; i <= BEZIER_SAMPLES; i++) {
          const t = i / BEZIER_SAMPLES;
          const u = 1 - t;
          const lng = u * u * source[0] + 2 * u * t * perpLng + t * t * target[0];
          const lat = u * u * source[1] + 2 * u * t * perpLat + t * t * target[1];
          coordinates.push([lng, lat]);
        }
      }

      // Edge color — matches 3D exactly. Severed gets a distinct slate color
      // so Pearl link-breaks don't look like Tarski-inconsistent edges.
      const isSevered = edge.isSevered ?? false;
      const edgeColor = isSevered
        ? "#78909c"
        : edge.isInconsistent
          ? "#ff1744"
          : edge.type === "temporal"
            ? "#ffab00"
            : edge.type === "confounded"
              ? "#ff6d00"
              : "#00e5ff";

      // Dashed: confounded, inconsistent, or severed (matches 3D isDashed logic)
      const isDashed = edge.type === "confounded" || edge.isInconsistent || isSevered;

      const baseOpacity = isSevered ? 0.45 : 0.5;
      const opacity = edgeIsDimmed ? 0.08 : baseOpacity;

      const feature: Feature<LineString> = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {
          id: edge.id,
          weight: edge.weight,
          type: edge.type,
          opacity,
          color: edgeColor,
          width: edge.weight * 2 + 1.5,
        },
      };

      if (isDashed) {
        dashedFeatures.push(feature);
      } else {
        solidFeatures.push(feature);
      }
    });

    return {
      solidEdgeGeoJSON: { type: "FeatureCollection" as const, features: solidFeatures },
      dashedEdgeGeoJSON: { type: "FeatureCollection" as const, features: dashedFeatures },
    };
  }, [activeGraph.nodes, activeGraph.edges, selectedNodes, isolateSelection]);

  // Extract temporal edge paths directly from the solid edge GeoJSON features
  // so particles follow the exact same sampled bezier polyline as the
  // rendered line. Pre-compute cumulative arc length per vertex so we can
  // lerp by distance (not by raw vertex index, which would skew speed
  // through curvature) and so per-frame advance can be a constant in
  // degrees rather than a fixed phase fraction.
  const temporalEdgePaths = useMemo(() => {
    return solidEdgeGeoJSON.features
      .filter((f) => f.properties?.type === "temporal" && (f.properties?.opacity ?? 1) > 0.1)
      .map((f) => {
        const points = f.geometry.coordinates as [number, number][];
        const cumDist: number[] = [0];
        for (let i = 1; i < points.length; i++) {
          const dx = points[i][0] - points[i - 1][0];
          const dy = points[i][1] - points[i - 1][1];
          cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
        }
        return {
          id: f.properties!.id as string,
          points,
          cumDist,
          totalLen: cumDist[cumDist.length - 1] ?? 0,
        };
      });
  }, [solidEdgeGeoJSON]);

  // Animated particle GeoJSON — updated every frame via requestAnimationFrame
  const [particleGeoJSON, setParticleGeoJSON] = useState<FeatureCollection<Point>>({
    type: "FeatureCollection",
    features: [],
  });
  const particlePhases = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Initialize random phases for any new edges
    temporalEdgePaths.forEach(({ id }) => {
      if (!particlePhases.current.has(id)) {
        particlePhases.current.set(id, Math.random());
      }
    });

    // Constant geographic-degrees-per-frame so every orb moves at the same
    // visual speed across the map regardless of edge length. At zoom ~2,
    // 1° ≈ 12 px, so this is roughly 36 px/s at 60 fps.
    const SPEED_DEG_PER_FRAME = 0.05;

    let animFrameId: number | null = null;
    const animate = () => {
      // No temporal edges → emit one empty frame and stop the loop until
      // the next dependency change. Avoids a 60fps idle loop and keeps
      // setState inside the rAF callback (out of the effect body).
      if (temporalEdgePaths.length === 0) {
        setParticleGeoJSON({ type: "FeatureCollection", features: [] });
        animFrameId = null;
        return;
      }

      const features: Feature<Point>[] = [];

      for (const edge of temporalEdgePaths) {
        let phase = particlePhases.current.get(edge.id) ?? 0;
        // Per-edge dPhase is normalized so the absolute degrees-per-frame
        // stays constant; long edges advance their phase fraction more
        // slowly, short edges more quickly — net result: same px/s.
        const dPhase = edge.totalLen > 0 ? SPEED_DEG_PER_FRAME / edge.totalLen : 0;
        phase = (phase + dPhase) % 1;
        particlePhases.current.set(edge.id, phase);

        // 2 particles per edge, staggered by half the edge length.
        for (let p = 0; p < 2; p++) {
          const t = (phase + p * 0.5) % 1;
          const targetDist = t * edge.totalLen;
          // Find the polyline segment containing targetDist. Linear scan
          // is fine for ~25 segments; binary search is overkill here.
          let i = 0;
          while (
            i < edge.cumDist.length - 2 &&
            edge.cumDist[i + 1] < targetDist
          ) {
            i++;
          }
          const segLen = edge.cumDist[i + 1] - edge.cumDist[i];
          const localT = segLen > 0 ? (targetDist - edge.cumDist[i]) / segLen : 0;
          const a = edge.points[i];
          const b = edge.points[i + 1];
          const lng = a[0] + (b[0] - a[0]) * localT;
          const lat = a[1] + (b[1] - a[1]) * localT;

          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: { id: `${edge.id}-p${p}` },
          });
        }
      }

      setParticleGeoJSON({ type: "FeatureCollection", features });
      animFrameId = requestAnimationFrame(animate);
    };

    animFrameId = requestAnimationFrame(animate);
    return () => {
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    };
  }, [temporalEdgePaths]);

  // Click handler — handles both node and edge clicks
  const onMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) {
        setSelectedNode(null);
        setSelectedEdge(null);
        return;
      }

      const layerId = feature.layer?.id;

      // Node click
      if (layerId === "node-circles") {
        e.preventDefault(); // prevent map zoom/fly
        const nodeId = feature.properties?.id;
        if (nodeId) {
          setSelectedEdge(null);
          if (e.originalEvent.shiftKey) {
            setSelectedNodes(
              selectedNodes.includes(nodeId)
                ? selectedNodes.filter((id: string) => id !== nodeId)
                : [...selectedNodes, nodeId],
            );
          } else {
            setSelectedNode(selectedNode === nodeId ? null : nodeId);
          }
        }
        return;
      }

      // Edge click
      if (layerId === "edge-lines" || layerId === "edge-lines-dashed") {
        e.preventDefault();
        const edgeId = feature.properties?.id;
        if (edgeId) {
          const edge = activeGraph.edges.find((ed) => ed.id === edgeId);
          if (edge) {
            setSelectedEdge(selectedEdge?.id === edge.id ? null : edge);
          }
        }
        return;
      }
    },
    [selectedNode, selectedNodes, setSelectedNode, setSelectedNodes, activeGraph.edges, selectedEdge],
  );

  const [hoveredFeature, setHoveredFeature] = useState(false);

  // Hover handler — show popup for node circles, track any interactive hover for cursor
  const onMapHover = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && feature.properties) {
      // Any interactive feature = pointer cursor
      setHoveredFeature(true);
      // Only show node popup for circles
      if (feature.layer?.id === "node-circles" && feature.geometry.type === "Point") {
        const coords = (feature.geometry as Point).coordinates;
        setHoveredNode({
          id: feature.properties.id,
          label: feature.properties.label,
          domain: feature.properties.domain,
          omega: feature.properties.omega,
          lng: coords[0],
          lat: coords[1],
        });
      } else {
        setHoveredNode(null);
      }
    } else {
      setHoveredFeature(false);
      setHoveredNode(null);
    }
  }, []);

  const onMapLeave = useCallback(() => {
    setHoveredFeature(false);
    setHoveredNode(null);
  }, []);

  // Escape key to close edge inspector
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEdge) setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedEdge]);

  // Resolve labels for edge inspector
  const selectedEdgeSourceLabel = selectedEdge
    ? activeGraph.nodes.find((n) => n.id === selectedEdge.source)?.label ?? selectedEdge.source
    : "";
  const selectedEdgeTargetLabel = selectedEdge
    ? activeGraph.nodes.find((n) => n.id === selectedEdge.target)?.label ?? selectedEdge.target
    : "";

  // Nodes the map should currently frame. When isolating with a selection,
  // frame only the selected subset (matches 3D isolate semantics); otherwise
  // frame the full filtered graph.
  const nodesToFit = useMemo(() => {
    if (isolateSelection && selectedNodes.length > 0) {
      const sel = new Set(selectedNodes);
      return activeGraph.nodes.filter((n) => sel.has(n.id));
    }
    return activeGraph.nodes;
  }, [activeGraph.nodes, isolateSelection, selectedNodes]);

  // Stable key over the *set* of framed node ids. Re-fits when the set of
  // visible nodes changes, including count-preserving swaps (e.g. changing
  // which nodes are isolated) that the previous length-only check missed.
  const fitKey = useMemo(
    () => nodesToFit.map((n) => n.id).sort().join("|"),
    [nodesToFit],
  );

  const nodesToFitRef = useRef(nodesToFit);
  useEffect(() => {
    nodesToFitRef.current = nodesToFit;
  }, [nodesToFit]);

  useEffect(() => {
    const nodes = nodesToFitRef.current;
    if (!mapRef.current || nodes.length === 0) return;
    const coords = nodes.map((n) =>
      getNodeCoordinates(n.id, n.globalConcentration ?? "", n.domain),
    );

    if (coords.length === 1) {
      mapRef.current.flyTo({ center: coords[0], zoom: 6, duration: 800 });
      return;
    }

    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    mapRef.current.fitBounds(
      [
        [minLng - 5, minLat - 5],
        [maxLng + 5, maxLat + 5],
      ],
      { duration: 800, padding: 60 },
    );
  }, [fitKey]);

  // Dark map style matching the app theme.
  //   - `projection: { type: "globe" }` renders the world as a 3D
  //     sphere at low zoom, smoothly transitioning to mercator as the
  //     user zooms in. Gives the "dimension map" / globe look the user
  //     asked for and stops the basemap reading as a flat sheet.
  //   - `dark_nolabels` strips street labels / city names so the
  //     basemap doesn't compete with the causal graph.
  //   - Tile maxzoom is back at 19 so the user can drill down to
  //     street level when they need it (the previous cap at 6 was
  //     correct for the "less busy" complaint but conflicted with the
  //     "we need street-level when the analysis demands it" follow-up).
  //     At low zoom the globe projection naturally hides street
  //     density, so the busy-ness only appears when the user
  //     deliberately zooms in.
  const mapStyle = useMemo(
    () => ({
      version: 8 as const,
      name: "Apex Dark",
      projection: { type: "globe" as const },
      sources: {
        "osm-tiles": {
          type: "raster" as const,
          tiles: [
            "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        },
      },
      layers: [
        {
          id: "osm-tiles-layer",
          type: "raster" as const,
          source: "osm-tiles",
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    }),
    [],
  );

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <MapGL
        ref={mapRef}
        initialViewState={{
          longitude: 45,
          latitude: 25,
          zoom: 3,
        }}
        mapStyle={mapStyle}
        interactiveLayerIds={["node-circles", "edge-lines", "edge-lines-dashed"]}
        onClick={onMapClick}
        onMouseMove={onMapHover}
        onMouseLeave={onMapLeave}
        cursor={hoveredFeature ? "pointer" : "grab"}
        doubleClickZoom={false}
        boxZoom={false}
        attributionControl={false}
      >
        {/* Solid edge lines: directed (cyan) + temporal (amber) */}
        <Source id="edges-solid" type="geojson" data={solidEdgeGeoJSON}>
          <Layer
            id="edge-lines"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-opacity": ["get", "opacity"],
              "line-width": ["get", "width"],
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </Source>

        {/* Dashed edge lines: confounded (orange), inconsistent (red), severed (red) */}
        <Source id="edges-dashed" type="geojson" data={dashedEdgeGeoJSON}>
          <Layer
            id="edge-lines-dashed"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-opacity": ["get", "opacity"],
              "line-width": ["get", "width"],
              "line-dasharray": [4, 3],
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </Source>

        {/* Node glow (larger circle behind) */}
        <Source id="nodes-glow" type="geojson" data={nodeGeoJSON}>
          <Layer
            id="node-glow"
            type="circle"
            paint={{
              "circle-radius": ["+", ["get", "radius"], 4],
              "circle-color": ["get", "color"],
              "circle-opacity": ["*", ["get", "opacity"], 0.15],
              "circle-blur": 1,
            }}
          />
        </Source>

        {/* Node circles */}
        <Source id="nodes" type="geojson" data={nodeGeoJSON}>
          <Layer
            id="node-circles"
            type="circle"
            paint={{
              "circle-radius": ["get", "radius"],
              "circle-color": ["get", "color"],
              "circle-opacity": ["get", "opacity"],
              "circle-stroke-color": ["get", "strokeColor"],
              "circle-stroke-width": ["get", "strokeWidth"],
            }}
          />
        </Source>

        {/* Labels (visible at higher zoom) */}
        <Source id="node-labels" type="geojson" data={nodeGeoJSON}>
          <Layer
            id="node-label-text"
            type="symbol"
            minzoom={4}
            layout={{
              "text-field": ["get", "shortLabel"],
              "text-size": 9,
              "text-offset": [0, 1.5],
              "text-anchor": "top",
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-allow-overlap": false,
            }}
            paint={{
              "text-color": "#b0b4c0",
              "text-opacity": ["get", "opacity"],
              "text-halo-color": "rgba(10, 12, 20, 0.9)",
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        {/* Animated particles flowing along temporal edges — native MapLibre rendering */}
        <Source id="particles" type="geojson" data={particleGeoJSON}>
          <Layer
            id="particle-glow"
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": "#ffab00",
              "circle-opacity": 0.25,
              "circle-blur": 1,
            }}
          />
          <Layer
            id="particle-dots"
            type="circle"
            paint={{
              "circle-radius": 3,
              "circle-color": "#ffab00",
              "circle-opacity": 0.9,
            }}
          />
        </Source>

        {/* Hover popup */}
        {hoveredNode && (
          <Popup
            longitude={hoveredNode.lng}
            latitude={hoveredNode.lat}
            offset={15}
            closeButton={false}
            closeOnClick={false}
            className="map-node-popup"
          >
            <div
              style={{
                background: "rgba(13, 15, 25, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "4px",
                padding: "6px 10px",
                fontFamily: "var(--font-mono, monospace)",
                minWidth: "140px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#e0e2e8",
                  marginBottom: "2px",
                }}
              >
                {hoveredNode.label}
              </div>
              <div
                style={{
                  fontSize: "8px",
                  color: getDomainColor(hoveredNode.domain),
                  marginBottom: "4px",
                  letterSpacing: "0.05em",
                }}
              >
                {hoveredNode.domain.toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color:
                    hoveredNode.omega > 9
                      ? "#ff1744"
                      : hoveredNode.omega >= 7
                        ? "#ffab00"
                        : "#00e676",
                }}
              >
                {"\u03A9"}F {hoveredNode.omega.toFixed(1)}
              </div>
            </div>
          </Popup>
        )}
      </MapGL>

      {/* Shift+Drag selection rectangle */}
      {selectionRect && (
        <div
          style={{
            position: "absolute",
            left: Math.min(selectionRect.x1, selectionRect.x2),
            top: Math.min(selectionRect.y1, selectionRect.y2),
            width: Math.abs(selectionRect.x2 - selectionRect.x1),
            height: Math.abs(selectionRect.y2 - selectionRect.y1),
            border: "1px solid rgba(0, 229, 255, 0.6)",
            backgroundColor: "rgba(0, 229, 255, 0.08)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      )}

      {/* DAG Overlay (same controls as 2D/3D) */}
      <DAGOverlay />

      {/* Edge Inspector popup */}
      <AnimatePresence>
        {selectedEdge && (
          <EdgeInspector
            key={selectedEdge.id}
            edge={selectedEdge}
            sourceLabel={selectedEdgeSourceLabel}
            targetLabel={selectedEdgeTargetLabel}
            onClose={() => setSelectedEdge(null)}
          />
        )}
      </AnimatePresence>

      {/* Map-specific attribution */}
      <div className="absolute bottom-1 left-1 text-[7px] font-mono text-text-muted/30 pointer-events-none">
        MAP VIEW — GEOGRAPHIC PROJECTION
      </div>
    </div>
  );
}

export default function CausalDAGMap() {
  return (
    <MapErrorBoundary>
      <CausalDAGMapInner />
    </MapErrorBoundary>
  );
}
