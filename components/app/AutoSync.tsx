"use client";

import { useEffect, useRef } from "react";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { ACTIVE_TRIP_KEY } from "@/hooks/useTrip";

const DEBOUNCE_MS = 2000;

/**
 * Déclencheurs de synchronisation : ouverture, retour du réseau, retour au premier
 * plan, et quelques secondes après une modification locale. Aucun polling permanent.
 */
export function AutoSync() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const engine = getEngine();
    const run = async () => {
      if (!navigator.onLine) return;
      const tripId = (await getLocalDb().getMeta<string>(ACTIVE_TRIP_KEY)) ?? null;
      try {
        await engine.refreshDirectory();
        await engine.sync(tripId);
      } catch {
        // L'état d'erreur est exposé par le moteur (indicateur de synchro).
      }
    };
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, DEBOUNCE_MS);
    };
    const onVisible = () => document.visibilityState === "visible" && void run();

    void run();
    let lastPending = engine.getStatus().pending;
    const unsubscribe = engine.subscribe((s) => {
      if (s.pending > lastPending && !s.syncing) schedule();
      lastPending = s.pending;
    });
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return null;
}
