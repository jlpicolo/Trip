"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/schema";
import { activitiesOfTrip, daysOfTrip, placesOfTrip } from "@/lib/db/planning";
import { bucketActivities } from "@/lib/planning";
import { transportsOfTrip } from "@/lib/db/tickets";
import { staysOfTrip } from "@/lib/db/stays";
import type { Transport } from "@/lib/types/tickets";
import { tripDates } from "@/lib/formatters";
import type { Trip } from "@/lib/types/trip";

export function usePlanning(trip: Trip) {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [activities, days, places, transports, stays] = await Promise.all([
      activitiesOfTrip(db, trip.id), daysOfTrip(db, trip.id), placesOfTrip(db, trip.id), transportsOfTrip(db, trip.id), staysOfTrip(db, trip.id),
    ]);
    const dates = tripDates(trip.start_date, trip.end_date);
    const transportsByDate = new Map<string, Transport[]>();
    for (const t of transports) transportsByDate.set(t.departure_date, [...(transportsByDate.get(t.departure_date) ?? []), t]);
    return { dates, days, places, transportsByDate, stays, ...bucketActivities(activities, dates) };
  }, [trip.id, trip.start_date, trip.end_date]);
}

export type PlanningData = NonNullable<ReturnType<typeof usePlanning>>;
