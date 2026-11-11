import "./zod-config";
import { z } from "zod";
import { parseCoordinates } from "@/lib/geo";
import { JOURNAL_CATEGORIES, type JournalPriority } from "@/lib/types/journal";

export interface JournalForm {
  title: string;
  category: string;
  priority: string;
  city: string;
  body: string;
  url: string;
  address: string;
  coords: string;
}

export type JournalPatch = {
  title: string;
  category: (typeof JOURNAL_CATEGORIES)[number];
  priority: JournalPriority | null;
  city: string | null;
  body: string | null;
  url: string | null;
};

export type JournalPlace = { address: string | null; lat: number | null; lng: number | null } | null;

const opt = (s: string) => (s.trim() === "" ? null : s.trim());

export const journalSchema = z
  .object({
    title: z.string().trim().min(1, "Titre requis").max(160, "160 caractères maximum"),
    category: z.enum(JOURNAL_CATEGORIES, { message: "Catégorie inconnue" }),
    priority: z.enum(["", "1", "2", "3"], { message: "Priorité inconnue" }),
    city: z.string().max(80, "80 caractères maximum"),
    body: z.string().max(20000, "20 000 caractères maximum"),
    url: z.string().trim().refine((u) => u === "" || /^https?:\/\/\S+$/i.test(u), "Lien invalide (doit commencer par http:// ou https://)"),
    address: z.string().max(400, "400 caractères maximum"),
    coords: z.string().refine((c) => c.trim() === "" || parseCoordinates(c) !== null,
      "Coordonnées non reconnues (ex. 35.0116, 135.7681 ou lien Google Maps)"),
  })
  .transform((v): { entry: JournalPatch; place: JournalPlace } => {
    const c = parseCoordinates(v.coords);
    const address = opt(v.address);
    return {
      entry: {
        title: v.title,
        category: v.category,
        priority: v.priority === "" ? null : (Number(v.priority) as JournalPriority),
        city: opt(v.city),
        body: opt(v.body),
        url: opt(v.url),
      },
      place: address || c ? { address, lat: c?.lat ?? null, lng: c?.lng ?? null } : null,
    };
  });
