import type { SyncedRow } from "./sync";

export const EXPENSE_CATEGORIES = ["transport", "accommodation", "food", "activities", "shopping", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const PERSONAL_CATEGORIES = ["purchase", "food", "personal", "souvenir", "transport", "other"] as const;
export type PersonalCategory = (typeof PERSONAL_CATEGORIES)[number];
export const SPLIT_MODES = ["equal", "shares", "percent", "exact"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/**
 * Part d'un voyageur. `weight` : 1 (égal), nombre de parts, pourcentage, ou montant saisi en
 * unités mineures de la devise de la dépense (exact). `base_minor` : sa part en devise de base.
 */
export type Share = {
  user_id: string;
  weight: number;
  base_minor: number;
};

export interface Expense extends SyncedRow {
  trip_id: string;
  title: string;
  category: ExpenseCategory;
  date: string;
  amount_minor: number;
  currency: string;
  /** 1 unité (majeure) de `currency` = fx_rate unités (majeures) de la devise de base, figé à la saisie. */
  fx_rate: number;
  base_amount_minor: number;
  paid_by: string;
  split_mode: SplitMode;
  shares: Share[];
  notes: string | null;
}

export interface Settlement extends SyncedRow {
  trip_id: string;
  from_user: string;
  to_user: string;
  amount_minor: number;
  currency: string;
  fx_rate: number;
  base_amount_minor: number;
  date: string;
  notes: string | null;
}

export interface PersonalExpense extends SyncedRow {
  trip_id: string;
  owner_id: string;
  title: string;
  category: PersonalCategory;
  date: string;
  amount_minor: number;
  currency: string;
  fx_rate: number;
  base_amount_minor: number;
  notes: string | null;
}

/** Taux connu : référence BCE (avec sa date de publication) ou saisi à la main. */
export interface KnownRate {
  base: string;
  quote: string;
  /** 1 unité de `base` = rate unités de `quote`. */
  rate: number;
  date: string;
  source: "ecb" | "manual";
  fetched_at: string;
}
