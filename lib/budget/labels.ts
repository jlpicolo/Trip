import type { ExpenseCategory, PersonalCategory, SplitMode } from "@/lib/types/budget";

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  transport: "Transport", accommodation: "Hébergement", food: "Repas", activities: "Activités", shopping: "Achats", other: "Autre",
};
export const PERSONAL_LABEL: Record<PersonalCategory, string> = {
  purchase: "Achat", food: "Repas", personal: "Personnel", souvenir: "Souvenir", transport: "Transport", other: "Autre",
};
export const SPLIT_LABEL: Record<SplitMode, string> = { equal: "Égal", shares: "Parts", percent: "%", exact: "Montants" };
