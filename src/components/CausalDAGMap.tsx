"use client";

import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { Map as MapGL, Source, Layer, Popup, type MapRef } from "@vis.gl/react-maplibre";
import type { MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FeatureCollection, Point, LineString, Feature } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
import { getNodeCoordinates } from "@/lib/geo-coordinates";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";
import DAGOverlay from "@/components/dag3d/DAGOverlay";

// Category → color (fallback when domain color isn't available)
const CATEGORY_COLORS: Record<string, string> = {
  manufacturing: "#ffab00",
  infrastructure: "#00e5ff",
  economic: "#76ff03",
  finance: "#ff6d00",
  energy: "#00e676",
  geopolitical: "#ff1744",
  communications: "#7c4dff",
  agriculture: "#64dd17",
  science: "#00b0ff",
};

export default function CausalDAGMap() {
  const mapRef = useRef<MapRef>(null);
  const {
    graphData,
    selectedNode,
    setSelectedNode,
    selectedNodes,
    setSelectedNodes,
    isolateSelection,
    isLive,
  } = useApexStore();
  const { graph: temporalGraph } = useTemporalGraph();
  const activeGraph = isLive ? graphData : temporalGraph;

  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    label: string;
    domain: string;
    omega: number;
    lng: number;
    lat: number;
  } | null>(null);

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

  // Build GeoJSON for edges
  const edgeGeoJSON = useMemo<FeatureCollection<LineString>>(() => {
    const nodeMap = new Map<string, [number, number]>();
    activeGraph.nodes.forEach((node) => {
      nodeMap.set(
        node.id,
        getNodeCoordinates(node.id, node.globalConcentration ?? "", node.domain),
      );
    });

    const selectedSet = new Set(selectedNodes);
    const features: Feature<LineString>[] = [];

    activeGraph.edges.forEach((edge) => {
      if (edge.isSevered) return;
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;

      const isDimmed =
        isolateSelection &&
        selectedSet.size > 0 &&
        !(selectedSet.has(edge.source) && selectedSet.has(edge.target));

      // Curved line via midpoint offset
      const midLng = (source[0] + target[0]) / 2;
      const midLat = (source[1] + target[1]) / 2;
      const dx = target[0] - source[0];
      const dy = target[1] - source[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curveAmount = Math.min(dist * 0.15, 3);
      const perpLng = midLng + (-dy / dist) * curveAmount;
      const perpLat = midLat + (dx / dist) * curveAmount;

      // Edge color — matches 2D/3D exactly:
      //   directed  → cyan (#00e5ff)
      //   temporal  → amber (#ffab00)
      //   confounded → orange (#ff6d00)
      //   inconsistent → red (#ff1744)
      const edgeColor = edge.isInconsistent
        ? "#ff1744"
        : edge.type === "temporal"
          ? "#ffab00"
          : edge.type === "confounded"
            ? "#ff6d00"
            : "#00e5ff";

      const isDashed = edge.type === "temporal" || edge.type === "confounded" || edge.isInconsistent;

      // Create a 3-point line (source → curve midpoint → target)
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [source, [perpLng, perpLat], target],
        },
        properties: {
          id: edge.id,
          weight: edge.weight,
          type: edge.type,
          opacity: isDimmed ? 0.05 : 0.5,
          color: edgeColor,
          width: edge.weight * 2 + 0.5,
          isDashed: isDashed ? 1 : 0,
        },
      });
    });

    return { type: "FeatureCollection", features };
  }, [activeGraph.nodes, activeGraph.edges, selectedNodes, isolateSelection]);

  // Split edges into solid and dashed for separate MapLibre layers
  const solidEdgeGeoJSON = useMemo<FeatureCollection<LineString>>(() => ({
    type: "FeatureCollection",
    features: edgeGeoJSON.features.filter(f => !f.properties?.isDashed),
  }), [edgeGeoJSON]);

  const dashedEdgeGeoJSON = useMemo<FeatureCollection<LineString>>(() => ({
    type: "FeatureCollection",
    features: edgeGeoJSON.features.filter(f => f.properties?.isDashed),
  }), [edgeGeoJSON]);

  // Click handler
  const onNodeClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) {
        setSelectedNode(null);
        return;
      }
      const nodeId = feature.properties?.id;
      if (nodeId) {
        if (e.originalEvent.shiftKey) {
          // Multi-select
          setSelectedNodes(
            selectedNodes.includes(nodeId)
              ? selectedNodes.filter((id) => id !== nodeId)
              : [...selectedNodes, nodeId],
          );
        } else {
          setSelectedNode(selectedNode === nodeId ? null : nodeId);
        }
      }
    },
    [selectedNode, selectedNodes, setSelectedNode, setSelectedNodes],
  );

  // Hover handler
  const onNodeHover = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && feature.properties) {
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
  }, []);

  const onNodeLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

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
    <div className="w-full h-full relative">
      <MapGL
        ref={mapRef}
        initialViewState={{
          longitude: 45,
          latitude: 25,
          zoom: 3,
        }}
        mapStyle={mapStyle}
        interactiveLayerIds={["node-circles"]}
        onClick={onNodeClick}
        onMouseMove={onNodeHover}
        onMouseLeave={onNodeLeave}
        cursor={hoveredNode ? "pointer" : "grab"}
        attributionControl={false}
      >
        {/* Solid edge lines (directed = cyan solid) */}
        <Source id="edges-solid" type="geojson" data={solidEdgeGeoJSON}>
          <Layer
            id="edge-lines-solid"
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

        {/* Dashed edge lines (temporal = amber dashed, confounded = orange dashed) */}
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

      {/* DAG Overlay (same controls as 2D/3D) */}
      <DAGOverlay />

      {/* Map-specific attribution */}
      <div className="absolute bottom-1 left-1 text-[7px] font-mono text-text-muted/30 pointer-events-none">
        MAP VIEW — GEOGRAPHIC PROJECTION
      </div>
    </div>
  );
}
