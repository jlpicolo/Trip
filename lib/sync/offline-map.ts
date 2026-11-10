import type { LocalDb } from "@/lib/db/schema";
import { MAP_STYLES, mapCacheKey, tilesForBbox, type Bbox } from "@/lib/map-tiles";

/** Même nom que dans le service worker (public/sw.js) : c'est lui qui sert ces fichiers hors ligne. */
export const MAP_CACHE = "jt-map";
const MAX_ZOOM = 15;
// Plages de glyphes latins : les kanji et kana sont dessinés avec les polices du téléphone (MapLibre).
const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];

export interface OfflineMapRecord {
  city: string;
  downloadedAt: string;
  files: number;
  failed: number;
  bytes: number;
  keys: string[];
}

export const offlineMapKey = (tripId: string, city: string) => `offlineMap:${tripId}:${city}`;

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fond de carte indisponible (${res.status})`);
  return res.json();
}

/** Liste des fichiers nécessaires pour afficher l'emprise dans les deux thèmes, sans réseau. */
export async function mapFilesFor(bbox: Bbox): Promise<string[]> {
  const urls = new Set<string>();
  for (const styleUrl of Object.values(MAP_STYLES)) {
    urls.add(styleUrl);
    const style = await fetchJson(styleUrl);
    if (typeof style.sprite === "string") {
      for (const suffix of [".json", ".png", "@2x.json", "@2x.png"]) urls.add(`${style.sprite}${suffix}`);
    }
    const fonts = new Set<string>();
    for (const layer of style.layers ?? []) {
      const f = layer.layout?.["text-font"];
      if (Array.isArray(f) && f.every((x: unknown) => typeof x === "string")) fonts.add(f.join(","));
    }
    if (typeof style.glyphs === "string") {
      for (const stack of fonts) for (const range of GLYPH_RANGES) {
        urls.add(style.glyphs.replace("{fontstack}", stack).replace("{range}", range));
      }
    }
    for (const source of Object.values(style.sources ?? {}) as { url?: string; tiles?: string[]; maxzoom?: number }[]) {
      let templates = source.tiles ?? [];
      let maxzoom = source.maxzoom ?? MAX_ZOOM;
      if (source.url) {
        urls.add(source.url);
        const tilejson = await fetchJson(source.url);
        templates = tilejson.tiles ?? [];
        maxzoom = tilejson.maxzoom ?? maxzoom;
      }
      const tpl = templates[0];
      if (!tpl) continue;
      for (const t of tilesForBbox(bbox, 0, Math.min(MAX_ZOOM, maxzoom))) {
        urls.add(tpl.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y)));
      }
    }
  }
  return [...urls];
}

/**
 * Télécharge le fond de carte d'une ville dans le cache lu par le service worker. Les fichiers
 * déjà présents ne sont pas retéléchargés. Les échecs sont comptés et signalés, jamais masqués.
 */
export async function downloadCityMap(db: LocalDb, tripId: string, city: string, bbox: Bbox,
  onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<OfflineMapRecord> {
  const cache = await caches.open(MAP_CACHE);
  const urls = await mapFilesFor(bbox);
  let done = 0;
  let failed = 0;
  let bytes = 0;
  const keys: string[] = [];
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      if (signal?.aborted) return;
      const key = mapCacheKey(url);
      try {
        let res = await cache.match(key);
        if (!res) {
          const fresh = await fetch(url);
          if (!fresh.ok && fresh.status !== 204) throw new Error(String(fresh.status));
          await cache.put(key, fresh.clone());
          res = fresh;
        }
        bytes += (await res.clone().blob()).size;
        keys.push(key);
      } catch {
        failed++;
      }
      onProgress?.(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (signal?.aborted) throw new DOMException("Téléchargement annulé", "AbortError");
  const record: OfflineMapRecord = { city, downloadedAt: new Date().toISOString(), files: keys.length, failed, bytes, keys };
  await db.setMeta(offlineMapKey(tripId, city), record);
  return record;
}

/** Retire une ville ; les fichiers partagés avec une autre ville téléchargée sont conservés. */
export async function deleteCityMap(db: LocalDb, tripId: string, city: string): Promise<void> {
  const record = await db.getMeta<OfflineMapRecord>(offlineMapKey(tripId, city));
  if (!record) return;
  const others = (await db.meta.where("key").startsWith("offlineMap:").toArray())
    .filter((m) => m.key !== offlineMapKey(tripId, city))
    .flatMap((m) => (m.value as OfflineMapRecord).keys);
  const keep = new Set(others);
  const cache = await caches.open(MAP_CACHE);
  await Promise.all(record.keys.filter((k) => !keep.has(k)).map((k) => cache.delete(k)));
  await db.meta.delete(offlineMapKey(tripId, city));
}
