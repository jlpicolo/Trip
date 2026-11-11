import "./zod-config";
import { z } from "zod";
import { normalizeUsername } from "@/lib/auth/username";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const currency = z.string().regex(/^[A-Z]{3}$/, "Code devise sur 3 lettres (ex. EUR)");

export const emailSchema = z.string().trim().toLowerCase().email("Adresse email invalide");
export const passwordSchema = z.string().min(10, "10 caractères minimum").max(72, "72 caractères maximum");

export const usernameSchema = z
  .string()
  .transform((v, ctx) => {
    const u = normalizeUsername(v);
    if (!u) ctx.addIssue({ code: "custom", message: "Nom d'utilisateur invalide (2 à 32 lettres, chiffres, . _ -)" });
    return u ?? "";
  });

export const signInSchema = z.object({ username: usernameSchema, password: z.string().min(1, "Mot de passe requis") });

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Indiquez un prénom ou pseudo").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

// Conserve les champs complémentaires (coordonnées, dates…) ajoutés par d'autres écrans.
export const destinationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
  })
  .catchall(z.json());

export const tripSchema = z
  .object({
    name: z.string().trim().min(1, "Nom requis").max(80, "80 caractères maximum"),
    start_date: isoDate,
    end_date: isoDate,
    timezone: z.string().min(1).max(64),
    base_currency: currency,
    secondary_currency: currency.nullable(),
    destinations: z.array(destinationSchema).max(30),
  })
  .refine((t) => t.end_date >= t.start_date, { message: "La fin doit être après le début", path: ["end_date"] })
  .refine((t) => (Date.parse(t.end_date) - Date.parse(t.start_date)) / 86_400_000 <= 366, {
    message: "Un voyage dure au plus un an",
    path: ["end_date"],
  });

export type TripInput = z.infer<typeof tripSchema>;

/** Premier message d'erreur par champ, pour l'affichage sous les champs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
