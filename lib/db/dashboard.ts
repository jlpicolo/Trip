import type { LocalDb } from "./schema";
import type { SyncedRow } from "@/lib/types/sync";
import type { ActivityLogEntry } from "@/lib/types/trip";

const alive = (r: SyncedRow) => !r.deleted_at;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Prochain élément daté à partir d'aujourd'hui (date + heure facultative). */
async function next(db: LocalDb, table: "activities", dateCol: string, timeCol: string,
  tripId: string, today: string) {
  const rows = (await db.data(table).where("trip_id").equals(tripId).toArray()).filter(alive);
  return rows
    .filter((r) => str(r[dateCol]) >= today)
    .sort((a, b) => `${str(a[dateCol])}${str(a[timeCol]) || "99"}`.localeCompare(`${str(b[dateCol])}${str(b[timeCol]) || "99"}`))[0] ?? null;
}

export const nextActivity = (db: LocalDb, tripId: string, today: string) => next(db, "activities", "date", "start_time", tripId, today);

export async function recentActivity(db: LocalDb, tripId: string, limit = 8): Promise<ActivityLogEntry[]> {
  const rows = await db.activity_log.where("trip_id").equals(tripId).toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, limit);
}
