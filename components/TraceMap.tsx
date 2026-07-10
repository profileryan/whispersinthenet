"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { getTraceMapMarkerPoint } from "@/components/traceMapPlacement";
import { getTraceMapStyle } from "@/lib/mapStyle";
import { prefersReducedMotion, staggerDelays } from "@/lib/motion";
import { formatTraceDate, getTraceTheme, isTraceFaded, SINGAPORE_CENTER, type Trace } from "@/lib/traces";

type Props = {
  traces: Trace[];
  selectedTrace: Trace | null;
  now: Date;
  replyCountByTraceId?: globalThis.Map<string, number>;
  onSelectTrace: (trace: Trace) => void;
  onClearSelection: () => void;
  onTraceFocusComplete?: (trace: Trace) => void;
};

export function TraceMap({ traces, selectedTrace, now, replyCountByTraceId, onSelectTrace, onClearSelection, onTraceFocusComplete }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const markerElementsRef = useRef<globalThis.Map<string, HTMLButtonElement>>(new globalThis.Map());
  const clearRef = useRef(onClearSelection);
  const selectRef = useRef(onSelectTrace);
  const selectedTraceRef = useRef(selectedTrace);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    clearRef.current = onClearSelection;
    selectRef.current = onSelectTrace;
  }, [onClearSelection, onSelectTrace]);

  useEffect(() => {
    selectedTraceRef.current = selectedTrace;
  }, [selectedTrace]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    try {
      mapRef.current = new maplibregl.Map({
        container: containerRef.current,
        style: getTraceMapStyle("browse"),
        center: [SINGAPORE_CENTER.longitude, SINGAPORE_CENTER.latitude],
        zoom: 10.5,
        pitch: 0,
      });
    } catch {
      setMapUnavailable(true);
      return;
    }

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    const handleMapClick = () => clearRef.current();
    mapRef.current.on("click", handleMapClick);

    return () => {
      mapRef.current?.off("click", handleMapClick);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) {
      return;
    }

    map.resize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    markerElementsRef.current.clear();

    const sortedTraces = [...traces].sort(
      (left, right) => Number(isTraceFaded(left, now)) - Number(isTraceFaded(right, now)),
    );
    const reducedMotion = prefersReducedMotion();
    const emergenceDelays = reducedMotion ? staggerDelays(sortedTraces.length, 0, 0) : staggerDelays(sortedTraces.length, 45, 900);

    sortedTraces.forEach((trace, index) => {
      const faded = isTraceFaded(trace, now);
      const theme = getTraceTheme(trace.theme);
      const replyCount = replyCountByTraceId?.get(trace.id) ?? 0;
      const isSelected = selectedTraceRef.current?.id === trace.id;
      const element = createMarkerElement(trace, isSelected, faded, replyCount);
      element.className = `map-trace-marker ${isSelected ? "is-selected" : ""} ${faded ? "is-faded" : ""} ${reducedMotion ? "" : "is-emerging"}`;
      if (!reducedMotion) {
        element.style.animationDelay = `${emergenceDelays[index]}ms`;
      }
      element.dataset.replyCount = String(replyCount);
      element.dataset.theme = trace.theme;
      element.setAttribute(
        "aria-label",
        faded
          ? `Faded ${theme.label} trace from ${formatTraceDate(trace.createdAt)}`
          : replyCount
            ? `Listen to ${theme.label} trace by ${trace.displayName} with ${replyCount} response${replyCount === 1 ? "" : "s"}`
            : `Listen to ${theme.label} trace by ${trace.displayName}`,
      );
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRef.current(trace);
      });

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([trace.longitude, trace.latitude])
        .addTo(map);

      markersRef.current.push(marker);
      markerElementsRef.current.set(trace.id, element);
    });
  }, [now, replyCountByTraceId, traces]);

  useEffect(() => {
    markerElementsRef.current.forEach((element, traceId) => {
      const selected = selectedTrace?.id === traceId;
      element.classList.toggle("is-selected", selected);
      element.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }, [selectedTrace?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedTrace) {
      return;
    }

    const focusDuration = focusTraceMarker(map, selectedTrace, prefersReducedMotion());
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
          focusTraceMarker(activeMap, selectedTraceRef.current, prefersReducedMotion());
        }
      });
    }

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [selectedTrace]);

  return (
    <div ref={containerRef} className="trace-map" aria-label="Interactive city map">
      {mapUnavailable ? <p className="map-unavailable-note">Map view is unavailable in this browser.</p> : null}
    </div>
  );
}

function focusTraceMarker(map: Map, trace: Trace, reducedMotion = false) {
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
  const focusDuration = reducedMotion ? 0 : Math.hypot(xDelta, yDelta) > 6 ? 620 : 140;

  map.easeTo({
    center: map.unproject([centerPoint.x + xDelta, centerPoint.y + yDelta]),
    duration: focusDuration,
    easing: (time) => 1 - Math.pow(1 - time, 3),
    essential: true,
  });

  return focusDuration;
}

function createMarkerElement(trace: Trace, selected: boolean, faded: boolean, replyCount: number) {
  const theme = getTraceTheme(trace.theme);
  const element = document.createElement("button");
  element.type = "button";
  element.style.setProperty("--trace-color", faded ? "#9b9b9b" : theme.color);
  element.style.setProperty("--thread-scale", String(getThreadOrbScale(replyCount)));
  element.setAttribute("aria-pressed", selected ? "true" : "false");
  element.innerHTML = `
    <span class="trace-map-orb" aria-hidden="true"></span>
  `;
  return element;
}

function getThreadOrbScale(replyCount: number) {
  if (replyCount <= 0) {
    return 1;
  }

  return Math.min(1.42, 1 + Math.log2(replyCount + 1) * 0.13);
}
