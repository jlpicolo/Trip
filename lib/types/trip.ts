import type { SyncedRow } from "./sync";

export type Destination = {
  id: string;
  name: string;
  name_local?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type TripSettings = {
  dashboard?: { hidden?: string[]; order?: string[] };
  manual_fx_rate?: { pair: string; rate: number; set_at: string } | null;
  categories?: Partial<Record<"places" | "activities" | "journal", string[]>>;
};

export interface Trip extends SyncedRow {
  group_id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  base_currency: string;
  secondary_currency: string | null;
  locale: string;
  destinations: Destination[];
  settings: TripSettings;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  color: string;
  locale: string;
  theme: "dark" | "light" | "system";
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface ActivityLogEntry {
  id: number;
  trip_id: string;
  actor_id: string | null;
  action: "create" | "update" | "delete" | "restore";
  entity_type: string;
  entity_id: string;
  label: string | null;
  details: { category?: string; kind?: string; city?: string; date?: string };
  created_at: string;
}
