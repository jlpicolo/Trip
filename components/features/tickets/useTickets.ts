"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/schema";
import { documentsOfTrip, localFileIds, pendingUploadIds, transportsOfTrip } from "@/lib/db/tickets";
import { staysOfTrip } from "@/lib/db/stays";

export function useTickets(tripId: string) {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [transports, documents, pending, stays] = await Promise.all([
      transportsOfTrip(db, tripId), documentsOfTrip(db, tripId), pendingUploadIds(db, tripId), staysOfTrip(db, tripId),
    ]);
    const local = await localFileIds(db, documents.map((d) => d.id));
    return { transports, documents, local, pending, stays };
  }, [tripId]);
}

export type TicketsData = NonNullable<ReturnType<typeof useTickets>>;
