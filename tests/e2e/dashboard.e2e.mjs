/**
 * Accueil dans Chromium contre le VRAI Supabase : aucun chiffre inventé quand le voyage est vide,
 * puis prochain trajet + billet en un geste, hébergement, préparation, favoris.
 */
import assert from "node:assert/strict";
import { BASE, SHOTS, admin, assertNoHorizontalScroll, cleanup, createTraveler, createTrip, launch, login, stepper } from "./helpers.mjs";

const users = [];
let trip;
let browser;
try {
  const alice = await createTraveler("Alice");
  users.push(alice);
  trip = await createTrip(users);
  const ins = async (table, row) => {
    const { error } = await admin.from(table).insert({ id: crypto.randomUUID(), trip_id: trip.tripId, ...row });
    if (error) throw new Error(`${table}: ${error.message}`);
  };

  const env = await launch();
  browser = env.browser;
  const a = await (await browser.newContext(env.mobile)).newPage();
  const { step, done } = stepper({ alice: a });
  const prep = (label) => a.getByRole("link", { name: new RegExp(label) });

  await step("voyage vide : compteurs à zéro, aucun contenu inventé", async () => {
    await login(a, alice);
    await a.getByText("Aucun trajet à venir").waitFor();
    await a.getByText("Aucun hébergement à venir").waitFor();
    await prep("Journées prévues").filter({ hasText: /0\s*\/22/ }).waitFor();
    await prep("Nuits réservées").filter({ hasText: /0\s*\/21/ }).waitFor();
    await prep("Incontournables à planifier").filter({ hasText: /0$/ }).waitFor();
    assert.equal(await a.getByRole("heading", { name: "Lieux favoris" }).count(), 0);
  });

  await step("données réelles : prochain trajet, billet en un geste, hôtel, préparation, favoris", async () => {
    const transportId = crypto.randomUUID();
    const { error } = await admin.from("transports").insert({ id: transportId, trip_id: trip.tripId, kind: "plane", carrier: "JAL", reference: "JL46",
      departure_date: "2027-03-09", departure_time: "10:05", departure_name: "Paris", arrival_name: "Osaka" });
    if (error) throw error;
    await ins("documents", { title: "Carte d'embarquement", category: "flight", kind: "code", code_value: "M1ALICE/JL46", code_format: "pdf417", transport_id: transportId });
    await ins("accommodations", { name: "Cross Hotel Osaka", city: "Osaka", check_in_date: "2027-03-09", check_out_date: "2027-03-12", check_in_time: "15:00" });
    await ins("activities", { title: "Dōtonbori", date: "2027-03-09", sort_key: 1024, category: "visit" });
    await ins("journal_entries", { title: "Okonomiyaki Mizuno", category: "food", priority: 1 });
    await ins("places", { name: "Fushimi Inari", category: "monument", lat: 34.9671, lng: 135.7727, is_favorite: true });
    await a.reload();
    await a.getByText("JAL JL46 · Paris → Osaka").waitFor({ timeout: 30_000 });
    await a.getByRole("link", { name: /Prochain hébergement/ }).getByText("Cross Hotel Osaka").waitFor();
    await prep("Journées prévues").filter({ hasText: /1\s*\/22/ }).waitFor();
    await prep("Nuits réservées").filter({ hasText: /3\s*\/21/ }).waitFor();
    await prep("Trajets enregistrés").filter({ hasText: /1$/ }).waitFor();
    await prep("Incontournables à planifier").getByText("Okonomiyaki Mizuno").waitFor();
    await a.getByRole("link", { name: "Fushimi Inari" }).waitFor();
    await assertNoHorizontalScroll(a, "accueil");
    await a.screenshot({ path: `${SHOTS}/accueil-complet.png`, fullPage: true });
  });

  await step("« Afficher le billet » ouvre le code en plein écran", async () => {
    await a.getByRole("button", { name: "Afficher le billet" }).click();
    const full = a.getByRole("dialog", { name: "Billet plein écran : Carte d'embarquement" });
    await full.getByRole("img", { name: "Code de « Carte d'embarquement »" }).waitFor();
    await full.getByText("JAL JL46 · Paris → Osaka").waitFor();
    await full.getByRole("button", { name: "Fermer" }).click();
  });

  await step("les cartes mènent au trajet et à l'hôtel", async () => {
    await a.getByRole("link", { name: /Prochain trajet/ }).click();
    await a.waitForURL(/\/billets\?trajet=/);
    await a.getByRole("dialog").getByRole("heading", { name: "JAL JL46 · Paris → Osaka" }).waitFor();
    await a.goto(`${BASE}/accueil`);
    await a.getByRole("link", { name: /Prochain hébergement/ }).click();
    await a.waitForURL(/\/hebergements\?sejour=/);
    await a.getByRole("dialog").getByRole("heading", { name: "Cross Hotel Osaka" }).waitFor();
  });

  console.log(`\nAccueil : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
