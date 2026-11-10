import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { activitiesOfTrip, placementKeyFor } from "./planning";
import { journalMeta, sortEntries } from "@/lib/journal";
import type { JournalEntry } from "@/lib/types/journal";
import type { Activity, Place } from "@/lib/types/planning";
import type { RowData } from "@/lib/types/sync";
import type { JournalPatch, JournalPlace } from "@/lib/validation/journal";

export async function entriesOfTrip(db: LocalDb, tripId: string): Promise<JournalEntry[]> {
  const rows = (await db.data("journal_entries").where("trip_id").equals(tripId).toArray()) as JournalEntry[];
  return sortEntries(rows.filter((e) => !e.deleted_at));
}

/** Activités tirées de chaque entrée du carnet (une entrée peut être planifiée plusieurs fois). */
export async function plannedFromJournal(db: LocalDb, tripId: string): Promise<Map<string, Activity[]>> {
  const out = new Map<string, Activity[]>();
  for (const a of await activitiesOfTrip(db, tripId)) {
    if (a.journal_entry_id) out.set(a.journal_entry_id, [...(out.get(a.journal_entry_id) ?? []), a]);
  }
  return out;
}

/** Enregistre l'entrée ; une adresse ou des coordonnées créent (ou mettent à jour) son lieu sur la carte. */
export async function saveEntry(engine: SyncEngine, db: LocalDb, tripId: string, input: { entry: JournalPatch; place: JournalPlace }, existing?: JournalEntry) {
  const { entry, place } = input;
  const patch: RowData = { ...entry };
  if (place) {
    const data = { name: entry.title, address: place.address, lat: place.lat, lng: place.lng, city: entry.city };
    const current = existing?.place_id ? ((await db.data("places").get(existing.place_id)) as Place | undefined) : undefined;
    if (current && !current.deleted_at) {
      await engine.update("places", current.id, data);
      patch.place_id = current.id;
    } else {
      patch.place_id = await engine.insert("places", {
        ...data, trip_id: tripId, category: journalMeta(entry.category).place, source: "manual", is_favorite: false,
      });
    }
  } else if (existing?.place_id) {
    patch.place_id = null;
  }
  if (existing) {
    await engine.update("journal_entries", existing.id, patch);
    return existing.id;
  }
  return engine.insert("journal_entries", { ...patch, trip_id: tripId });
}

/** Suppression logique ; les activités déjà planifiées restent dans le planning. */
export const deleteEntry = (engine: SyncEngine, entry: JournalEntry) => engine.remove("journal_entries", entry.id);

/**
 * Conversion sans ressaisie : titre, description, lien, lieu et catégorie sont repris ;
 * l'activité garde le lien vers son entrée d'origine (`journal_entry_id`).
 */
export async function planEntry(engine: SyncEngine, db: LocalDb, tripId: string, entry: JournalEntry, date: string | null) {
  return engine.insert("activities", {
    trip_id: tripId,
    title: entry.title,
    description: entry.body,
    url: entry.url,
    place_id: entry.place_id,
    category: date === null ? "idea" : journalMeta(entry.category).activity,
    date,
    is_done: false,
    journal_entry_id: entry.id,
    sort_key: await placementKeyFor(engine, db, tripId, date, null),
  });
}
