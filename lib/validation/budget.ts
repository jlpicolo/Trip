import { z } from "zod";
import { parseAmountToMinor } from "@/lib/money";
import { computeSplit } from "@/lib/budget/split";
import { EXPENSE_CATEGORIES, PERSONAL_CATEGORIES, SPLIT_MODES, type Share, type SplitMode } from "@/lib/types/budget";
import type { ExpensePatch, PersonalPatch } from "@/lib/db/budget";

export interface ExpenseForm {
  title: string;
  category: string;
  date: string;
  amount: string;
  currency: string;
  rate: string;
  paid_by: string;
  mode: string;
  participants: Record<string, { on: boolean; value: string }>;
  notes: string;
}

/** « 177,38 » → 177.38 ; null si invalide ou non positif. */
export function parseRate(input: string): number | null {
  const s = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 1e9 ? n : null;
}

/** Valeur d'une part selon le mode (montant exact en unités mineures). */
export function shareValue(mode: SplitMode, input: string, currency: string): number | null {
  if (mode === "equal") return 1;
  if (mode === "exact") return input.trim() === "" ? 0 : parseAmountToMinor(input, currency);
  const s = input.replace(/\s/g, "").replace(",", ".");
  if (s === "") return 0;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date requise");
const currency = z.string().regex(/^[A-Z]{3}$/, "Devise invalide");

export function expenseSchema(ctx: { baseCurrency: string; members: string[] }) {
  return z
    .object({
      title: z.string().trim().min(1, "Libellé requis").max(160, "160 caractères maximum"),
      category: z.enum(EXPENSE_CATEGORIES, { message: "Catégorie inconnue" }),
      date: isoDate,
      amount: z.string(),
      currency,
      rate: z.string(),
      paid_by: z.string().refine((id) => ctx.members.includes(id), "Choisissez qui a payé"),
      mode: z.enum(SPLIT_MODES, { message: "Mode de répartition inconnu" }),
      participants: z.record(z.string(), z.object({ on: z.boolean(), value: z.string() })),
      notes: z.string().max(10000),
    })
    .transform((v, c): ExpensePatch => {
      const amount = parseAmountToMinor(v.amount, v.currency);
      if (amount === null || amount <= 0) {
        c.addIssue({ code: "custom", path: ["amount"], message: v.currency === "JPY" ? "Montant invalide (yens entiers)" : "Montant invalide (ex. 12,50)" });
        return z.NEVER;
      }
      const rate = v.currency === ctx.baseCurrency ? 1 : parseRate(v.rate);
      if (rate === null) {
        c.addIssue({ code: "custom", path: ["rate"], message: "Taux invalide (ex. 0,0056)" });
        return z.NEVER;
      }
      const mode = v.mode as SplitMode;
      const chosen = ctx.members.filter((id) => v.participants[id]?.on);
      const participants: { user_id: string; value: number }[] = [];
      for (const id of chosen) {
        const value = shareValue(mode, v.participants[id].value, v.currency);
        if (value === null) {
          c.addIssue({ code: "custom", path: ["participants"], message: "Une des valeurs saisies est invalide" });
          return z.NEVER;
        }
        participants.push({ user_id: id, value });
      }
      const split = computeSplit({ mode, amountMinor: amount, currency: v.currency, baseCurrency: ctx.baseCurrency, rate, participants });
      if (!split.ok) {
        c.addIssue({ code: "custom", path: ["participants"], message: split.error });
        return z.NEVER;
      }
      return {
        title: v.title, category: v.category, date: v.date, amount_minor: amount, currency: v.currency, fx_rate: rate,
        base_amount_minor: split.baseAmountMinor, paid_by: v.paid_by, split_mode: mode, shares: split.shares as Share[],
        notes: v.notes.trim() || null,
      };
    });
}

export interface PersonalForm {
  title: string;
  category: string;
  date: string;
  amount: string;
  currency: string;
  rate: string;
  notes: string;
}

export function personalSchema(baseCurrency: string) {
  return z
    .object({
      title: z.string().trim().min(1, "Libellé requis").max(160, "160 caractères maximum"),
      category: z.enum(PERSONAL_CATEGORIES, { message: "Catégorie inconnue" }),
      date: isoDate,
      amount: z.string(),
      currency,
      rate: z.string(),
      notes: z.string().max(10000),
    })
    .transform((v, c): PersonalPatch => {
      const amount = parseAmountToMinor(v.amount, v.currency);
      if (amount === null || amount <= 0) {
        c.addIssue({ code: "custom", path: ["amount"], message: "Montant invalide" });
        return z.NEVER;
      }
      const rate = v.currency === baseCurrency ? 1 : parseRate(v.rate);
      if (rate === null) {
        c.addIssue({ code: "custom", path: ["rate"], message: "Taux invalide (ex. 0,0056)" });
        return z.NEVER;
      }
      return { title: v.title, category: v.category as PersonalPatch["category"], date: v.date, amount_minor: amount, currency: v.currency, fx_rate: rate, notes: v.notes.trim() || null };
    });
}
