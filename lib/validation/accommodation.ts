import "./zod-config";
import { z } from "zod";
import { parseCoordinates } from "@/lib/geo";

export interface AccommodationForm {
  name: string;
  city: string;
  address: string;
  address_local: string;
  coords: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  guests: string;
  rooms: string;
  booking_site: string;
  booking_ref: string;
  booking_url: string;
  phone: string;
  email: string;
  practical_info: string;
  notes: string;
}

export type AccommodationPatch = {
  name: string;
  city: string | null;
  address: string | null;
  address_local: string | null;
  check_in_date: string;
  check_in_time: string | null;
  check_out_date: string;
  check_out_time: string | null;
  guests: number | null;
  rooms: string | null;
  booking_site: string | null;
  booking_ref: string | null;
  booking_url: string | null;
  phone: string | null;
  email: string | null;
  practical_info: string | null;
  notes: string | null;
};

export type StayLocation = { lat: number | null; lng: number | null } | null;

const opt = (s: string) => (s.trim() === "" ? null : s.trim());
const time = z.string().refine((t) => t === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(t), "Heure invalide (HH:MM)");
const isoDate = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

export function accommodationSchema(trip: { start_date: string; end_date: string }) {
  return z
    .object({
      name: z.string().trim().min(1, "Nom requis").max(160, "160 caractères maximum"),
      city: z.string().max(80, "80 caractères maximum"),
      address: z.string().max(400, "400 caractères maximum"),
      address_local: z.string().max(400, "400 caractères maximum"),
      coords: z.string().refine((c) => c.trim() === "" || parseCoordinates(c) !== null,
        "Coordonnées non reconnues (ex. 35.0116, 135.7681 ou lien Google Maps)"),
      check_in_date: isoDate("Date d'arrivée requise").refine((d) => d >= trip.start_date && d < trip.end_date,
        "L'arrivée doit être pendant le voyage (au plus tard la veille du dernier jour)"),
      check_in_time: time,
      check_out_date: isoDate("Date de départ requise").refine((d) => d > trip.start_date && d <= trip.end_date,
        "Le départ doit être pendant le voyage"),
      check_out_time: time,
      guests: z.string().transform((v, ctx) => {
        if (v.trim() === "") return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
          ctx.addIssue({ code: "custom", message: "Nombre entier entre 1 et 50" });
          return z.NEVER;
        }
        return n;
      }),
      rooms: z.string().max(2000, "2000 caractères maximum"),
      booking_site: z.string().max(80, "80 caractères maximum"),
      booking_ref: z.string().max(120, "120 caractères maximum"),
      booking_url: z.string().trim().refine((u) => u === "" || /^https?:\/\/\S+$/i.test(u), "Lien invalide (doit commencer par http:// ou https://)"),
      phone: z.string().trim().max(40, "40 caractères maximum").refine((p) => p === "" || /^[+\d][\d\s().-]{4,}$/.test(p), "Numéro invalide (ex. +81 75 123 4567)"),
      email: z.string().trim().max(200).refine((e) => e === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "Adresse email invalide"),
      practical_info: z.string().max(10000),
      notes: z.string().max(10000),
    })
    .refine((v) => !v.check_in_date || !v.check_out_date || v.check_out_date > v.check_in_date, {
      message: "Le départ doit être après l'arrivée (au moins une nuit)", path: ["check_out_date"],
    })
    .transform((v): { stay: AccommodationPatch; location: StayLocation } => {
      const c = parseCoordinates(v.coords);
      return {
        stay: {
          name: v.name,
          city: opt(v.city),
          address: opt(v.address),
          address_local: opt(v.address_local),
          check_in_date: v.check_in_date,
          check_in_time: opt(v.check_in_time),
          check_out_date: v.check_out_date,
          check_out_time: opt(v.check_out_time),
          guests: v.guests,
          rooms: opt(v.rooms),
          booking_site: opt(v.booking_site),
          booking_ref: opt(v.booking_ref),
          booking_url: opt(v.booking_url),
          phone: opt(v.phone),
          email: opt(v.email),
          practical_info: opt(v.practical_info),
          notes: opt(v.notes),
        },
        location: c ? { lat: c.lat, lng: c.lng } : null,
      };
    });
}
