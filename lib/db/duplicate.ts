import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { dayId, newId } from "@/lib/ids";
import { daysBetween } from "@/lib/formatters";
import type { Trip } from "@/lib/types/trip";
import type { RowData } from "@/lib/types/sync";

const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const SERVER = ["version", "created_by", "updated_by", "created_at", "updated_at", "deleted_at", "txid", "nights"];
const clean = (row: Record<string, unknown>): RowData =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !SERVER.includes(k) && !k.startsWith("_"))) as RowData;

/**
 * Nouveau voyage dans le même groupe, préparé à partir d'un voyage existant : destinations, lieux,
 * carnet, planning (décalé à la nouvelle date de début) et notes des journées. Billets, hébergements
 * et dépenses ne sont pas repris : ils sont propres à chaque voyage.
 */
export async function duplicateTrip(engine: SyncEngine, db: LocalDb, source: Trip, input: { name: string; start_date: string }) {
  const offset = daysBetween(source.start_date, input.start_date);
  const tripId = await engine.insert("trips", {
    group_id: source.group_id, name: input.name, start_date: input.start_date, end_date: shiftDate(source.end_date, offset),
    timezone: source.timezone, base_currency: source.base_currency, secondary_currency: source.secondary_currency,
    locale: source.locale, destinations: source.destinations.map((d) => ({ id: newId(), name: d.name, name_local: d.name_local ?? null, lat: d.lat ?? null, lng: d.lng ?? null })),
    settings: { ...source.settings, manual_fx_rate: null },
  });
  const rows = async (t: "places" | "journal_entries" | "activities" | "trip_days") =>
    (await db.data(t).where("trip_id").equals(source.id).toArray()).filter((r) => !r.deleted_at) as unknown as Record<string, unknown>[];

  const placeIds = new Map<string, string>();
  for (const p of await rows("places")) {
    const id = newId();
    placeIds.set(p.id as string, id);
    await engine.insert("places", { ...clean(p), id, trip_id: tripId });
  }
  const remapPlace = (id: unknown) => (typeof id === "string" ? (placeIds.get(id) ?? null) : null);

  const entryIds = new Map<string, string>();
  for (const e of await rows("journal_entries")) {
    const id = newId();
    entryIds.set(e.id as string, id);
    await engine.insert("journal_entries", { ...clean(e), id, trip_id: tripId, place_id: remapPlace(e.place_id) });
  }
  for (const a of await rows("activities")) {
    await engine.insert("activities", {
      ...clean(a), id: newId(), trip_id: tripId, place_id: remapPlace(a.place_id), is_done: false,
      date: typeof a.date === "string" ? shiftDate(a.date, offset) : null,
      journal_entry_id: typeof a.journal_entry_id === "string" ? (entryIds.get(a.journal_entry_id) ?? null) : null,
    });
  }
  for (const d of await rows("trip_days")) {
    const date = shiftDate(d.date as string, offset);
    await engine.insert("trip_days", { ...clean(d), id: dayId(tripId, date), trip_id: tripId, date });
  }
  return tripId;
}
