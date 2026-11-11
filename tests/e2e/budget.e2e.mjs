/**
 * Budget dans Chromium contre le VRAI Supabase (contrôle serveur des parts) et le vrai taux BCE
 * (Frankfurter). Prérequis : app démarrée en production. Lancement : npm run test:e2e
 */
import assert from "node:assert/strict";
import { BASE, SHOTS, admin, assertNoHorizontalScroll, cleanup, createTraveler, createTrip, eventually, launch, login, stepper } from "./helpers.mjs";

const users = [];
let trip;
let browser;
try {
  const alice = await createTraveler("Alice");
  const bruno = await createTraveler("Bruno");
  const chloe = await createTraveler("Chloe");
  users.push(alice, bruno, chloe);
  trip = await createTrip(users);

  const env = await launch();
  browser = env.browser;
  const a = await (await browser.newContext(env.mobile)).newPage();
  const b = await (await browser.newContext(env.mobile)).newPage();
  const { step, done } = stepper({ alice: a, bruno: b });
  const dlg = (p) => p.getByRole("dialog");
  const dbExpenses = async () => (await admin.from("expenses").select("*").eq("trip_id", trip.tripId).is("deleted_at", null)).data;
  const balanceOf = (p, who) => p.getByRole("list", { name: "Solde de chaque voyageur" }).getByRole("listitem").filter({ hasText: who });

  async function openForm(p) {
    await p.getByRole("button", { name: "Dépense", exact: true }).click();
    return dlg(p);
  }

  await step("budget vide : explication, aucun chiffre inventé", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/budget`);
    await a.getByText("Aucune dépense commune").waitFor();
  });

  await step("dépense en yens à parts égales : taux BCE prérempli et figé, accepté par le serveur", async () => {
    const d = await openForm(a);
    await d.getByLabel("Libellé").fill("Ramen Ichiran");
    await d.getByLabel("Montant", { exact: true }).fill("4800");
    const rate = await eventually(async () => {
      const r = await d.getByLabel("Taux : 1 JPY = … EUR").inputValue();
      assert.ok(r);
      return r;
    }, { timeout: 15_000 });
    assert.match(rate, /^0,00\d+$/, `taux prérempli depuis la BCE (${rate})`);
    await d.getByRole("checkbox", { name: "Chloe" }).uncheck();
    await d.getByRole("button", { name: "Ajouter la dépense" }).click();
    await d.getByText("Payé par").waitFor();
    await d.getByText(/au taux figé de 1 JPY/).waitFor();
    await eventually(async () => {
      const [e] = await dbExpenses();
      assert.equal(e?.amount_minor, 4800);
      assert.equal(e.shares.length, 2);
      assert.equal(e.shares.reduce((s, x) => s + x.base_minor, 0), e.base_amount_minor);
    });
    await dlg(a).getByRole("button", { name: "Fermer" }).first().click();
  });

  await step("pourcentages payés par Bruno : contrôle des 100 %, puis enregistrement", async () => {
    const d = await openForm(a);
    await d.getByLabel("Libellé").fill("Hôtel Kyoto");
    await d.getByLabel("Devise").selectOption("EUR");
    await d.getByLabel("Montant", { exact: true }).fill("90");
    await d.getByLabel("Payé par").selectOption({ label: "Bruno" });
    await d.getByText("%", { exact: true }).click();
    await d.getByLabel("% de Alice").fill("50");
    await d.getByLabel("% de Bruno").fill("25");
    await d.getByLabel("% de Chloe").fill("20");
    await d.getByText("Les pourcentages font 95 % au lieu de 100 %").first().waitFor();
    await d.getByLabel("% de Chloe").fill("25");
    await d.getByRole("button", { name: "Ajouter la dépense" }).click();
    await d.getByText("Répartition · %").waitFor();
    await eventually(async () => {
      const e = (await dbExpenses()).find((x) => x.title === "Hôtel Kyoto");
      assert.equal(e?.split_mode, "percent");
      assert.deepEqual(e.shares.map((s) => s.base_minor).sort((x, y) => y - x), [4500, 2250, 2250]);
    });
    await dlg(a).getByRole("button", { name: "Fermer" }).first().click();
  });

  await step("soldes et remboursements suggérés cohérents, sans débordement", async () => {
    const [ramen] = (await dbExpenses()).filter((x) => x.title === "Ramen Ichiran");
    const half = ramen.base_amount_minor / 2;
    // Alice : payé ramen − sa moitié − 45 € d'hôtel ; Bruno : 90 − 22,50 − moitié ramen ; Chloé : −22,50.
    const expected = { Alice: ramen.base_amount_minor - half - 4500, Bruno: 9000 - 2250 - half, Chloe: -2250 };
    const fmt = (v) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", currencyDisplay: "narrowSymbol" }).format(v / 100);
    for (const [who, v] of Object.entries(expected)) await balanceOf(a, who).getByText(fmt(Math.abs(v)).replace("-", "")).first().waitFor();
    await a.getByText(/Chloe doit/).waitFor();
    await assertNoHorizontalScroll(a, "budget");
    await a.screenshot({ path: `${SHOTS}/budget.png`, fullPage: true });
  });

  await step("remboursement marqué payé : soldes mis à jour, enregistré sur le serveur", async () => {
    await a.getByRole("button", { name: /Marquer le remboursement de Chloe/ }).first().click();
    await dlg(a).getByRole("button", { name: "Enregistrer le remboursement" }).click();
    await a.getByText("Remboursements effectués").waitFor();
    await eventually(async () => {
      const { data } = await admin.from("settlements").select("*").eq("trip_id", trip.tripId);
      assert.equal(data.length, 1);
      assert.equal(data[0].amount_minor, 2250);
    });
    await balanceOf(a, "Chloe").getByText(/^0,00/).waitFor();
  });

  await step("montants exacts : la somme doit égaler le total", async () => {
    const d = await openForm(a);
    await d.getByLabel("Libellé").fill("Taxi");
    await d.getByLabel("Montant", { exact: true }).fill("3000");
    await d.getByText("Montants", { exact: true }).click();
    await d.getByLabel("Montants de Alice").fill("1000");
    await d.getByLabel("Montants de Bruno").fill("1000");
    await d.getByLabel("Montants de Chloe").fill("500");
    await d.getByRole("button", { name: "Ajouter la dépense" }).click();
    await d.getByText("La somme des montants doit égaler le total").first().waitFor();
    await d.getByLabel("Montants de Chloe").fill("1000");
    await d.getByRole("button", { name: "Ajouter la dépense" }).click();
    await d.getByText("Répartition · Montants").waitFor();
    await dlg(a).getByRole("button", { name: "Fermer" }).first().click();
  });

  await step("Bruno voit le même total et les mêmes soldes", async () => {
    // Synchro sans interrogation permanente : on attend que la dépense d'Alice soit arrivée au serveur.
    await eventually(async () => assert.ok((await dbExpenses()).some((x) => x.title === "Taxi"), "Taxi envoyé"));
    await login(b, bruno);
    await b.goto(`${BASE}/budget`);
    await b.getByRole("button", { name: "Ouvrir « Taxi »" }).waitFor({ timeout: 30_000 });
    const totalA = await a.getByText("Total du pot commun").locator("..").innerText();
    await b.getByText(totalA.split("\n").pop().trim()).first().waitFor();
  });

  await step("dépense personnelle : hors pot commun, invisible dans « Mes dépenses » des autres", async () => {
    await a.getByRole("tab", { name: "Mes dépenses" }).click();
    await a.getByRole("button", { name: "Dépense perso" }).click();
    const d = dlg(a);
    await d.getByLabel("Libellé").fill("Furoshiki");
    await d.getByLabel("Montant", { exact: true }).fill("2200");
    await d.getByRole("button", { name: "Ajouter" }).click();
    await a.getByRole("button", { name: "Modifier « Furoshiki »" }).waitFor();
    await eventually(async () => {
      const { data } = await admin.from("personal_expenses").select("owner_id,amount_minor").eq("trip_id", trip.tripId);
      assert.deepEqual(data, [{ owner_id: alice.id, amount_minor: 2200 }]);
    });
    await b.getByRole("tab", { name: "Mes dépenses" }).click();
    await b.getByText("Aucune dépense personnelle").waitFor();
  });

  await step("convertisseur : taux BCE daté, conversion, taux manuel partagé", async () => {
    await a.getByRole("tab", { name: "Convertisseur" }).click();
    await a.getByText(/Taux de référence BCE du/).waitFor();
    await a.getByRole("button", { name: "Mettre à jour (BCE)" }).click();
    await a.getByText(/^Vérifié aujourd'hui à \d{2}:\d{2} · la BCE publie un seul taux par jour ouvré/).waitFor();
    await a.getByLabel("Montant en JPY").fill("10000");
    await a.getByText(/^\d+,\d{2}\s€$/).waitFor();
    await a.getByText("Taux manuel (partagé avec le groupe)").click();
    await a.getByLabel("1 EUR = … JPY").fill("160");
    await a.getByRole("button", { name: "Appliquer" }).click();
    await a.getByText(/Taux manuel saisi le/).waitFor();
    await a.getByText("62,50 €").waitFor();
    await a.getByRole("button", { name: "Revenir au taux BCE" }).click();
    await a.getByText(/Taux de référence BCE du/).waitFor();
  });

  await step("accueil : résumé du budget (total et solde personnel)", async () => {
    await a.goto(`${BASE}/accueil`);
    const card = a.getByRole("link", { name: "Budget" });
    await card.getByText(/Pot commun :/).waitFor({ timeout: 20_000 });
    await card.getByText(/Vous devez|On vous doit|Vous êtes à jour/).waitFor();
  });

  console.log(`\nBudget : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
