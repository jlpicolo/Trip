import { z } from "zod";
import { PLACE_CATEGORIES } from "@/lib/places";
import { parseCoordinates } from "@/lib/geo";

export interface PlaceForm {
  name: string;
  category: string;
  address: string;
  address_local: string;
  city: string;
  coords: string;
  description: string;
  notes: string;
  url: string;
  is_favorite: boolean;
}

export type PlacePatch = {
  name: string;
  category: string;
  address: string | null;
  address_local: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  notes: string | null;
  url: string | null;
  is_favorite: boolean;
};

const opt = (s: string) => (s.trim() === "" ? null : s.trim());

export const placeSchema = z
  .object({
    name: z.string().trim().min(1, "Nom requis").max(160, "160 caractères maximum"),
    category: z.enum(PLACE_CATEGORIES, { message: "Catégorie inconnue" }),
    address: z.string().max(400, "400 caractères maximum"),
    address_local: z.string().max(400, "400 caractères maximum"),
    city: z.string().max(80, "80 caractères maximum"),
    coords: z.string().refine((c) => c.trim() === "" || parseCoordinates(c) !== null,
      "Coordonnées non reconnues (ex. 34.9671, 135.7727 ou lien Google Maps)"),
    description: z.string().max(10000),
    notes: z.string().max(10000),
    url: z.string().trim().refine((u) => u === "" || /^https?:\/\/\S+$/i.test(u), "Lien invalide (doit commencer par http:// ou https://)"),
    is_favorite: z.boolean(),
  })
  .transform((v): PlacePatch => {
    const c = parseCoordinates(v.coords);
    return {
      name: v.name,
      category: v.category,
      address: opt(v.address),
      address_local: opt(v.address_local),
      city: opt(v.city),
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
      description: opt(v.description),
      notes: opt(v.notes),
      url: opt(v.url),
      is_favorite: v.is_favorite,
    };
  });
