import { currencyDigits } from "@/lib/money";

/**
 * Conversion en unités mineures avec un taux « 1 unité de from = rate unités de to ».
 * Arrondi au plus proche (demi vers le haut) ; le résultat d'un montant positif est au moins 1.
 */
export function convertMinor(amountMinor: number, from: string, to: string, rate: number): number {
  if (from === to) return amountMinor;
  const scale = 10 ** (currencyDigits(to) - currencyDigits(from));
  // Correction de flottant : 0,1 + 0,2 ≠ 0,3 ; on arrondit à 1e-6 près avant l'arrondi final.
  const exact = Math.round(amountMinor * rate * scale * 1e6) / 1e6;
  return Math.max(1, Math.round(exact));
}

/**
 * Répartition au plus fort reste : la somme des parts vaut exactement `total`. Les restes égaux
 * sont départagés par identifiant, pour que les 4 téléphones calculent les mêmes centimes.
 */
export function largestRemainder(total: number, items: { id: string; weight: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const sum = items.reduce((s, i) => s + i.weight, 0);
  if (sum <= 0 || items.length === 0) throw new Error("Répartition impossible : aucune part");
  let given = 0;
  const rest: { id: string; frac: number }[] = [];
  for (const i of items) {
    const exact = (total * i.weight) / sum;
    const floor = Math.floor(exact + 1e-9);
    out.set(i.id, floor);
    given += floor;
    rest.push({ id: i.id, frac: exact - floor });
  }
  rest.sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id));
  for (let k = 0; given < total; k++, given++) {
    const id = rest[k % rest.length].id;
    out.set(id, out.get(id)! + 1);
  }
  return out;
}
