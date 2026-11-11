import type { SyncEngine } from "@/lib/sync/engine";
import { importable, type ImportRow } from "@/lib/import/places";

/**
 * Crée les lieux (et, au choix, une envie du carnet reliée à chacun). Une position approximative est
 * signalée dans les notes du lieu, pour qu'on sache qu'elle est à affiner sur place.
 */
export async function importPlaces(engine: SyncEngine, tripId: string, rows: ImportRow[], withJournal: boolean, onProgress?: (done: number, total: number) => void) {
  const todo = rows.filter(importable);
  let done = 0;
  for (const r of todo) {
    const notes = [r.approximate ? "⚠ Position approximative (fichier importé) : à affiner." : null,
      r.name_local ? `Nom japonais : ${r.name_local}` : null, r.notes].filter(Boolean).join("\n").slice(0, 10000) || null;
    const placeId = await engine.insert("places", {
      trip_id: tripId, name: r.name, category: r.placeCategory, address: r.address, city: r.city,
      lat: r.lat, lng: r.lng, description: r.description, notes, url: r.url, is_favorite: false, source: "import",
    });
    if (withJournal) {
      await engine.insert("journal_entries", {
        trip_id: tripId, title: r.name, category: r.journalCategory, city: r.city, url: r.url, place_id: placeId, priority: 2,
        body: [r.description, r.notes].filter(Boolean).join("\n\n").slice(0, 20000) || null,
      });
    }
    onProgress?.(++done, todo.length);
  }
  return done;
}
