import type { Expense, Settlement } from "@/lib/types/budget";

/**
 * Solde de chacun en devise de base : positif = on lui doit, négatif = il doit.
 * Un remboursement effectué augmente le solde de celui qui paie et diminue celui de qui reçoit.
 */
export function balances(members: string[], expenses: Pick<Expense, "paid_by" | "base_amount_minor" | "shares">[],
  settlements: Pick<Settlement, "from_user" | "to_user" | "base_amount_minor">[]): Map<string, number> {
  const out = new Map(members.map((m) => [m, 0]));
  const add = (id: string, v: number) => out.set(id, (out.get(id) ?? 0) + v);
  for (const e of expenses) {
    add(e.paid_by, e.base_amount_minor);
    for (const s of e.shares) add(s.user_id, -s.base_minor);
  }
  for (const s of settlements) {
    add(s.from_user, s.base_amount_minor);
    add(s.to_user, -s.base_amount_minor);
  }
  return out;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Remboursements suggérés, en nombre minimal de virements : pour ≤ 12 personnes, on cherche le
 * découpage du groupe en un maximum de sous-groupes à somme nulle (n − k virements). Au-delà,
 * algorithme glouton. Résultat déterministe (tri par identifiant) sur tous les appareils.
 */
export function settleUp(bal: Map<string, number>): Transfer[] {
  const people = [...bal.entries()].filter(([, v]) => v !== 0).sort((a, b) => a[0].localeCompare(b[0]));
  if (people.length === 0) return [];
  if (people.length > 12) return greedy(people);
  const n = people.length;
  const full = (1 << n) - 1;
  const sum = new Array<number>(1 << n).fill(0);
  for (let m = 1; m <= full; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low] + people[31 - Math.clz32(low)][1];
  }
  // best[m] = nombre max de sous-groupes à somme nulle partitionnant m (m de somme nulle).
  const best = new Array<number>(1 << n).fill(-1);
  const choice = new Array<number>(1 << n).fill(0);
  best[0] = 0;
  for (let m = 1; m <= full; m++) {
    if (sum[m] !== 0) continue;
    const low = m & -m;
    // Le sous-groupe contenant le plus petit élément de m, parcouru parmi les sous-ensembles de m.
    for (let s = m; s; s = (s - 1) & m) {
      if (!(s & low) || sum[s] !== 0 || best[m ^ s] < 0) continue;
      if (best[m ^ s] + 1 > best[m]) {
        best[m] = best[m ^ s] + 1;
        choice[m] = s;
      }
    }
  }
  const out: Transfer[] = [];
  for (let m = full; m; m ^= choice[m]) {
    const group = people.filter((_, i) => choice[m] & (1 << i));
    out.push(...greedy(group));
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

function greedy(people: [string, number][]): Transfer[] {
  const debtors = people.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = people.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const order = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(order);
    creditors.sort(order);
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, amount });
    d.v -= amount;
    c.v -= amount;
    if (d.v === 0) debtors.shift();
    if (c.v === 0) creditors.shift();
  }
  return out;
}

/** Totaux par catégorie (devise de base), pour le résumé. */
export function totalsByCategory<T extends { category: string; base_amount_minor: number }>(rows: T[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.category, (out.get(r.category) ?? 0) + r.base_amount_minor);
  return out;
}
