"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { ICON_PATHS } from "@/components/ui/Icon";
import { placeMeta } from "@/lib/places";
import { clusterPoints } from "@/lib/map-cluster";
import type { Place } from "@/lib/types/planning";

export type MapStatus = "loading" | "ready" | "tiles-unavailable" | "unsupported";



const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;
const JAPAN = { center: [137.2, 36.0] as [number, number], zoom: 4.6 };

function markerElement(place: Place): HTMLButtonElement {
  const meta = placeMeta(place.category);
  const el = document.createElement("button");
  el.type = "button";
  el.className = "jt-marker";
  el.dataset.placeId = place.id;
  el.setAttribute("aria-label", `${place.name} (${meta.label})${place.is_favorite ? ", favori" : ""}`);
  el.style.setProperty("--marker-color", meta.color);
  el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[meta.icon]}"/></svg>${place.is_favorite ? '<span class="jt-marker-fav" aria-hidden="true">♥</span>' : ""}`;
  return el;
}

export interface TripMapProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
  movingId: string | null;
  onMoved: (lat: number, lng: number) => void;
  preview: { lat: number; lng: number } | null;
  onStatus: (s: MapStatus) => void;
}

/**
 * Carte MapLibre (tuiles OpenFreeMap / OpenStreetMap). Les marqueurs sont des boutons
 * HTML : accessibles au clavier et aux lecteurs d'écran, indépendants du rendu WebGL.
 */
export function TripMap(props: TripMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const previewMarker = useRef<Marker | null>(null);
  const clusterMarkers = useRef<Marker[]>([]);
  const [viewTick, setViewTick] = useState(0);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const latest = useRef(props);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    latest.current = props;
  });

  // Création unique de la carte (bibliothèque chargée à la demande : uniquement côté navigateur).
  useEffect(() => {
    let cancelled = false;
    let tileErrors = 0;
    const markerSet = markers.current;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      lib.current = maplibre;
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      let m: MlMap;
      try {
        m = new maplibre.Map({
          container: container.current,
          style: STYLE[theme],
          center: JAPAN.center,
          zoom: JAPAN.zoom,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
      } catch {
        latest.current.onStatus("unsupported");
        return;
      }
      map.current = m;
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        if (cancelled) return;
        // Mention OpenStreetMap obligatoire, mais repliée (bouton « i ») pour ne pas masquer la carte.
        container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        setReady(true);
        latest.current.onStatus("ready");
      });
      m.on("moveend", () => setViewTick((t) => t + 1));
      m.on("error", (e) => {
        const err = e as { sourceId?: string; error?: { message?: string } };
        // Style ou tuiles injoignables (hors ligne) : on le dit, la liste des lieux reste utilisable.
        if (!m.isStyleLoaded() || err.sourceId || /fetch|network|Failed/i.test(err.error?.message ?? "")) {
          if (++tileErrors >= 1) latest.current.onStatus("tiles-unavailable");
        }
      });
      m.on("click", (e) => {
        if (latest.current.picking) latest.current.onPick(e.lngLat.lat, e.lngLat.lng);
      });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markerSet.clear();
      clusterMarkers.current = [];
    };
  }, []);

  // Marqueurs : ajout, mise à jour, suppression selon les lieux affichés.
  useEffect(() => {
    const m = map.current;
    const maplibre = lib.current;
    if (!m || !maplibre || !ready) return;
    const keep = new Set<string>();
    for (const p of props.places) {
      if (p.lat == null || p.lng == null) continue;
      keep.add(p.id);
      const existing = markers.current.get(p.id);
      const signature = `${p.name}|${p.category}|${p.is_favorite}`;
      if (existing && existing.getElement().dataset.signature === signature) {
        if (props.movingId !== p.id) existing.setLngLat([p.lng, p.lat]);
        continue;
      }
      existing?.remove();
      const el = markerElement(p);
      el.dataset.signature = signature;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        latest.current.onSelect(p.id);
      });
      const marker = new maplibre.Marker({ element: el, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(m);
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        latest.current.onMoved(ll.lat, ll.lng);
      });
      markers.current.set(p.id, marker);
    }
    for (const [id, marker] of markers.current) {
      if (!keep.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    for (const [id, marker] of markers.current) {
      marker.getElement().classList.toggle("is-selected", id === props.selectedId);
      marker.setDraggable(id === props.movingId);
      marker.getElement().classList.toggle("is-moving", id === props.movingId);
    }
    if (!fitted.current && keep.size > 0) {
      fitted.current = true;
      const bounds = new maplibre.LngLatBounds();
      for (const p of props.places) if (p.lat != null && p.lng != null) bounds.extend([p.lng, p.lat]);
      // Marges : la recherche et les filtres flottent en haut, les boutons d'ajout en bas.
      m.fitBounds(bounds, { padding: { top: 150, bottom: 110, left: 50, right: 60 }, maxZoom: 14, duration: 0 });
    }

    // Regroupement des marqueurs trop proches à ce niveau de zoom.
    for (const c of clusterMarkers.current) c.remove();
    clusterMarkers.current = [];
    const pts = props.places
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ id: p.id, lng: p.lng!, lat: p.lat!, ...m.project([p.lng!, p.lat!]) }));
    const alone = new Set([props.selectedId, props.movingId].filter(Boolean) as string[]);
    for (const group of clusterPoints(pts, alone)) {
      const single = group.length === 1;
      for (const p of group) markers.current.get(p.id)?.getElement().classList.toggle("is-clustered", !single);
      if (single) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "jt-marker jt-cluster";
      el.textContent = String(group.length);
      el.setAttribute("aria-label", `${group.length} lieux regroupés, zoomer pour les voir`);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const b = new maplibre.LngLatBounds();
        for (const p of group) b.extend([p.lng, p.lat]);
        m.fitBounds(b, { padding: 90, maxZoom: Math.min(18, m.getZoom() + 4), duration: 500 });
      });
      const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
      const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
      clusterMarkers.current.push(new maplibre.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(m));
    }
  }, [props.places, props.selectedId, props.movingId, ready, viewTick]);

  // Centrer sur le lieu sélectionné.
  useEffect(() => {
    const m = map.current;
    const p = props.places.find((x) => x.id === props.selectedId);
    if (m && ready && p?.lat != null && p.lng != null) m.easeTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 13), duration: 600 });
  }, [props.selectedId, props.places, ready]);

  // Aperçu d'un résultat de recherche (marqueur temporaire).
  useEffect(() => {
    const m = map.current;
    const maplibre = lib.current;
    previewMarker.current?.remove();
    previewMarker.current = null;
    if (!m || !maplibre || !ready || !props.preview) return;
    const el = document.createElement("div");
    el.className = "jt-marker jt-marker-preview";
    el.setAttribute("aria-hidden", "true");
    previewMarker.current = new maplibre.Marker({ element: el }).setLngLat([props.preview.lng, props.preview.lat]).addTo(m);
    m.easeTo({ center: [props.preview.lng, props.preview.lat], zoom: 15, duration: 600 });
  }, [props.preview, ready]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = props.picking ? "crosshair" : "";
  }, [props.picking]);

  return <div ref={container} className="size-full" role="region" aria-label="Carte des lieux du voyage" />;
}
