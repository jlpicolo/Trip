import { z } from "zod";
import { CODE_FORMATS, DOCUMENT_CATEGORIES, DOCUMENT_KINDS, type CodeFormat } from "@/lib/types/tickets";

export interface DocumentForm {
  title: string;
  category: string;
  kind: string;
  url: string;
  code_value: string;
  code_format: string;
  for_travelers: boolean;
  traveler_ids: string[];
  date: string;
  transport_id: string;
  accommodation_id: string;
  notes: string;
}

export type DocumentPatch = {
  title: string;
  category: (typeof DOCUMENT_CATEGORIES)[number];
  kind: (typeof DOCUMENT_KINDS)[number];
  url: string | null;
  code_value: string | null;
  code_format: CodeFormat | null;
  scope: "group" | "travelers";
  traveler_ids: string[];
  date: string | null;
  transport_id: string | null;
  accommodation_id: string | null;
  notes: string | null;
};

const opt = (s: string) => (s.trim() === "" ? null : s.trim());

/** EAN-13 : 12 ou 13 chiffres (le 13e, s'il est fourni, doit être la bonne clé). */
export function validEan13(v: string): boolean {
  if (!/^\d{12,13}$/.test(v)) return false;
  const digits = v.slice(0, 12).split("").map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  const check = (10 - (sum % 10)) % 10;
  return v.length === 12 || Number(v[12]) === check;
}

export function codeValueError(format: CodeFormat, value: string): string | null {
  if (format === "ean13" && !validEan13(value)) return "Un EAN-13 compte 13 chiffres (clé de contrôle comprise)";
  if (format === "code39" && !/^[0-9A-Z \-.$/+%]+$/.test(value)) return "Code 39 : chiffres, majuscules et - . $ / + % uniquement";
  if (format === "code128" && !/^[\x20-\x7e]+$/.test(value)) return "Code 128 : caractères sans accents uniquement";
  return null;
}

export const documentSchema = z
  .object({
    title: z.string().trim().min(1, "Titre requis").max(160, "160 caractères maximum"),
    category: z.enum(DOCUMENT_CATEGORIES, { message: "Catégorie inconnue" }),
    kind: z.enum(DOCUMENT_KINDS, { message: "Type inconnu" }),
    url: z.string().trim(),
    code_value: z.string().max(4000, "4000 caractères maximum"),
    code_format: z.string(),
    for_travelers: z.boolean(),
    traveler_ids: z.array(z.string().uuid()),
    date: z.string().refine((d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d), "Date invalide"),
    transport_id: z.string(),
    accommodation_id: z.string(),
    notes: z.string().max(10000),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "link" && !/^https?:\/\/\S+$/i.test(v.url))
      ctx.addIssue({ code: "custom", path: ["url"], message: "Lien invalide (doit commencer par http:// ou https://)" });
    if (v.kind === "code") {
      const value = v.code_value.trim();
      if (!value) ctx.addIssue({ code: "custom", path: ["code_value"], message: "Contenu du code requis" });
      if (!(CODE_FORMATS as readonly string[]).includes(v.code_format))
        ctx.addIssue({ code: "custom", path: ["code_format"], message: "Format de code inconnu" });
      else if (value) {
        const err = codeValueError(v.code_format as CodeFormat, value);
        if (err) ctx.addIssue({ code: "custom", path: ["code_value"], message: err });
      }
    }
    if (v.for_travelers && v.traveler_ids.length === 0)
      ctx.addIssue({ code: "custom", path: ["traveler_ids"], message: "Choisissez au moins un voyageur" });
  })
  .transform((v): DocumentPatch => ({
    title: v.title,
    category: v.category,
    kind: v.kind,
    url: v.kind === "link" ? v.url.trim() : null,
    code_value: v.kind === "code" ? v.code_value.trim() : null,
    code_format: v.kind === "code" ? (v.code_format as CodeFormat) : null,
    scope: v.for_travelers ? "travelers" : "group",
    traveler_ids: v.for_travelers ? [...new Set(v.traveler_ids)].sort() : [],
    date: opt(v.date),
    transport_id: opt(v.transport_id),
    accommodation_id: opt(v.accommodation_id),
    notes: opt(v.notes),
  }));
