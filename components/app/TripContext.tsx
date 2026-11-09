"use client";

import { createContext, useContext } from "react";
import type { Trip } from "@/lib/types/trip";

export interface TripCtx {
  trip: Trip | null;
  userId: string;
  offline: boolean;
}

export const TripContext = createContext<TripCtx>({ trip: null, userId: "", offline: false });

export const useTripContext = () => useContext(TripContext);

/** Pour les pages qui exigent un voyage (garanti par AppShell). */
export function useCurrentTrip() {
  const ctx = useContext(TripContext);
  if (!ctx.trip) throw new Error("Aucun voyage actif");
  return { ...ctx, trip: ctx.trip };
}
