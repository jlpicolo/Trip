export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/** Emprise géographique [ouest, sud, est, nord] en degrés. */
export type Bbox = [number, number, number, number];

const KM_PER_DEG_LAT = 110.574;

export function bboxAround(lat: number, lng: number, km: number): Bbox {
  const dLat = km / KM_PER_DEG_LAT;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

export function unionBbox(a: Bbox | null, b: Bbox | null): Bbox | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Emprise des points, élargie d'une marge (km) pour voir les abords. */
export function bboxOfPoints(points: { lat: number; lng: number }[], marginKm = 1): Bbox | null {
  if (points.length === 0) return null;
  let box: Bbox | null = null;
  for (const p of points) box = unionBbox(box, bboxAround(p.lat, p.lng, marginKm));
  return box;
}

export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const r = (clamped * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Tuiles couvrant l'emprise, du zoom min au zoom max inclus. */
export function tilesForBbox([w, s, e, n]: Bbox, minZ: number, maxZ: number): { z: number; x: number; y: number }[] {
  const out: { z: number; x: number; y: number }[] = [];
  for (let z = minZ; z <= maxZ; z++) {
    const a = lngLatToTile(w, n, z);
    const b = lngLatToTile(e, s, z);
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ z, x, y });
  }
  return out;
}

/** Même clé que le service worker : la version des tuiles OpenFreeMap change chaque semaine. */
export const mapCacheKey = (url: string) => url.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, "/planet/$1");
