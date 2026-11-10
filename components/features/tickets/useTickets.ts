"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/schema";
import { documentsOfTrip, localFileIds, pendingUploadIds, transportsOfTrip } from "@/lib/db/tickets";

export function useTickets(tripId: string) {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [transports, documents, pending] = await Promise.all([
      transportsOfTrip(db, tripId), documentsOfTrip(db, tripId), pendingUploadIds(db, tripId),
    ]);
    const local = await localFileIds(db, documents.map((d) => d.id));
    return { transports, documents, local, pending };
  }, [tripId]);
}

export type TicketsData = NonNullable<ReturnType<typeof useTickets>>;
