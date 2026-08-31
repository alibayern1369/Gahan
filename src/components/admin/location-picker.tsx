"use client";

import { useEffect, useRef } from "react";
import type { Circle, Map as LeafletMap, Marker } from "leaflet";

export interface LocationValue {
  latitude: number;
  longitude: number;
  radiusM: number;
}

interface LocationPickerProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current).setView([value.latitude, value.longitude], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([value.latitude, value.longitude], { draggable: true }).addTo(map);
      const circle = L.circle([value.latitude, value.longitude], {
        radius: value.radiusM,
        color: "#6c63f1",
        fillColor: "#6c63f1",
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);

      const emit = (lat: number, lng: number) => {
        onChangeRef.current({ latitude: lat, longitude: lng, radiusM: circle.getRadius() });
      };

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        emit(pos.lat, pos.lng);
      });

      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        emit(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const circle = circleRef.current;
    const map = mapRef.current;
    if (!marker || !circle || !map) return;

    const latLng = { lat: value.latitude, lng: value.longitude };
    marker.setLatLng(latLng);
    circle.setLatLng(latLng);
    circle.setRadius(value.radiusM);
  }, [value.latitude, value.longitude, value.radiusM]);

  return (
    <div
      ref={containerRef}
      className="z-0 h-72 w-full overflow-hidden rounded-2xl border border-[color:var(--border-line)]"
      role="application"
      aria-label="انتخاب موقعیت روی نقشه"
    />
  );
}
