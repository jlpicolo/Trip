import type { LocalDb } from "./schema";
import { SYNC_TABLES, type SyncTable } from "@/lib/types/sync";

/** Colonnes internes de la base locale (fusion, état) : jamais exportées. */
const strip = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")));

/**
 * Sauvegarde complète du voyage telle que présente sur l'appareil (données synchronisées et
 * modifications en attente). Les dépenses personnelles des autres voyageurs sont exclues ; les
 * fichiers (PDF, images) ne sont pas inclus, seulement leurs fiches.
 */
export async function exportTrip(db: LocalDb, tripId: string, userId: string, profiles: { id: string; display_name: string }[]) {
  const trip = await db.data("trips").get(tripId);
  if (!trip) throw new Error("Voyage introuvable sur cet appareil.");
  const tables: Partial<Record<SyncTable, Record<string, unknown>[]>> = {};
  for (const t of SYNC_TABLES) {
    if (t === "trips") continue;
    let rows = (await db.data(t).where("trip_id").equals(tripId).toArray()).filter((r) => !r.deleted_at);
    if (t === "personal_expenses") rows = rows.filter((r) => r.owner_id === userId);
    tables[t] = rows.map(strip);
  }
  return {
    format: "japan-trip-export",
    version: 1,
    exported_at: new Date().toISOString(),
    pending_changes: await db.outbox.count(),
    travelers: profiles.map((p) => ({ id: p.id, name: p.display_name })),
    trip: strip(trip),
    ...tables,
  };
}
