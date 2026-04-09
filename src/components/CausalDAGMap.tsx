"use client";

import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { Map as MapGL, Source, Layer, Popup, type MapRef } from "@vis.gl/react-maplibre";
import type { MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FeatureCollection, Point, LineString, Feature } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
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
      const domainColor = node.datasetColor || getDomainColor(node.domain);
      const isSelected = selectedNode === node.id || selectedSet.has(node.id);
      const isDimmed = isolateSelection && selectedSet.size > 0 && !selectedSet.has(node.id);
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
          opacity: isDimmed ? 0.15 : 1,
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
  //   inconsistent → red (#ff1744) — dashed
  //   severed → red (#ff1744) — dashed, reduced opacity
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

      // Isolation: hide edges that don't connect two selected nodes (matches 3D behavior)
      if (
        isolateSelection &&
        selectedSet.size > 0 &&
        !(selectedSet.has(edge.source) && selectedSet.has(edge.target))
      ) return;

      // Curved line via midpoint offset
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

      // Edge color — matches 3D exactly
      const isSevered = edge.isSevered ?? false;
      const edgeColor = isSevered
        ? "#ff1744"
        : edge.isInconsistent
          ? "#ff1744"
          : edge.type === "temporal"
            ? "#ffab00"
            : edge.type === "confounded"
              ? "#ff6d00"
              : "#00e5ff";

      // Dashed: confounded, inconsistent, or severed (matches 3D isDashed logic)
      const isDashed = edge.type === "confounded" || edge.isInconsistent || isSevered;

      const opacity = isSevered ? 0.25 : 0.5;

      const feature: Feature<LineString> = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [source, [perpLng, perpLat], target],
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
  // so particles follow the exact same curves as the rendered lines
  const temporalEdgePaths = useMemo(() => {
    return solidEdgeGeoJSON.features
      .filter((f) => f.properties?.type === "temporal" && (f.properties?.opacity ?? 1) > 0.1)
      .map((f) => ({
        id: f.properties!.id as string,
        points: f.geometry.coordinates as [number, number][],
      }));
  }, [solidEdgeGeoJSON]);

  // Animated particle GeoJSON — updated every frame via requestAnimationFrame
  const [particleGeoJSON, setParticleGeoJSON] = useState<FeatureCollection<Point>>({
    type: "FeatureCollection",
    features: [],
  });
  const particlePhases = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (temporalEdgePaths.length === 0) {
      setParticleGeoJSON({ type: "FeatureCollection", features: [] });
      return;
    }

    // Initialize random phases
    temporalEdgePaths.forEach(({ id }) => {
      if (!particlePhases.current.has(id)) {
        particlePhases.current.set(id, Math.random());
      }
    });

    let animFrameId: number;
    const animate = () => {
      const features: Feature<Point>[] = [];

      for (const edge of temporalEdgePaths) {
        let phase = particlePhases.current.get(edge.id) ?? 0;
        phase = (phase + 0.003) % 1;
        particlePhases.current.set(edge.id, phase);

        // 2 particles per edge, staggered
        for (let p = 0; p < 2; p++) {
          const t = (phase + p * 0.5) % 1;
          const oneMinusT = 1 - t;
          // Quadratic bezier in geographic coordinates
          const lng =
            oneMinusT * oneMinusT * edge.points[0][0] +
            2 * oneMinusT * t * edge.points[1][0] +
            t * t * edge.points[2][0];
          const lat =
            oneMinusT * oneMinusT * edge.points[0][1] +
            2 * oneMinusT * t * edge.points[1][1] +
            t * t * edge.points[2][1];

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
    return () => cancelAnimationFrame(animFrameId);
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

  // Fit bounds to data on first load
  useEffect(() => {
    if (!mapRef.current || nodeGeoJSON.features.length === 0) return;
    const coords = nodeGeoJSON.features.map(
      (f) => f.geometry.coordinates as [number, number],
    );
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
      { duration: 1000, padding: 60 },
    );
  }, [nodeGeoJSON.features.length]);

  // Dark map style matching the app theme
  const mapStyle = useMemo(
    () => ({
      version: 8 as const,
      name: "Apex Dark",
      sources: {
        "osm-tiles": {
          type: "raster" as const,
          tiles: [
            "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
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
