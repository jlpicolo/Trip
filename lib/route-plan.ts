import { compareActivities } from "@/lib/planning";
import { cityArea } from "@/lib/japan";
import { coversNight } from "@/lib/stays";
import type { Activity, Place } from "@/lib/types/planning";
import type { Accommodation } from "@/lib/types/stays";
import type { Transport } from "@/lib/types/tickets";

/**
 * Couleurs des journées sur la carte : fixes (posées sur le fond de carte, quel que soit le thème),
 * assez distinctes entre jours consécutifs.
 */
export const DAY_COLORS = ["#ff5d5d", "#2f9bff", "#f5b400", "#19b88a", "#c45cff", "#ff8a2a", "#00b5c8", "#e64f9a", "#7a8cff", "#8bbf2a"];
export const dayColor = (index: number) => DAY_COLORS[index % DAY_COLORS.length];

export interface Point {
  lat: number;
  lng: number;
}

export interface Stop extends Point {
  key: string;
  kind: "hotel" | "activity";
  title: string;
  placeId: string | null;
  activityId: string | null;
  time: string | null;
}

export interface Leg {
  from: Stop;
  to: Stop;
  /** Distance à vol d'oiseau (mètres) : jamais présentée comme la distance réelle du trajet. */
  distance: number;
}

export interface CityHop {
  transport: Transport;
  from: Point | null;
  to: Point | null;
}

export interface DayRoute {
  date: string;
  index: number;
  color: string;
  stops: Stop[];
  legs: Leg[];
  /** Activités du jour sans position (non tracées). */
  unplaced: Activity[];
  hops: CityHop[];
}

export function distanceMeters(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Au-delà de cette distance à vol d'oiseau, on propose les transports en commun plutôt que la marche. */
export const TRANSIT_THRESHOLD_M = 1500;

const previousDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const hotelStop = (s: Accommodation, places: Map<string, Place>, key: string): Stop | null => {
  const p = s.place_id ? places.get(s.place_id) : undefined;
  return p?.lat != null && p.lng != null
    ? { key, kind: "hotel", title: s.name, placeId: p.id, activityId: null, time: null, lat: p.lat, lng: p.lng }
    : null;
};

/** Point d'une ville (zone connue) d'après un libellé de gare ou de ville (« Gare de Kyoto » → Kyoto). */
function cityPoint(label: string | null): Point | null {
  if (!label) return null;
  for (const word of label.split(/[\s,()·/-]+/)) {
    const a = cityArea(word);
    if (a) return { lat: a.lat, lng: a.lng };
  }
  return null;
}

/**
 * Parcours de chaque journée, dans l'ordre du planning (seule source de l'ordre) : départ de l'hôtel où
 * l'on a dormi, activités localisées, retour à l'hôtel du soir. Les trajets entre villes (Billets) sont
 * ajoutés à part, entre les centres des villes reconnues.
 */
export function buildDayRoutes(input: {
  dates: string[];
  activities: Activity[];
  places: Map<string, Place>;
  stays: Accommodation[];
  transports: Transport[];
}): DayRoute[] {
  return input.dates.map((date, index) => {
    const acts = input.activities.filter((a) => a.date === date && !a.deleted_at).sort(compareActivities);
    const stops: Stop[] = [];
    const unplaced: Activity[] = [];
    const morning = input.stays.find((s) => coversNight(s, previousDay(date)));
    const evening = input.stays.find((s) => coversNight(s, date));
    const start = morning ? hotelStop(morning, input.places, `${date}-matin`) : null;
    if (start) stops.push(start);
    for (const a of acts) {
      const p = a.place_id ? input.places.get(a.place_id) : undefined;
      if (p?.lat == null || p.lng == null) {
        unplaced.push(a);
        continue;
      }
      // Hôtel déjà point de départ : ne pas le répéter s'il est aussi une activité.
      if (stops.length && stops[stops.length - 1].placeId === p.id) continue;
      stops.push({ key: a.id, kind: "activity", title: a.title, placeId: p.id, activityId: a.id, time: a.start_time?.slice(0, 5) ?? null, lat: p.lat, lng: p.lng });
    }
    const end = evening ? hotelStop(evening, input.places, `${date}-soir`) : null;
    if (end && stops.length && stops[stops.length - 1].placeId !== end.placeId) stops.push(end);
    else if (end && !stops.length) stops.push(end);
    const legs: Leg[] = [];
    for (let i = 1; i < stops.length; i++) legs.push({ from: stops[i - 1], to: stops[i], distance: distanceMeters(stops[i - 1], stops[i]) });
    const hops = input.transports
      .filter((t) => t.departure_date === date && !t.deleted_at)
      .map((t) => ({ transport: t, from: cityPoint(t.departure_name), to: cityPoint(t.arrival_name) }));
    return { date, index, color: dayColor(index), stops, legs, unplaced, hops };
  });
}

/** Distance lisible, toujours qualifiée de « vol d'oiseau » par l'appelant. */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

const coord = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Un trajet en transports en commun dans Google Maps : lignes, horaires et durées réels. */
export function transitUrl(from: Point, to: Point): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${coord(from)}&destination=${coord(to)}&travelmode=transit`;
}

/**
 * La journée entière dans Google Maps (étapes intermédiaires limitées à 9 par Google). Google ne
 * gère pas les étapes en mode transports : la journée s'ouvre à pied, chaque tronçon long a son lien.
 */
export function dayUrl(stops: Point[]): string | null {
  if (stops.length < 2) return null;
  const mid = stops.slice(1, -1).slice(0, 9);
  const waypoints = mid.length ? `&waypoints=${mid.map(coord).join("%7C")}` : "";
  return `https://www.google.com/maps/dir/?api=1&origin=${coord(stops[0])}&destination=${coord(stops[stops.length - 1])}${waypoints}&travelmode=walking`;
}
