import type { SyncedRow } from "./sync";

export interface Accommodation extends SyncedRow {
  trip_id: string;
  name: string;
  address: string | null;
  address_local: string | null;
  city: string | null;
  place_id: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  /** Calculé par le serveur (colonne générée) ; absent tant que la fiche n'est pas synchronisée. */
  nights?: number | null;
  guests: number | null;
  rooms: string | null;
  booking_ref: string | null;
  booking_site: string | null;
  booking_url: string | null;
  phone: string | null;
  email: string | null;
  practical_info: string | null;
  notes: string | null;
}
