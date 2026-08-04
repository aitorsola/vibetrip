"use client";

import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface ActivityMiniMapProps {
  lat: number;
  lon: number;
  color: string;
  name: string;
}

/// Compact non-interactive map preview embedded in the activity detail
/// modal. Mirrors the styling of `MapView.client.tsx` but locks zoom and
/// pan — the user has the "Cómo llegar" button to jump into a real map
/// app when they need to interact.
export default function ActivityMiniMap({
  lat,
  lon,
  color,
  name,
}: ActivityMiniMapProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={[lat, lon]}
        zoom={15}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
        style={{ height: 180, width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={[lat, lon]}
          radius={11}
          pathOptions={{
            color: "#fff",
            weight: 2.5,
            fillColor: color,
            fillOpacity: 0.95,
          }}
        >
          <title>{name}</title>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
