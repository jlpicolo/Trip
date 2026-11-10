import { z } from "zod";
import { TRANSPORT_KINDS } from "@/lib/types/tickets";

export interface TransportForm {
  kind: string;
  carrier: string;
  reference: string;
  booking_ref: string;
  departure_date: string;
  departure_time: string;
  departure_name: string;
  arrival_date: string;
  arrival_time: string;
  arrival_name: string;
  seat_info: string;
  booking_url: string;
  notes: string;
  traveler_ids: string[];
}

export type TransportPatch = {
  kind: (typeof TRANSPORT_KINDS)[number];
  carrier: string | null;
  reference: string | null;
  booking_ref: string | null;
  departure_date: string;
  departure_time: string | null;
  departure_name: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_name: string | null;
  seat_info: string | null;
  booking_url: string | null;
  notes: string | null;
  traveler_ids: string[];
};

const opt = (s: string) => (s.trim() === "" ? null : s.trim());
const time = z.string().refine((t) => t === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(t), "Heure invalide (HH:MM)");
const date = z.string().refine((d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d), "Date invalide");

export function transportSchema(bounds: { start: string; end: string }) {
  // Marge d'une journée : vol de nuit la veille, ou retour le lendemain de la fin.
  const min = shift(bounds.start, -1);
  const max = shift(bounds.end, 1);
  return z
    .object({
      kind: z.enum(TRANSPORT_KINDS, { message: "Type de transport inconnu" }),
      carrier: z.string().max(120, "120 caractères maximum"),
      reference: z.string().max(60, "60 caractères maximum"),
      booking_ref: z.string().max(120, "120 caractères maximum"),
      departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de départ requise")
        .refine((d) => d >= min && d <= max, "En dehors des dates du voyage"),
      departure_time: time,
      departure_name: z.string().max(160, "160 caractères maximum"),
      arrival_date: date,
      arrival_time: time,
      arrival_name: z.string().max(160, "160 caractères maximum"),
      seat_info: z.string().max(400, "400 caractères maximum"),
      booking_url: z.string().trim().refine((u) => u === "" || /^https?:\/\/\S+$/i.test(u), "Lien invalide (doit commencer par http:// ou https://)"),
      notes: z.string().max(10000),
      traveler_ids: z.array(z.string().uuid()),
    })
    .refine((v) => v.arrival_date === "" || v.arrival_date >= v.departure_date, {
      message: "L'arrivée ne peut pas précéder le départ", path: ["arrival_date"],
    })
    .refine((v) => {
      const sameDay = v.arrival_date === "" || v.arrival_date === v.departure_date;
      return !(sameDay && v.departure_time && v.arrival_time && v.arrival_time < v.departure_time);
    }, { message: "Arrivée avant le départ : indiquez la date d'arrivée si c'est le lendemain", path: ["arrival_time"] })
    .transform((v): TransportPatch => ({
      kind: v.kind,
      carrier: opt(v.carrier),
      reference: opt(v.reference),
      booking_ref: opt(v.booking_ref),
      departure_date: v.departure_date,
      departure_time: opt(v.departure_time),
      departure_name: opt(v.departure_name),
      arrival_date: opt(v.arrival_date),
      arrival_time: opt(v.arrival_time),
      arrival_name: opt(v.arrival_name),
      seat_info: opt(v.seat_info),
      booking_url: opt(v.booking_url),
      notes: opt(v.notes),
      traveler_ids: [...new Set(v.traveler_ids)].sort(),
    }));
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
