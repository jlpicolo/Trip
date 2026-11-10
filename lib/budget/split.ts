import { convertMinor, largestRemainder } from "./money";
import type { Share, SplitMode } from "@/lib/types/budget";

export interface SplitInput {
  mode: SplitMode;
  amountMinor: number;
  currency: string;
  baseCurrency: string;
  rate: number;
  /** Voyageurs concernés et leur valeur saisie (ignorée en mode égal). */
  participants: { user_id: string; value: number }[];
}

export type SplitResult = { ok: true; baseAmountMinor: number; shares: Share[] } | { ok: false; error: string };

/**
 * Calcule les parts en devise de base. La somme des `base_minor` vaut exactement le total
 * converti (contrôle également imposé par le serveur).
 */
export function computeSplit(input: SplitInput): SplitResult {
  const { mode, amountMinor, participants } = input;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { ok: false, error: "Montant invalide" };
  if (participants.length === 0) return { ok: false, error: "Choisissez au moins un voyageur" };
  const base = convertMinor(amountMinor, input.currency, input.baseCurrency, input.rate);
  const values = participants.map((p) => ({ id: p.user_id, weight: mode === "equal" ? 1 : p.value }));
  if (values.some((v) => !Number.isFinite(v.weight) || v.weight < 0)) return { ok: false, error: "Valeur de part invalide" };

  if (mode === "percent") {
    const total = values.reduce((s, v) => s + v.weight, 0);
    if (Math.abs(total - 100) > 1e-6) return { ok: false, error: `Les pourcentages font ${round2(total)} % au lieu de 100 %` };
  }
  if (mode === "exact") {
    if (values.some((v) => !Number.isInteger(v.weight))) return { ok: false, error: "Montant invalide" };
    const total = values.reduce((s, v) => s + v.weight, 0);
    if (total !== amountMinor) return { ok: false, error: "La somme des montants doit égaler le total" };
  }
  if (values.every((v) => v.weight === 0)) return { ok: false, error: "Toutes les parts sont nulles" };

  // Les voyageurs à part nulle restent listés (exclus du partage, mais visibles).
  const amounts = largestRemainder(base, values);
  return {
    ok: true,
    baseAmountMinor: base,
    shares: values.map((v) => ({ user_id: v.id, weight: v.weight, base_minor: amounts.get(v.id)! })),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
