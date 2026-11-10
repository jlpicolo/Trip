import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { placementKeyFor } from "./planning";
import type { Activity, Place } from "@/lib/types/planning";
import type { PlacePatch } from "@/lib/validation/place";

export async function savePlace(engine: SyncEngine, tripId: string, patch: PlacePatch & { source?: string; source_ref?: string | null }, existing?: Place) {
  if (existing) {
    await engine.update("places", existing.id, patch);
    return existing.id;
  }
  return engine.insert("places", { ...patch, trip_id: tripId, source: patch.source ?? "manual", source_ref: patch.source_ref ?? null });
}

export const movePlace = (engine: SyncEngine, place: Place, lat: number, lng: number) =>
  engine.update("places", place.id, { lat, lng });

export const setPlaceFavorite = (engine: SyncEngine, place: Place, favorite: boolean) =>
  engine.update("places", place.id, { is_favorite: favorite });

export const deletePlace = (engine: SyncEngine, place: Place) => engine.remove("places", place.id);

/** Activités (non supprimées) liées à un lieu, par ordre chronologique. */
export async function activitiesForPlace(db: LocalDb, tripId: string, placeId: string): Promise<Activity[]> {
  const rows = (await db.data("activities").where("trip_id").equals(tripId).toArray()) as Activity[];
  return rows
    .filter((a) => !a.deleted_at && a.place_id === placeId)
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
}

const ACTIVITY_CATEGORY: Record<string, string> = {
  hotel: "hotel", restaurant: "restaurant", activity: "activity", monument: "visit", station: "transport", airport: "transport", shop: "shopping",
};

/** Ajoute le lieu au planning (journée, ou idée si date = null) sans ressaisie. */
export async function addPlaceToPlanning(engine: SyncEngine, db: LocalDb, tripId: string, place: Place, date: string | null) {
  return engine.insert("activities", {
    trip_id: tripId,
    title: place.name,
    category: date === null ? "idea" : (ACTIVITY_CATEGORY[place.category] ?? "other"),
    date,
    place_id: place.id,
    is_done: false,
    sort_key: await placementKeyFor(engine, db, tripId, date, null),
  });
}
