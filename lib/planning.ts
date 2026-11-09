import type { IconName } from "@/components/ui/Icon";
import type { Activity, ActivityCategory, TravelMode } from "@/lib/types/planning";

export const CATEGORY_META: Record<ActivityCategory, { label: string; icon: IconName; color: string }> = {
  visit: { label: "Visite", icon: "torii", color: "var(--vermillion)" },
  restaurant: { label: "Restaurant", icon: "food", color: "#f08a4b" },
  transport: { label: "Transport", icon: "train", color: "var(--night)" },
  hotel: { label: "Hôtel", icon: "bed", color: "#b88cfa" },
  shopping: { label: "Shopping", icon: "bag", color: "var(--sakura)" },
  activity: { label: "Activité", icon: "star", color: "var(--warning)" },
  free_time: { label: "Temps libre", icon: "sun", color: "var(--success)" },
  idea: { label: "Idée / suggestion", icon: "bulb", color: "#4cc3d9" },
  other: { label: "Autre", icon: "more", color: "var(--text-dim)" },
};

export const categoryMeta = (c: string) => CATEGORY_META[c as ActivityCategory] ?? CATEGORY_META.other;

export const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  walk: "à pied", train: "en train", metro: "en métro", bus: "en bus", taxi: "en taxi", car: "en voiture", bike: "à vélo", other: "",
};

const STEP = 1024;
const MIN_GAP = 1e-6;

/**
 * Clé d'ordre entre deux voisines (ordre fractionnaire) : déplacer une activité ne
 * modifie qu'une seule ligne, ce qui limite les conflits entre voyageurs.
 * Renvoie null si l'écart est épuisé : il faut alors renuméroter la journée.
 */
export function sortKeyBetween(prev?: number | null, next?: number | null): number | null {
  if (prev == null && next == null) return STEP;
  if (prev == null) return next! - STEP;
  if (next == null) return prev + STEP;
  if (next - prev < MIN_GAP) return null;
  return (prev + next) / 2;
}

export function compareActivities(a: Activity, b: Activity): number {
  return a.sort_key - b.sort_key || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/**
 * Position chronologique d'une activité horodatée : juste avant la première
 * activité de la journée qui commence plus tard. Les activités sans horaire gardent leur place.
 */
export function chronologicalIndex(ordered: Activity[], startTime: string): number {
  const t = hm(startTime)!;
  const i = ordered.findIndex((a) => a.start_time && hm(a.start_time)! > t);
  return i === -1 ? ordered.length : i;
}

/** Clé pour insérer à l'index donné d'une liste déjà triée (sans l'élément déplacé). */
export function keyAtIndex(ordered: Activity[], index: number): number | null {
  return sortKeyBetween(ordered[index - 1]?.sort_key, ordered[index]?.sort_key);
}

export interface DayBuckets {
  byDate: Map<string, Activity[]>;
  ideas: Activity[];
  outside: Activity[];
}

/** Répartit les activités : par journée du voyage, idées sans date, dates hors période. */
export function bucketActivities(activities: Activity[], dates: string[]): DayBuckets {
  const byDate = new Map(dates.map((d) => [d, [] as Activity[]]));
  const ideas: Activity[] = [];
  const outside: Activity[] = [];
  for (const a of activities) {
    if (a.deleted_at) continue;
    if (!a.date) ideas.push(a);
    else (byDate.get(a.date) ?? outside).push(a);
  }
  for (const list of byDate.values()) list.sort(compareActivities);
  ideas.sort(compareActivities);
  outside.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || compareActivities(a, b));
  return { byDate, ideas, outside };
}

/** Liens externes : l'application ne calcule aucun itinéraire elle-même. */
export function mapsLinks(target: { lat?: number | null; lng?: number | null; address?: string | null; name?: string | null }) {
  const q = target.lat != null && target.lng != null ? `${target.lat},${target.lng}` : (target.address || target.name || "").trim();
  if (!q) return null;
  const e = encodeURIComponent(q);
  return {
    view: `https://www.google.com/maps/search/?api=1&query=${e}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${e}`,
    apple: `https://maps.apple.com/?q=${e}`,
  };
}
