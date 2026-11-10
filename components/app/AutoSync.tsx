"use client";

import { useEffect } from "react";
import { getEngine, getFileSync } from "@/lib/sync/client";
import { createSyncScheduler } from "@/lib/sync/scheduler";
import { getLocalDb } from "@/lib/db/schema";
import { ACTIVE_TRIP_KEY, useActiveTripId } from "@/hooks/useTrip";
import type { Trip } from "@/lib/types/trip";

/** Voyage à synchroniser : le voyage actif, ou à défaut le premier connu (appareil neuf). */
async function resolveTripId(): Promise<string | null> {
  const db = getLocalDb();
  const active = await db.getMeta<string>(ACTIVE_TRIP_KEY);
  if (active && (await db.data("trips").get(active))) return active;
  const trips = ((await db.data("trips").toArray()) as Trip[])
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (!trips[0]) return null;
  await db.setMeta(ACTIVE_TRIP_KEY, trips[0].id);
  return trips[0].id;
}

/**
 * Déclencheurs : ouverture, changement de voyage actif, retour du réseau, retour au
 * premier plan, et modifications en attente (voir createSyncScheduler). Pas de polling.
 * Après chaque synchro, les billets qui concernent le voyageur sont téléchargés.
 */
export function AutoSync({ userId }: { userId: string }) {
  const activeTripId = useActiveTripId();

  useEffect(() => {
    const scheduler = createSyncScheduler({
      engine: getEngine(),
      resolveTripId,
      isOnline: () => navigator.onLine,
      afterSync: async (tripId) => tripId && (await getFileSync().autoDownload(tripId, userId)),
    });
    const run = () => void scheduler.runNow();
    const onVisible = () => document.visibilityState === "visible" && run();
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      scheduler.stop();
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeTripId, userId]);

  return null;
}
