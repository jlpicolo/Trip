/**
 * Hébergements dans Chromium contre le VRAI Supabase : nuits, contrôle des nuits manquantes,
 * confirmations, carte et planning. Prérequis : app démarrée. Lancement : npm run test:e2e
 */
import assert from "node:assert/strict";
import { BASE, SHOTS, admin, assertNoHorizontalScroll, cleanup, createTraveler, createTrip, eventually, launch, login, stepper } from "./helpers.mjs";

const users = [];
let trip;
let browser;
try {
  const alice = await createTraveler("Alice");
  const bruno = await createTraveler("Bruno");
  users.push(alice, bruno);
  trip = await createTrip(users);

  const env = await launch();
  browser = env.browser;
  const a = await (await browser.newContext(env.mobile)).newPage();
  const b = await (await browser.newContext(env.mobile)).newPage();
  const { step, done } = stepper({ alice: a, bruno: b });
  const dlg = (p) => p.getByRole("dialog");
  const close = (p) => dlg(p).getByRole("button", { name: "Fermer" }).first().click();
  const dbStays = async () => (await admin.from("accommodations").select("*").eq("trip_id", trip.tripId).is("deleted_at", null)).data;

  async function addStay(p, { name, city, inDate, outDate, inTime, outTime, coords, addressLocal }) {
    await p.getByRole("button", { name: "Hébergement", exact: true }).click();
    const d = dlg(p);
    await d.getByLabel("Nom de l'hébergement").fill(name);
    await d.getByLabel("Ville").fill(city);
    await d.getByLabel("Arrivée").selectOption(inDate);
    await d.getByLabel("Départ").selectOption(outDate);
    if (inTime) await d.getByLabel("Dès").fill(inTime);
    if (outTime) await d.getByLabel("Avant").fill(outTime);
    if (coords) await d.getByLabel("Coordonnées GPS").fill(coords);
    if (addressLocal) await d.getByLabel("Adresse en japonais (pour le taxi)").fill(addressLocal);
    await d.getByRole("button", { name: "Ajouter l'hébergement" }).click();
    await d.getByRole("heading", { name }).waitFor();
  }

  await step("état vide honnête", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/hebergements`);
    await a.getByText("Aucun hébergement pour l'instant").waitFor();
  });

  await step("ajout d'un hôtel : nuits calculées, adresse pour le taxi, point sur la carte", async () => {
    await a.getByRole("button", { name: "Hébergement", exact: true }).click();
    const d = dlg(a);
    await d.getByLabel("Arrivée").selectOption("2027-03-09");
    await d.getByLabel("Départ").selectOption("2027-03-12");
    await d.getByText("3 nuits").waitFor();
    await d.getByRole("button", { name: "Ajouter l'hébergement" }).click();
    await d.getByText("Nom requis").waitFor();
    await close(a);
    await addStay(a, { name: "Cross Hotel Osaka", city: "Osaka", inDate: "2027-03-09", outDate: "2027-03-12", inTime: "15:00", outTime: "11:00",
      coords: "34.6698, 135.5015", addressLocal: "大阪市中央区心斎橋筋2-5-15" });
    await dlg(a).getByText("大阪市中央区心斎橋筋2-5-15").waitFor();
    await dlg(a).getByRole("link", { name: "Itinéraire (Google)" }).waitFor();
    await eventually(async () => {
      const [row] = await dbStays();
      assert.equal(row?.nights, 3, "nuits calculées par le serveur");
      const { data: place } = await admin.from("places").select("category,lat").eq("id", row.place_id).single();
      assert.deepEqual(place, { category: "hotel", lat: 34.6698 });
    });
  });

  await step("nuits sans hébergement signalées, puis couvertes", async () => {
    await close(a);
    await a.getByText("18 nuits sans hébergement").waitFor();
    await a.getByText("3 nuits réservées sur 21").waitFor();
    await addStay(a, { name: "Hotel Gracery Kyoto", city: "Kyoto", inDate: "2027-03-12", outDate: "2027-03-30", inTime: "14:00" });
    await close(a);
    await a.getByText("21 nuits réservées sur 21").waitFor();
    assert.equal(await a.getByText(/sans hébergement/).count(), 0);
  });

  await step("chevauchement signalé (groupe séparé ou erreur), puis supprimé", async () => {
    await addStay(a, { name: "Ryokan Hakone", city: "Hakone", inDate: "2027-03-20", outDate: "2027-03-21" });
    await close(a);
    await a.getByText("Plusieurs hébergements la même nuit").waitFor();
    await a.getByRole("button", { name: "Ouvrir « Ryokan Hakone »" }).click();
    await dlg(a).getByRole("button", { name: "Supprimer", exact: true }).click();
    await dlg(a).getByRole("button", { name: /Confirmer/ }).click();
    await a.getByRole("button", { name: "Ouvrir « Ryokan Hakone »" }).waitFor({ state: "detached" });
    assert.equal(await a.getByText("Plusieurs hébergements la même nuit").count(), 0);
    await assertNoHorizontalScroll(a, "hébergements");
    await a.screenshot({ path: `${SHOTS}/hebergements.png`, fullPage: true });
  });

  await step("confirmation rattachée à l'hôtel, retrouvée dans Billets avec le lien vers l'hôtel", async () => {
    await a.getByRole("button", { name: "Ouvrir « Hotel Gracery Kyoto »" }).click();
    await dlg(a).getByRole("button", { name: "Ajouter une confirmation" }).click();
    const d = dlg(a);
    assert.equal(await d.getByLabel("Titre").inputValue(), "Confirmation Hotel Gracery Kyoto");
    await d.getByText("Lien", { exact: true }).click();
    await d.getByLabel("Adresse du lien").fill("https://www.example.com/reservation-gracery");
    await d.getByRole("button", { name: "Ajouter le document" }).click();
    await d.getByRole("link", { name: /reservation-gracery/ }).waitFor();
    await a.goto(`${BASE}/billets`);
    await a.getByRole("button", { name: "Ouvrir « Confirmation Hotel Gracery Kyoto »" }).click();
    await dlg(a).getByRole("link", { name: "Hotel Gracery Kyoto" }).click();
    await a.waitForURL(/\/hebergements\?sejour=/);
    await dlg(a).getByRole("heading", { name: "Hotel Gracery Kyoto" }).waitFor();
    await dlg(a).getByRole("button", { name: "Ouvrir « Confirmation Hotel Gracery Kyoto »" }).waitFor();
  });

  await step("planning : départ d'Osaka puis arrivée à Kyoto le 12 mars, nuits suivantes", async () => {
    await a.goto(`${BASE}/planning`);
    const day12 = a.getByRole("list", { name: /^Hébergements du Vendredi 12 mars/ });
    await day12.getByRole("link").nth(1).waitFor();
    const lines = await day12.getByRole("link").allInnerTexts();
    assert.match(lines[0], /Départ\s*Cross Hotel Osaka\s*avant 11:00/);
    assert.match(lines[1], /Arrivée\s*Hotel Gracery Kyoto\s*dès 14:00/);
    await a.getByRole("list", { name: /^Hébergements du Samedi 13 mars/ }).getByText("Nuit").waitFor();
    await day12.getByRole("link", { name: /Arrivée/ }).click();
    await a.waitForURL(/\/hebergements\?sejour=/);
    await dlg(a).getByRole("heading", { name: "Hotel Gracery Kyoto" }).waitFor();
  });

  await step("carte : l'hôtel d'Osaka y figure comme hébergement", async () => {
    await close(a);
    await a.getByRole("button", { name: "Ouvrir « Cross Hotel Osaka »" }).click();
    await dlg(a).getByRole("link", { name: "Voir sur la carte" }).click();
    await a.waitForURL(/\/carte\?lieu=/);
    await a.locator('button.jt-marker[aria-label^="Cross Hotel Osaka (Hôtel"]').waitFor({ timeout: 30_000 });
  });

  await step("Bruno voit les mêmes hébergements et la même couverture des nuits", async () => {
    await login(b, bruno);
    await b.goto(`${BASE}/hebergements`);
    await b.getByRole("button", { name: "Ouvrir « Hotel Gracery Kyoto »" }).waitFor({ timeout: 30_000 });
    await b.getByText("21 nuits réservées sur 21").waitFor();
    await b.getByRole("button", { name: "Ouvrir « Cross Hotel Osaka »" }).getByText("3", { exact: true }).waitFor();
  });

  console.log(`\nHébergements : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
