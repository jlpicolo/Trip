import { NetworkError } from "@/lib/sync/remote";
import { guessCategory, type PlaceCategory } from "@/lib/places";

/**
 * Recherche de lieux via Nominatim (OpenStreetMap) — service externe, en ligne uniquement.
 * Politique d'usage : 1 requête/seconde maximum, pas d'autocomplétion (recherche à la
 * validation), attribution OSM affichée. Les adresses japonaises y sont parfois mal
 * couvertes : la saisie manuelle des coordonnées reste toujours possible.
 */
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;
let last = 0;

export interface GeocodeResult {
  name: string;
  address: string;
  city: string | null;
  lat: number;
  lng: number;
  category: PlaceCategory;
  sourceRef: string;
}

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category: string;
  type: string;
  address?: Record<string, string>;
}

export function toResult(item: NominatimItem): GeocodeResult {
  const a = item.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
  const name = item.name?.trim() || item.display_name.split(",")[0].trim();
  const address = item.display_name.startsWith(name) ? item.display_name.slice(name.length).replace(/^,\s*/, "") : item.display_name;
  return {
    name,
    address,
    city,
    lat: Number(item.lat),
    lng: Number(item.lon),
    category: guessCategory(item.category, item.type),
    sourceRef: `osm:${item.osm_type}/${item.osm_id}`,
  };
}

export async function searchPlaces(query: string, opts: { countryCodes?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "8", "accept-language": "fr,en" });
  if (opts.countryCodes) params.set("countrycodes", opts.countryCodes);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${ENDPOINT}?${params}`, { signal: opts.signal, headers: { Accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new NetworkError("Recherche de lieux : réseau indisponible", e);
  }
  if (res.status === 429) throw new Error("Trop de recherches rapprochées : patientez quelques secondes.");
  if (!res.ok) throw new Error(`Recherche de lieux indisponible (erreur ${res.status}).`);
  return ((await res.json()) as NominatimItem[]).map(toResult);
}
