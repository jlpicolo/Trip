import { describe, expect, it } from "vitest";
import { convertMinor, largestRemainder } from "@/lib/budget/money";
import { computeSplit } from "@/lib/budget/split";
import { balances, settleUp, totalsByCategory } from "@/lib/budget/balances";

const A = "a-alice", B = "b-bruno", C = "c-chloe", D = "d-dimitri";
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("conversion", () => {
  it("JPY (sans décimale) → EUR (centimes) et inverse", () => {
    expect(convertMinor(1180, "JPY", "EUR", 1 / 177.38)).toBe(665); // 6,652… € → 6,65 €
    expect(convertMinor(1000, "EUR", "JPY", 177.38)).toBe(1774); // 10,00 € → 1 773,8 ¥ → 1 774 ¥
    expect(convertMinor(1250, "EUR", "EUR", 3)).toBe(1250);
  });
  it("arrondi au plus proche, jamais zéro pour un montant positif", () => {
    expect(convertMinor(1, "JPY", "EUR", 0.0056)).toBe(1);
    expect(convertMinor(150, "JPY", "EUR", 0.01)).toBe(150); // 1,50 € exactement, sans erreur de flottant
    expect(convertMinor(35, "EUR", "EUR", 1)).toBe(35);
  });
});

describe("plus fort reste", () => {
  it("la somme est toujours exacte", () => {
    for (const total of [1, 2, 7, 100, 1001, 999_999]) {
      const r = largestRemainder(total, [{ id: A, weight: 1 }, { id: B, weight: 1 }, { id: C, weight: 1 }]);
      expect(sum([...r.values()])).toBe(total);
    }
  });
  it("départage déterministe par identifiant (10 centimes à 3)", () => {
    const r = largestRemainder(10, [{ id: C, weight: 1 }, { id: A, weight: 1 }, { id: B, weight: 1 }]);
    expect([r.get(A), r.get(B), r.get(C)]).toEqual([4, 3, 3]);
  });
  it("refuse une répartition sans part", () => {
    expect(() => largestRemainder(10, [])).toThrow();
    expect(() => largestRemainder(10, [{ id: A, weight: 0 }])).toThrow();
  });
});

describe("modes de répartition", () => {
  const base = { amountMinor: 10000, currency: "EUR", baseCurrency: "EUR", rate: 1 };
  const four = [A, B, C, D].map((user_id) => ({ user_id, value: 0 }));

  it("parts égales : 100,00 € à 3 → 33,34 / 33,33 / 33,33", () => {
    const r = computeSplit({ ...base, mode: "equal", participants: four.slice(0, 3) });
    expect(r.ok && r.shares.map((s) => s.base_minor)).toEqual([3334, 3333, 3333]);
  });

  it("parts pondérées (2 parts pour un couple)", () => {
    const r = computeSplit({ ...base, mode: "shares", participants: [{ user_id: A, value: 2 }, { user_id: B, value: 1 }, { user_id: C, value: 1 }] });
    expect(r.ok && r.shares.map((s) => s.base_minor)).toEqual([5000, 2500, 2500]);
  });

  it("pourcentages : doivent faire 100 %", () => {
    expect(computeSplit({ ...base, mode: "percent", participants: [{ user_id: A, value: 60 }, { user_id: B, value: 30 }] }))
      .toEqual({ ok: false, error: "Les pourcentages font 90 % au lieu de 100 %" });
    const r = computeSplit({ ...base, amountMinor: 1001, mode: "percent", participants: [{ user_id: A, value: 33.33 }, { user_id: B, value: 33.33 }, { user_id: C, value: 33.34 }] });
    expect(r.ok && sum(r.shares.map((s) => s.base_minor))).toBe(1001);
  });

  it("montants exacts en yens, convertis en euros sans perdre un centime", () => {
    const r = computeSplit({
      mode: "exact", amountMinor: 5980, currency: "JPY", baseCurrency: "EUR", rate: 1 / 177.38,
      participants: [{ user_id: A, value: 1180 }, { user_id: B, value: 2400 }, { user_id: C, value: 2400 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.baseAmountMinor).toBe(3371);
    expect(sum(r.shares.map((s) => s.base_minor))).toBe(3371);
    expect(r.shares[1].base_minor).toBe(r.shares[2].base_minor);
    expect(computeSplit({ ...base, mode: "exact", participants: [{ user_id: A, value: 5000 }, { user_id: B, value: 4000 }] }).ok).toBe(false);
  });

  it("cas limites : 1 centime, montant nul, aucun voyageur, parts nulles", () => {
    const r = computeSplit({ ...base, amountMinor: 1, mode: "equal", participants: four });
    expect(r.ok && r.shares.map((s) => s.base_minor)).toEqual([1, 0, 0, 0]);
    expect(computeSplit({ ...base, amountMinor: 0, mode: "equal", participants: four }).ok).toBe(false);
    expect(computeSplit({ ...base, mode: "equal", participants: [] }).ok).toBe(false);
    expect(computeSplit({ ...base, mode: "shares", participants: [{ user_id: A, value: 0 }] }).ok).toBe(false);
    expect(computeSplit({ ...base, mode: "shares", participants: [{ user_id: A, value: -1 }] }).ok).toBe(false);
  });

  it("1 ¥ partagé à 4 en euros : 1 centime minimum, attribué de façon déterministe", () => {
    const r = computeSplit({ mode: "equal", amountMinor: 1, currency: "JPY", baseCurrency: "EUR", rate: 0.0056, participants: four });
    expect(r.ok && r.baseAmountMinor).toBe(1);
    expect(r.ok && r.shares.find((s) => s.base_minor === 1)?.user_id).toBe(A);
  });

  it("devise de base en yens : jamais de fraction de yen", () => {
    const r = computeSplit({ mode: "equal", amountMinor: 1999, currency: "EUR", baseCurrency: "JPY", rate: 177.38, participants: four.slice(0, 3) });
    expect(r.ok && r.baseAmountMinor).toBe(3546);
    expect(r.ok && r.shares.every((s) => Number.isInteger(s.base_minor))).toBe(true);
    expect(r.ok && sum(r.shares.map((s) => s.base_minor))).toBe(3546);
  });
});

describe("soldes et remboursements", () => {
  it("soldes : payé − dû, remboursements compris ; somme nulle", () => {
    const exp = [
      { paid_by: A, base_amount_minor: 9000, shares: [{ user_id: A, weight: 1, base_minor: 3000 }, { user_id: B, weight: 1, base_minor: 3000 }, { user_id: C, weight: 1, base_minor: 3000 }] },
      { paid_by: B, base_amount_minor: 3000, shares: [{ user_id: A, weight: 1, base_minor: 1500 }, { user_id: B, weight: 1, base_minor: 1500 }] },
    ];
    const bal = balances([A, B, C, D], exp, [{ from_user: C, to_user: A, base_amount_minor: 1000 }]);
    expect(Object.fromEntries(bal)).toEqual({ [A]: 3500, [B]: -1500, [C]: -2000, [D]: 0 });
    expect(sum([...bal.values()])).toBe(0);
  });

  it("nombre minimal de virements (2 sous-groupes indépendants → 2 virements, pas 3)", () => {
    const bal = new Map([[A, 500], [B, -500], [C, 300], [D, -300]]);
    expect(settleUp(bal)).toEqual([{ from: B, to: A, amount: 500 }, { from: D, to: C, amount: 300 }]);
  });

  it("remboursements : soldent exactement tous les comptes", () => {
    const bal = new Map([[A, 4123], [B, -1000], [C, -2500], [D, -623]]);
    const t = settleUp(bal);
    expect(t).toHaveLength(3);
    const after = new Map(bal);
    for (const x of t) {
      after.set(x.from, after.get(x.from)! + x.amount);
      after.set(x.to, after.get(x.to)! - x.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
    expect(settleUp(new Map([[A, 0], [B, 0]]))).toEqual([]);
  });

  it("au-delà de 12 personnes : glouton, comptes soldés", () => {
    const bal = new Map(Array.from({ length: 14 }, (_, i) => [`u${String(i).padStart(2, "0")}`, i < 7 ? 100 * (i + 1) : -100 * (i - 6)] as [string, number]));
    const t = settleUp(bal);
    const after = new Map(bal);
    for (const x of t) {
      after.set(x.from, after.get(x.from)! + x.amount);
      after.set(x.to, after.get(x.to)! - x.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it("totaux par catégorie", () => {
    expect(Object.fromEntries(totalsByCategory([{ category: "food", base_amount_minor: 100 }, { category: "food", base_amount_minor: 50 }, { category: "transport", base_amount_minor: 7 }])))
      .toEqual({ food: 150, transport: 7 });
  });
});
