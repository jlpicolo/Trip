"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/schema";
import type { GroupMember, Profile, Trip } from "@/lib/types/trip";

export const ACTIVE_TRIP_KEY = "activeTripId";

export function useActiveTripId(): string | null | undefined {
  return useLiveQuery(async () => (await getLocalDb().getMeta<string>(ACTIVE_TRIP_KEY)) ?? null, []);
}

export function useTrips(): Trip[] | undefined {
  return useLiveQuery(async () => {
    const all = (await getLocalDb().data("trips").toArray()) as Trip[];
    return all.filter((t) => !t.deleted_at).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, []);
}

export function useTrip(tripId: string | null | undefined): Trip | null | undefined {
  return useLiveQuery(async () => {
    if (!tripId) return null;
    const t = (await getLocalDb().data("trips").get(tripId)) as Trip | undefined;
    return t && !t.deleted_at ? t : null;
  }, [tripId]);
}

export interface Traveler extends Profile {
  joined_at: string;
}

export function useTravelers(groupId: string | undefined): Traveler[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    const db = getLocalDb();
    const members: GroupMember[] = await db.members.where("group_id").equals(groupId).toArray();
    const profiles = await db.profiles.bulkGet(members.map((m) => m.user_id));
    return members
      .map((m, i) => ({
        ...(profiles[i] ?? { id: m.user_id, display_name: "Voyageur", avatar_path: null, color: "#8a8a8f", locale: "fr", theme: "dark" as const }),
        joined_at: m.joined_at,
      }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  }, [groupId]);
}

/** Date du premier chargement de la liste des voyages depuis le serveur (null = jamais). */
export function useDirectoryLoaded(): string | null | undefined {
  return useLiveQuery(async () => (await getLocalDb().getMeta<string>("directoryLoadedAt")) ?? null, []);
}
