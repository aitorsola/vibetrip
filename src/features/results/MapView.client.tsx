"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Itinerary } from "@/domain/itinerary";
import { useTheme } from "@/ui/ThemeProvider";

// CARTO's basemaps ship a matched light/dark pair, which plain OSM tiles
// don't. Both are free for this usage and require the attribution below.
const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface MapViewProps {
  itinerary: Itinerary;
}

const DAY_COLORS = [
  "#FF385C", // rausch
  "#1E88E5", // blue
  "#00AC00", // green
  "#7C4DFF", // purple
  "#F6A700", // amber
  "#E91E63", // pink
  "#00B8D9", // teal
  "#5C6F7E", // slate
];

interface Point {
  lat: number;
  lon: number;
  dia: number;
  hora: string;
  nombre: string;
  bloque?: string;
  index: number; // order within the day
}

function FitToBounds({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lon], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export default function MapView({ itinerary }: MapViewProps) {
  const t = useTranslations("map");
  const { theme } = useTheme();
  const points = useMemo<Point[]>(() => {
    const out: Point[] = [];
    for (const day of itinerary.itinerario) {
      let i = 0;
      for (const a of day.actividades) {
        if (a.lat === undefined || a.lon === undefined) continue;
        out.push({
          lat: a.lat,
          lon: a.lon,
          dia: day.dia,
          hora: a.hora,
          nombre: a.nombre,
          bloque: a.bloque,
          index: i++,
        });
      }
    }
    // Jitter markers that share exact coordinates (e.g. the agent reused
    // the same place on multiple days, or two activities are in the same
    // building). Without this, the later marker covers the earlier one and
    // the user only sees one color even though the legend shows both days.
    const seen = new Map<string, number>();
    return out.map((p) => {
      const key = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count === 0) return p;
      // Spiral offset using a golden-angle distribution so overlapping
      // clusters spread evenly instead of in a line. ~110m per step keeps
      // markers clearly separated at typical city zoom levels.
      const step = 0.001;
      const angle = count * 2.39996;
      const latOffset = Math.cos(angle) * step * count;
      const lonOffset =
        (Math.sin(angle) * step * count) /
        Math.cos((p.lat * Math.PI) / 180);
      return { ...p, lat: p.lat + latOffset, lon: p.lon + lonOffset };
    });
  }, [itinerary]);

  const visibleDays = useMemo(() => {
    const set = new Set<number>();
    for (const p of points) set.add(p.dia);
    return [...set].sort((a, b) => a - b);
  }, [points]);

  const dayCount = itinerary.itinerario.length;
  const totalActivities = itinerary.itinerario.reduce(
    (s, d) => s + d.actividades.length,
    0,
  );
  const missing = totalActivities - points.length;

  if (points.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center">
        <p className="text-[14px] text-muted">{t("noPoints")}</p>
      </div>
    );
  }

  // Initial center: just average — FitToBounds will adjust right after.
  const center: [number, number] = [
    points.reduce((s, p) => s + p.lat, 0) / points.length,
    points.reduce((s, p) => s + p.lon, 0) / points.length,
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface">
        <MapContainer
          center={center}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: "min(70vh, 560px)", width: "100%" }}
        >
          {/* key forces a remount: react-leaflet won't swap the tile source
              of a live layer when only the url prop changes. */}
          <TileLayer
            key={theme}
            attribution={TILE_ATTRIBUTION}
            url={theme === "dark" ? TILES.dark : TILES.light}
          />
          <FitToBounds points={points} />
          {points.map((p) => {
            const color = DAY_COLORS[(p.dia - 1) % DAY_COLORS.length] ?? "#FF385C";
            return (
              <CircleMarker
                key={`${p.dia}-${p.index}-${p.lat}-${p.lon}`}
                center={[p.lat, p.lon]}
                radius={9}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.92,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="text-[12px]">
                    <div className="font-semibold text-fg">
                      D{p.dia} · {p.hora}
                    </div>
                    <div className="text-muted">{p.nombre}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {visibleDays.map((dia) => {
          const color = DAY_COLORS[(dia - 1) % DAY_COLORS.length] ?? "#FF385C";
          return (
            <span
              key={dia}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] font-semibold text-fg"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {t("dayLabel", { n: dia })}
            </span>
          );
        })}
      </div>

      <p className="text-[12px] text-subtle">
        {t("footer", {
          count: points.length,
          missing,
          multi: dayCount > 1 ? "true" : "false",
        })}
      </p>
    </div>
  );
}
