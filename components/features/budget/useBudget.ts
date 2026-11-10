"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getLocalDb } from "@/lib/db/schema";
import { expensesOfTrip, personalOfTrip, settlementsOfTrip } from "@/lib/db/budget";
import { effectiveRate, fetchEcbRate, fxMetaKey } from "@/lib/fx";
import { todayIn } from "@/lib/formatters";
import type { KnownRate } from "@/lib/types/budget";
import type { Trip } from "@/lib/types/trip";

/** Met à jour le taux BCE en local ; renvoie le message d'erreur éventuel (le dernier taux reste utilisé). */
async function updateRate(base: string, quote: string | null): Promise<string | null> {
  if (!quote) return null;
  try {
    await getLocalDb().setMeta(fxMetaKey(base, quote), await fetchEcbRate(base, quote));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function useBudget(tripId: string) {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [expenses, settlements, personal] = await Promise.all([expensesOfTrip(db, tripId), settlementsOfTrip(db, tripId), personalOfTrip(db, tripId)]);
    return { expenses, settlements, personal };
  }, [tripId]);
}

/**
 * Taux de la paire du voyage (devise principale → secondaire). Mis à jour au plus une fois par
 * jour quand le réseau est là ; sinon le dernier taux connu, toujours affiché avec sa date.
 */
export function useFx(trip: Trip) {
  const base = trip.base_currency;
  const quote = trip.secondary_currency;
  const ecb = useLiveQuery(async () => (quote ? ((await getLocalDb().getMeta<KnownRate>(fxMetaKey(base, quote))) ?? null) : null), [base, quote]);
  const [status, setStatus] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  const refresh = async () => {
    setStatus({ loading: true, error: null });
    setStatus({ loading: false, error: await updateRate(base, quote) });
  };

  const stale = ecb !== undefined && quote && (!ecb || ecb.fetched_at.slice(0, 10) < todayIn(trip.timezone));
  useEffect(() => {
    if (stale && navigator.onLine) void updateRate(base, quote).then((error) => setStatus({ loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule tentative par affichage
  }, [stale]);

  return { known: ecb === undefined ? undefined : effectiveRate(trip.settings, base, quote ?? "", ecb), ecb, refresh, ...status };
}
