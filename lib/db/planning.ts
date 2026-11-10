import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { dayId } from "@/lib/ids";
import { chronologicalIndex, compareActivities, keyAtIndex } from "@/lib/planning";
import type { Activity, Place, TripDay } from "@/lib/types/planning";
import type { ActivityPatch, PlaceFields } from "@/lib/validation/activity";
import type { RowData } from "@/lib/types/sync";

const PLACE_CATEGORY: Record<string, string> = {
  visit: "monument", restaurant: "restaurant", hotel: "hotel", shopping: "shop", transport: "station", activity: "activity",
};

export async function activitiesOfTrip(db: LocalDb, tripId: string): Promise<Activity[]> {
  const rows = (await db.data("activities").where("trip_id").equals(tripId).toArray()) as Activity[];
  return rows.filter((a) => !a.deleted_at);
}

export async function daysOfTrip(db: LocalDb, tripId: string): Promise<Map<string, TripDay>> {
  const rows = (await db.data("trip_days").where("trip_id").equals(tripId).toArray()) as TripDay[];
  return new Map(rows.filter((d) => !d.deleted_at).map((d) => [d.date, d]));
}

export async function placesOfTrip(db: LocalDb, tripId: string): Promise<Map<string, Place>> {
  const rows = (await db.data("places").where("trip_id").equals(tripId).toArray()) as Place[];
  return new Map(rows.filter((p) => !p.deleted_at).map((p) => [p.id, p]));
}

async function dayList(db: LocalDb, tripId: string, date: string | null, excludeId?: string): Promise<Activity[]> {
  return (await activitiesOfTrip(db, tripId))
    .filter((a) => a.date === date && a.id !== excludeId)
    .sort(compareActivities);
}

/**
 * Renumérote une journée (rare : écart entre deux clés épuisé). Seules les lignes
 * dont la clé change sont réécrites.
 */
async function renumber(engine: SyncEngine, list: Activity[]): Promise<Activity[]> {
  const out: Activity[] = [];
  for (const [i, a] of list.entries()) {
    const key = (i + 1) * 1024;
    if (a.sort_key !== key) await engine.update("activities", a.id, { sort_key: key });
    out.push({ ...a, sort_key: key });
  }
  return out;
}

async function keyFor(engine: SyncEngine, list: Activity[], index: number): Promise<number> {
  const key = keyAtIndex(list, index);
  if (key !== null) return key;
  return keyAtIndex(await renumber(engine, list), index)!;
}

/** Clé d'ordre pour placer une activité dans une journée : chronologique si horodatée, sinon en fin. */
export async function placementKeyFor(engine: SyncEngine, db: LocalDb, tripId: string, date: string | null, startTime: string | null, excludeId?: string) {
  const list = await dayList(db, tripId, date, excludeId);
  const index = startTime ? chronologicalIndex(list, startTime) : list.length;
  return keyFor(engine, list, index);
}

export async function saveActivity(
  engine: SyncEngine,
  db: LocalDb,
  tripId: string,
  input: { activity: ActivityPatch; place: PlaceFields | null },
  existing?: Activity,
): Promise<string> {
  const patch: RowData = { ...input.activity };

  if (input.place) {
    const placeData = { name: input.activity.title, address: input.place.address, lat: input.place.lat, lng: input.place.lng };
    if (existing?.place_id) {
      await engine.update("places", existing.place_id, placeData);
      patch.place_id = existing.place_id;
    } else {
      patch.place_id = await engine.insert("places", {
        ...placeData, trip_id: tripId, category: PLACE_CATEGORY[input.activity.category] ?? "other",
      });
    }
  } else if (existing?.place_id) {
    // Le lieu reste dans la carte (il peut servir ailleurs) ; seule l'association est retirée.
    patch.place_id = null;
  }

  const moved = !existing || existing.date !== input.activity.date || existing.start_time !== input.activity.start_time;
  if (moved && (!existing || existing.date !== input.activity.date || input.activity.start_time)) {
    patch.sort_key = await placementKeyFor(engine, db, tripId, input.activity.date, input.activity.start_time, existing?.id);
  }

  if (existing) {
    await engine.update("activities", existing.id, patch);
    return existing.id;
  }
  return engine.insert("activities", { ...patch, trip_id: tripId, is_done: false });
}

/** Glisser-déposer dans une journée : nouvel index dans la liste affichée. */
export async function reorderActivity(engine: SyncEngine, db: LocalDb, tripId: string, activity: Activity, newIndex: number) {
  const list = await dayList(db, tripId, activity.date, activity.id);
  await engine.update("activities", activity.id, { sort_key: await keyFor(engine, list, newIndex) });
}

/** Déplacement vers une autre journée (ou vers les idées si date = null). */
export async function moveActivity(engine: SyncEngine, db: LocalDb, tripId: string, activity: Activity, date: string | null) {
  if (activity.date === date) return;
  const startTime = date ? activity.start_time : null;
  await engine.update("activities", activity.id, {
    date,
    start_time: startTime,
    end_time: date ? activity.end_time : null,
    sort_key: await placementKeyFor(engine, db, tripId, date, startTime, activity.id),
  });
}

export const setActivityDone = (engine: SyncEngine, activity: Activity, done: boolean) =>
  engine.update("activities", activity.id, { is_done: done });

export const deleteActivity = (engine: SyncEngine, activity: Activity) => engine.remove("activities", activity.id);

/** Notes d'une journée : identifiant déterministe, fusion sans doublon entre appareils. */
export async function saveDay(engine: SyncEngine, db: LocalDb, tripId: string, date: string, patch: Partial<Pick<TripDay, "title" | "city" | "notes" | "is_free">>) {
  const id = dayId(tripId, date);
  const existing = (await db.data("trip_days").get(id)) as TripDay | undefined;
  if (existing && !existing.deleted_at) await engine.update("trip_days", id, patch);
  else await engine.insert("trip_days", { id, trip_id: tripId, date, ...patch });
}
