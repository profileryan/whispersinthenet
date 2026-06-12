import type { LayerSpecification, RasterSourceSpecification, StyleSpecification } from "maplibre-gl";

type TraceMapTone = "browse" | "picker";
type RasterLayerSpecification = Extract<LayerSpecification, { type: "raster" }>;

const OSM_SOURCE: RasterSourceSpecification = {
  type: "raster",
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  tileSize: 256,
  attribution: "&copy; OpenStreetMap contributors",
};

const RASTER_PAINT_BY_TONE: Record<TraceMapTone, RasterLayerSpecification["paint"]> = {
  browse: {
    "raster-opacity": 0.62,
    "raster-saturation": -0.9,
    "raster-contrast": -0.24,
    "raster-brightness-min": 0.18,
    "raster-brightness-max": 0.96,
  },
  picker: {
    "raster-opacity": 0.78,
    "raster-saturation": -0.72,
    "raster-contrast": -0.12,
    "raster-brightness-min": 0.1,
    "raster-brightness-max": 0.98,
  },
};

export function getTraceMapStyle(tone: TraceMapTone): string | StyleSpecification {
  return (
    process.env.NEXT_PUBLIC_MAP_STYLE_URL || {
      version: 8,
      sources: {
        osm: OSM_SOURCE,
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
          paint: RASTER_PAINT_BY_TONE[tone],
        },
      ],
    }
  );
}
