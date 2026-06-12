"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { getTraceMapMarkerPoint } from "@/components/traceMapPlacement";
import { getTraceMapStyle } from "@/lib/mapStyle";
import { formatTraceDate, getTraceTheme, isTraceFaded, SINGAPORE_CENTER, type Trace } from "@/lib/traces";

type Props = {
  traces: Trace[];
  selectedTrace: Trace | null;
  now: Date;
  onSelectTrace: (trace: Trace) => void;
  onClearSelection: () => void;
  onTraceFocusComplete?: (trace: Trace) => void;
};

export function TraceMap({ traces, selectedTrace, now, onSelectTrace, onClearSelection, onTraceFocusComplete }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const clearRef = useRef(onClearSelection);
  const selectedTraceRef = useRef(selectedTrace);

  useEffect(() => {
    clearRef.current = onClearSelection;
  }, [onClearSelection]);

  useEffect(() => {
    selectedTraceRef.current = selectedTrace;
  }, [selectedTrace]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: getTraceMapStyle("browse"),
      center: [SINGAPORE_CENTER.longitude, SINGAPORE_CENTER.latitude],
      zoom: 11,
      pitch: 0,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    const handleMapClick = () => clearRef.current();
    mapRef.current.on("click", handleMapClick);

    navigator.geolocation?.getCurrentPosition(
      (position) => {
        if (selectedTraceRef.current) {
          return;
        }

        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
          duration: 1300,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );

    return () => {
      mapRef.current?.off("click", handleMapClick);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    [...traces]
      .sort((left, right) => Number(isTraceFaded(left, now)) - Number(isTraceFaded(right, now)))
      .forEach((trace) => {
        const faded = isTraceFaded(trace, now);
        const theme = getTraceTheme(trace.theme);
        const element = createMarkerElement(trace, selectedTrace?.id === trace.id, faded);
        element.className = `map-trace-marker ${selectedTrace?.id === trace.id ? "is-selected" : ""} ${faded ? "is-faded" : ""}`;
        element.setAttribute(
          "aria-label",
          faded ? `Faded ${theme.label} trace from ${formatTraceDate(trace.createdAt)}` : `Listen to ${theme.label} trace by ${trace.displayName}`,
        );
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectTrace(trace);
        });

        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([trace.longitude, trace.latitude])
          .addTo(map);

        markersRef.current.push(marker);
      });
  }, [now, onSelectTrace, selectedTrace?.id, traces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedTrace) {
      return;
    }

    const focusDuration = focusTraceMarker(map, selectedTrace);
    const revealTimer = window.setTimeout(() => {
      onTraceFocusComplete?.(selectedTrace);
    }, focusDuration + 90);

    return () => window.clearTimeout(revealTimer);
  }, [onTraceFocusComplete, selectedTrace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedTrace) {
      return;
    }
    const activeMap = map;

    function handleWindowResize() {
      activeMap.resize();
      window.requestAnimationFrame(() => {
        if (selectedTraceRef.current) {
          focusTraceMarker(activeMap, selectedTraceRef.current);
        }
      });
    }

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [selectedTrace]);

  return <div ref={containerRef} className="trace-map" aria-label="Interactive city map" />;
}

function focusTraceMarker(map: Map, trace: Trace) {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) {
    return 0;
  }

  const targetPoint = getTraceMapMarkerPoint(width, height);
  const currentPoint = map.project([trace.longitude, trace.latitude]);
  const centerPoint = map.project(map.getCenter());
  const xDelta = currentPoint.x - targetPoint.x;
  const yDelta = currentPoint.y - targetPoint.y;
  const focusDuration = Math.hypot(xDelta, yDelta) > 6 ? 620 : 140;

  map.easeTo({
    center: map.unproject([centerPoint.x + xDelta, centerPoint.y + yDelta]),
    duration: focusDuration,
    easing: (time) => 1 - Math.pow(1 - time, 3),
    essential: true,
  });

  return focusDuration;
}

function createMarkerElement(trace: Trace, selected: boolean, faded: boolean) {
  const theme = getTraceTheme(trace.theme);
  const element = document.createElement("button");
  element.type = "button";
  element.style.setProperty("--trace-color", faded ? "#9b9b9b" : theme.color);
  element.setAttribute("aria-pressed", selected ? "true" : "false");
  element.innerHTML = `
    <span class="trace-map-orb" aria-hidden="true"></span>
  `;
  return element;
}
