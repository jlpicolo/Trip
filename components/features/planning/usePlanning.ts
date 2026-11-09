"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/schema";
import { activitiesOfTrip, daysOfTrip, placesOfTrip } from "@/lib/db/planning";
import { bucketActivities } from "@/lib/planning";
import { tripDates } from "@/lib/formatters";
import type { Trip } from "@/lib/types/trip";

export function usePlanning(trip: Trip) {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [activities, days, places] = await Promise.all([
      activitiesOfTrip(db, trip.id), daysOfTrip(db, trip.id), placesOfTrip(db, trip.id),
    ]);
    const dates = tripDates(trip.start_date, trip.end_date);
    return { dates, days, places, ...bucketActivities(activities, dates) };
  }, [trip.id, trip.start_date, trip.end_date]);
}

export type PlanningData = NonNullable<ReturnType<typeof usePlanning>>;
