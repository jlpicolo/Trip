import { z } from "zod";
import { ACTIVITY_CATEGORIES, TRAVEL_MODES } from "@/lib/types/planning";
import { parseAmountToMinor } from "@/lib/money";
import { parseCoordinates } from "@/lib/geo";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const opt = (s: string) => (s.trim() === "" ? null : s.trim());

/** Valeurs brutes du formulaire (toutes en texte, comme saisies). */
export interface ActivityForm {
  title: string;
  category: string;
  date: string;
  start_time: string;
  end_time: string;
  duration: string;
  description: string;
  notes: string;
  url: string;
  cost: string;
  cost_currency: string;
  travel_minutes: string;
  travel_mode: string;
  address: string;
  coords: string;
}

export interface ActivityPatch {
  title: string;
  category: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  description: string | null;
  notes: string | null;
  url: string | null;
  estimated_cost_minor: number | null;
  estimated_cost_currency: string | null;
  travel_minutes_estimate: number | null;
  travel_mode: string | null;
}

export interface PlaceFields {
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const intIn = (min: number, max: number, label: string) =>
  z.string().transform((v, ctx) => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} : nombre entier entre ${min} et ${max}` });
      return z.NEVER;
    }
    return n;
  });

export function activitySchema(trip: { start_date: string; end_date: string }) {
  return z
    .object({
      title: z.string().trim().min(1, "Titre requis").max(160, "160 caractères maximum"),
      category: z.enum(ACTIVITY_CATEGORIES, { message: "Catégorie inconnue" }),
      date: z.string().refine((d) => d === "" || (d >= trip.start_date && d <= trip.end_date), {
        message: "La date doit être comprise dans le voyage",
      }),
      start_time: z.string().refine((t) => t === "" || time.test(t), "Heure invalide"),
      end_time: z.string().refine((t) => t === "" || time.test(t), "Heure invalide"),
      duration: intIn(1, 1440, "Durée (minutes)"),
      description: z.string().max(10000),
      notes: z.string().max(10000),
      url: z.string().trim().refine((u) => u === "" || /^https?:\/\/\S+$/i.test(u), "Lien invalide (doit commencer par http:// ou https://)"),
      cost: z.string(),
      cost_currency: z.string().regex(/^[A-Z]{3}$/),
      travel_minutes: intIn(0, 1440, "Temps de trajet (minutes)"),
      travel_mode: z.string().refine((m) => m === "" || (TRAVEL_MODES as readonly string[]).includes(m)),
      address: z.string().max(400),
      coords: z.string().refine((c) => c.trim() === "" || parseCoordinates(c) !== null, "Coordonnées non reconnues (ex. 34.9671, 135.7727 ou lien Google Maps)"),
    })
    .superRefine((v, ctx) => {
      if (v.start_time && !v.date) ctx.addIssue({ code: "custom", path: ["start_time"], message: "Choisissez une date pour fixer un horaire" });
      if (v.end_time && !v.start_time) ctx.addIssue({ code: "custom", path: ["end_time"], message: "Indiquez d'abord l'heure de début" });
      if (v.start_time && v.end_time && v.end_time <= v.start_time)
        ctx.addIssue({ code: "custom", path: ["end_time"], message: "La fin doit être après le début" });
      if (v.cost.trim() !== "" && parseAmountToMinor(v.cost, v.cost_currency) === null)
        ctx.addIssue({ code: "custom", path: ["cost"], message: "Montant invalide" });
    })
    .transform((v): { activity: ActivityPatch; place: PlaceFields | null } => {
      const minor = v.cost.trim() === "" ? null : parseAmountToMinor(v.cost, v.cost_currency);
      const coords = parseCoordinates(v.coords);
      const address = opt(v.address);
      return {
        activity: {
          title: v.title,
          category: v.category,
          date: opt(v.date),
          start_time: opt(v.start_time) ? `${v.start_time}:00` : null,
          end_time: opt(v.end_time) ? `${v.end_time}:00` : null,
          duration_minutes: v.duration,
          description: opt(v.description),
          notes: opt(v.notes),
          url: opt(v.url),
          estimated_cost_minor: minor,
          estimated_cost_currency: minor === null ? null : v.cost_currency,
          travel_minutes_estimate: v.travel_minutes,
          travel_mode: v.travel_minutes === null ? null : opt(v.travel_mode),
        },
        place: address || coords ? { address, lat: coords?.lat ?? null, lng: coords?.lng ?? null } : null,
      };
    });
}
