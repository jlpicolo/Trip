import type { SyncedRow } from "./sync";

export const ACTIVITY_CATEGORIES = [
  "visit", "restaurant", "transport", "hotel", "shopping", "activity", "free_time", "idea", "other",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const TRAVEL_MODES = ["walk", "train", "metro", "bus", "taxi", "car", "bike", "other"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export interface Activity extends SyncedRow {
  trip_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  category: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  sort_key: number;
  place_id: string | null;
  url: string | null;
  estimated_cost_minor: number | null;
  estimated_cost_currency: string | null;
  travel_minutes_estimate: number | null;
  travel_mode: TravelMode | null;
  is_done: boolean;
  journal_entry_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripDay extends SyncedRow {
  trip_id: string;
  date: string;
  title: string | null;
  city: string | null;
  notes: string | null;
  is_free: boolean;
}

export interface Place extends SyncedRow {
  trip_id: string;
  name: string;
  category: string;
  description: string | null;
  notes: string | null;
  address: string | null;
  address_local: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  is_favorite: boolean;
}
