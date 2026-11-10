/**
 * Carnet dans Chromium contre le VRAI Supabase : ajout, filtres, conversion en activité sans
 * ressaisie, synchro. Prérequis : app démarrée. Lancement : npm run test:e2e
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

  async function addEntry({ title, category, city, priority, body, url, coords }) {
    await a.getByRole("button", { name: "Envie", exact: true }).click();
    const d = dlg(a);
    await d.getByLabel("Titre").fill(title);
    await d.getByLabel("Catégorie").selectOption(category);
    if (city) await d.getByLabel("Ville").fill(city);
    if (priority) await d.locator("label", { hasText: priority }).click();
    if (body) await d.getByLabel("Notes").fill(body);
    if (url) await d.getByLabel("Lien (site, article, vidéo…)").fill(url);
    if (coords) await d.getByLabel("Coordonnées GPS").fill(coords);
    await d.getByRole("button", { name: "Ajouter au carnet" }).click();
    await d.getByRole("heading", { name: title }).waitFor();
    await close(a);
  }

  await step("carnet vide : explication et bouton d'ajout", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/carnet`);
    await a.getByText("Le carnet est vide").waitFor();
  });

  await step("ajout de trois envies (priorités, villes, lien, GPS)", async () => {
    await addEntry({ title: "Okonomiyaki Mizuno", category: "food", city: "Osaka", priority: "Incontournable",
      body: "Commander le yamaimo-yaki", url: "https://www.example.com/mizuno", coords: "34.6687, 135.5013" });
    await addEntry({ title: "Bambouseraie d'Arashiyama", category: "nature", city: "Kyoto", priority: "Envie" });
    await addEntry({ title: "Disques d'occasion à Shimokitazawa", category: "shopping", city: "Tokyo", priority: "Si on a le temps" });
    await a.getByText("3 envies · 3 à planifier").waitFor();
    const order = await a.getByRole("button", { name: /^Ouvrir « / }).allInnerTexts();
    assert.match(order[0], /Okonomiyaki/);
    assert.match(order[2], /Shimokitazawa/);
  });

  await step("filtres : catégorie, ville, recherche sans accents", async () => {
    await a.getByRole("group", { name: "Filtrer par catégorie" }).getByRole("button", { name: "Nature" }).click();
    assert.equal(await a.getByRole("button", { name: /^Ouvrir « / }).count(), 1);
    await a.getByRole("group", { name: "Filtrer par catégorie" }).getByRole("button", { name: "Tout" }).click();
    await a.getByLabel("Filtrer par ville").selectOption("Tokyo");
    await a.getByRole("button", { name: "Ouvrir « Disques d'occasion à Shimokitazawa »" }).waitFor();
    assert.equal(await a.getByRole("button", { name: /^Ouvrir « / }).count(), 1);
    await a.getByLabel("Filtrer par ville").selectOption("");
    await a.getByLabel("Rechercher dans le carnet").fill("YAMAIMO");
    assert.equal(await a.getByRole("button", { name: /^Ouvrir « / }).count(), 1);
    await a.getByLabel("Rechercher dans le carnet").fill("");
    await assertNoHorizontalScroll(a, "carnet");
  });

  await step("conversion en activité sans ressaisie, visible dans le planning", async () => {
    await a.getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).click();
    const d = dlg(a);
    await d.getByLabel("Ajouter au planning").selectOption("2027-03-10");
    await d.getByRole("button", { name: "Planifier" }).click();
    await d.getByRole("link", { name: /Prévu le mercredi 10 mars/ }).waitFor();
    await close(a);
    await a.getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).getByText(/Planifié · mer\. 10 mars/).waitFor();
    await a.getByText("3 envies · 2 à planifier").waitFor();
    await a.screenshot({ path: `${SHOTS}/carnet.png`, fullPage: true });
    await eventually(async () => {
      const { data } = await admin.from("activities").select("title,description,url,category,date,place_id,journal_entry_id").eq("trip_id", trip.tripId);
      assert.equal(data.length, 1);
      assert.deepEqual({ ...data[0], place_id: !!data[0].place_id, journal_entry_id: !!data[0].journal_entry_id }, {
        title: "Okonomiyaki Mizuno", description: "Commander le yamaimo-yaki", url: "https://www.example.com/mizuno",
        category: "restaurant", date: "2027-03-10", place_id: true, journal_entry_id: true,
      });
    });
    await a.goto(`${BASE}/planning`);
    await a.locator("#jour-2027-03-10").getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).waitFor();
  });

  await step("« À planifier » masque les envies déjà planifiées", async () => {
    await a.goto(`${BASE}/carnet`);
    await a.getByRole("button", { name: "À planifier" }).click();
    await a.getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).waitFor({ state: "detached" });
    assert.equal(await a.getByRole("button", { name: /^Ouvrir « / }).count(), 2);
  });

  await step("Bruno voit le carnet et l'état de planification", async () => {
    await login(b, bruno);
    await b.goto(`${BASE}/carnet`);
    await b.getByText("3 envies · 2 à planifier").waitFor({ timeout: 30_000 });
    await b.getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).getByText(/Planifié/).waitFor();
  });

  await step("supprimer l'envie conserve l'activité du planning", async () => {
    await b.getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).click();
    await dlg(b).getByRole("button", { name: "Supprimer", exact: true }).click();
    await dlg(b).getByRole("button", { name: /Confirmer \(le planning est conservé\)/ }).click();
    await b.getByRole("button", { name: "Ouvrir « Okonomiyaki Mizuno »" }).waitFor({ state: "detached" });
    await eventually(async () => {
      const { data: e } = await admin.from("journal_entries").select("deleted_at").eq("trip_id", trip.tripId).eq("title", "Okonomiyaki Mizuno");
      assert.ok(e[0].deleted_at);
      const { data: act } = await admin.from("activities").select("deleted_at").eq("trip_id", trip.tripId);
      assert.equal(act[0].deleted_at, null);
    });
  });

  console.log(`\nCarnet : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
