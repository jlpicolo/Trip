import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { sortStays } from "@/lib/stays";
import type { Accommodation } from "@/lib/types/stays";
import type { Place } from "@/lib/types/planning";
import type { TripDocument } from "@/lib/types/tickets";
import type { RowData } from "@/lib/types/sync";
import type { AccommodationPatch, StayLocation } from "@/lib/validation/accommodation";

export async function staysOfTrip(db: LocalDb, tripId: string): Promise<Accommodation[]> {
  const rows = (await db.data("accommodations").where("trip_id").equals(tripId).toArray()) as Accommodation[];
  return sortStays(rows.filter((s) => !s.deleted_at));
}

/**
 * Enregistre un hébergement et son point sur la carte (lieu « Hôtel ») : l'adresse ou les
 * coordonnées suffisent. Sans l'un ni l'autre, l'association est retirée mais le lieu conservé.
 */
export async function saveStay(engine: SyncEngine, db: LocalDb, tripId: string, input: { stay: AccommodationPatch; location: StayLocation }, existing?: Accommodation) {
  const { stay, location } = input;
  const patch: RowData = { ...stay };
  if (location || stay.address) {
    const placeData = {
      name: stay.name, address: stay.address, address_local: stay.address_local, city: stay.city,
      lat: location?.lat ?? null, lng: location?.lng ?? null,
    };
    const current = existing?.place_id ? ((await db.data("places").get(existing.place_id)) as Place | undefined) : undefined;
    if (current && !current.deleted_at) {
      await engine.update("places", current.id, placeData);
      patch.place_id = current.id;
    } else {
      patch.place_id = await engine.insert("places", { ...placeData, trip_id: tripId, category: "hotel", source: "manual", is_favorite: false });
    }
  } else if (existing?.place_id) {
    patch.place_id = null;
  }
  if (existing) {
    await engine.update("accommodations", existing.id, patch);
    return existing.id;
  }
  return engine.insert("accommodations", { ...patch, trip_id: tripId });
}

/** Suppression logique ; ses documents restent dans Billets (détachés), son lieu reste sur la carte. */
export async function deleteStay(engine: SyncEngine, db: LocalDb, stay: Accommodation) {
  const docs = (await db.data("documents").where("trip_id").equals(stay.trip_id).toArray()) as TripDocument[];
  for (const d of docs) if (!d.deleted_at && d.accommodation_id === stay.id) await engine.update("documents", d.id, { accommodation_id: null });
  await engine.remove("accommodations", stay.id);
}
