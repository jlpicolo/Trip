import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { deletePersonal, expensesOfTrip, personalOfTrip, recordSettlement, saveExpense, savePersonal, settlementsOfTrip } from "@/lib/db/budget";
import { balances, settleUp } from "@/lib/budget/balances";
import { checkedLabel, effectiveRate, fetchEcbRate, FxOfflineError, rateAgeDays, rateLabel, rateToBase } from "@/lib/fx";
import { expenseSchema, personalSchema, type ExpenseForm } from "@/lib/validation/budget";
import type { KnownRate } from "@/lib/types/budget";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
const A = "10000000-0000-4000-8000-00000000000a";
const B = "10000000-0000-4000-8000-00000000000b";
const C = "10000000-0000-4000-8000-00000000000c";
const ecb: KnownRate = { base: "EUR", quote: "JPY", rate: 177.38, date: "2026-11-10", source: "ecb", fetched_at: "2026-11-10T09:00:00.000Z" };

describe("taux de change", () => {
  it("lit la réponse de Frankfurter (BCE) et refuse une réponse illisible", async () => {
    const ok = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    await expect(fetchEcbRate("EUR", "JPY", ok({ date: "2026-11-10", rates: { JPY: 177.38 } }), new Date("2026-11-10T09:00:00Z")))
      .resolves.toEqual(ecb);
    await expect(fetchEcbRate("EUR", "JPY", ok({ date: "2026-11-10", rates: {} }))).rejects.toThrow(/illisible/);
    const down = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(fetchEcbRate("EUR", "JPY", down)).rejects.toBeInstanceOf(FxOfflineError);
  });

  it("taux dans les deux sens, taux manuel prioritaire, libellé daté et « ancien »", () => {
    expect(rateToBase("JPY", "EUR", ecb)).toBeCloseTo(1 / 177.38, 10);
    expect(rateToBase("EUR", "JPY", ecb)).toBe(177.38);
    expect(rateToBase("EUR", "EUR", null)).toBe(1);
    expect(rateToBase("JPY", "EUR", null)).toBeNull();
    const manual = effectiveRate({ manual_fx_rate: { pair: "EUR/JPY", rate: 170, set_at: "2026-11-08T10:00:00Z" } }, "EUR", "JPY", ecb);
    expect(manual).toMatchObject({ rate: 170, source: "manual", date: "2026-11-08" });
    expect(effectiveRate({}, "EUR", "JPY", ecb)).toBe(ecb);
    const fmt = (iso: string) => iso;
    expect(rateLabel(ecb, "2026-11-12", fmt)).toBe("Taux de référence BCE du 2026-11-10");
    expect(rateLabel(ecb, "2026-11-20", fmt)).toMatch(/ancien/);
    expect(rateAgeDays(ecb, "2026-11-13")).toBe(3);
    // Taux de la veille vérifié aujourd'hui : on le dit, avec l'heure et la raison.
    const checked = { ...ecb, fetched_at: "2026-11-11T10:42:00.000Z" };
    expect(checkedLabel(checked, new Date("2026-11-11T12:00:00.000Z"), () => "11:42")).toMatch(/^Vérifié aujourd'hui à 11:42 · la BCE publie un seul taux par jour ouvré, vers 16 h/);
    expect(checkedLabel(checked, new Date("2026-11-14T12:00:00.000Z"), () => "x")).toMatch(/^Vérifié le 11 novembre/);
  });
});

describe("formulaire de dépense", () => {
  const form = (o: Partial<ExpenseForm> = {}): ExpenseForm => ({
    title: "Ramen", category: "food", date: "2027-03-10", amount: "4 800", currency: "JPY", rate: "0,0056377", paid_by: A, mode: "equal",
    participants: { [A]: { on: true, value: "" }, [B]: { on: true, value: "" }, [C]: { on: false, value: "" } }, notes: "", ...o,
  });
  const schema = expenseSchema({ baseCurrency: "EUR", members: [A, B, C] });

  it("dépense en yens : taux figé, parts en euros exactes", () => {
    const r = schema.parse(form());
    expect(r).toMatchObject({ amount_minor: 4800, currency: "JPY", fx_rate: 0.0056377, base_amount_minor: 2706, split_mode: "equal" });
    expect(r.shares.map((s) => s.base_minor)).toEqual([1353, 1353]);
  });

  it("refus clairs : yens décimaux, taux manquant, payeur inconnu, montants exacts incohérents", () => {
    const errs = (o: Partial<ExpenseForm>) => { const r = schema.safeParse(form(o)); return r.success ? [] : r.error.issues.map((i) => i.message); };
    expect(errs({ amount: "12,5" })).toEqual(["Montant invalide (yens entiers)"]);
    expect(errs({ rate: "" })).toEqual(["Taux invalide (ex. 0,0056)"]);
    expect(errs({ paid_by: "inconnu" })[0]).toBe("Choisissez qui a payé");
    expect(errs({ mode: "exact", participants: { [A]: { on: true, value: "1000" }, [B]: { on: true, value: "1000" } } })).toEqual(["La somme des montants doit égaler le total"]);
    expect(errs({ participants: {} })).toEqual(["Choisissez au moins un voyageur"]);
  });

  it("dépense personnelle : montant et taux vérifiés", () => {
    expect(personalSchema("EUR").parse({ title: "Furoshiki", category: "souvenir", date: "2027-03-12", amount: "2200", currency: "JPY", rate: "0,0056", notes: "" }))
      .toMatchObject({ amount_minor: 2200, fx_rate: 0.0056 });
    expect(personalSchema("EUR").safeParse({ title: "x", category: "souvenir", date: "2027-03-12", amount: "-3", currency: "EUR", rate: "", notes: "" }).success).toBe(false);
  });
});

describe("budget : données locales et synchro", () => {
  let server: FakeServer;
  const dbs: LocalDb[] = [];
  let n = 0;
  const device = (user: string) => {
    const db = new LocalDb(`budget-${++n}`);
    dbs.push(db);
    return { db, engine: new SyncEngine(db, server.remote(user)) };
  };
  beforeEach(() => {
    server = new FakeServer();
  });
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((d) => d.delete()));
  });

  it("dépense commune et remboursement synchronisés : mêmes soldes sur les deux appareils", async () => {
    const a = device("alice");
    const b = device("bruno");
    const schema = expenseSchema({ baseCurrency: "EUR", members: [A, B, C] });
    await saveExpense(a.engine, TRIP, schema.parse({
      title: "Hôtel", category: "accommodation", date: "2027-03-09", amount: "300", currency: "EUR", rate: "", paid_by: A, mode: "equal",
      participants: { [A]: { on: true, value: "" }, [B]: { on: true, value: "" }, [C]: { on: true, value: "" } }, notes: "",
    }));
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    const exp = await expensesOfTrip(b.db, TRIP);
    expect(Object.fromEntries(balances([A, B, C], exp, []))).toEqual({ [A]: 20000, [B]: -10000, [C]: -10000 });

    await recordSettlement(b.engine, TRIP, { from: B, to: A, amountMinor: 10000, currency: "EUR", date: "2027-03-10" });
    await b.engine.sync(TRIP);
    await a.engine.sync(TRIP);
    const bal = balances([A, B, C], await expensesOfTrip(a.db, TRIP), await settlementsOfTrip(a.db, TRIP));
    expect(Object.fromEntries(bal)).toEqual({ [A]: 10000, [B]: 0, [C]: -10000 });
    expect(settleUp(bal)).toEqual([{ from: C, to: A, amount: 10000 }]);
  });

  it("dépense personnelle : convertie, hors pot commun, modifiable par son seul auteur", async () => {
    const a = device("alice");
    const patch = personalSchema("EUR").parse({ title: "Furoshiki", category: "souvenir", date: "2027-03-12", amount: "2200", currency: "JPY", rate: "0,0056", notes: "" });
    await savePersonal(a.engine, TRIP, A, "EUR", patch);
    const [p] = await personalOfTrip(a.db, TRIP);
    expect(p).toMatchObject({ owner_id: A, base_amount_minor: 1232 });
    expect(await expensesOfTrip(a.db, TRIP)).toEqual([]);
    await expect(savePersonal(a.engine, TRIP, B, "EUR", patch, p)).rejects.toThrow(/Seul son auteur/);
    expect(() => deletePersonal(a.engine, p, B)).toThrow(/Seul son auteur/);
  });
});
