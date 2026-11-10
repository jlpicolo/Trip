/**
 * Carte, dans Chromium contre le VRAI Supabase et les vrais services (tuiles OpenFreeMap,
 * recherche Nominatim — une seule requête). Prérequis : app démarrée. Lancement : npm run test:e2e
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
  // Point de départ réaliste : une activité du planning avec son lieu (saisi dans le planning).
  const fushimi = crypto.randomUUID();
  await admin.from("places").insert({ id: fushimi, trip_id: trip.tripId, name: "Fushimi Inari", category: "monument", city: "Kyoto", lat: 34.9671, lng: 135.7727 });
  await admin.from("activities").insert({ id: crypto.randomUUID(), trip_id: trip.tripId, title: "Fushimi Inari", date: "2027-03-14", place_id: fushimi, sort_key: 1024 });

  const env = await launch();
  browser = env.browser;
  const ctxA = await browser.newContext(env.mobile);
  const a = await ctxA.newPage();
  const ctxB = await browser.newContext(env.mobile);
  const b = await ctxB.newPage();
  const { step, done } = stepper({ alice: a, bruno: b });
  const marker = (page, name) => page.locator(`button.jt-marker[aria-label^="${name} ("]`);
  const listNames = (page) => page.getByRole("list", { name: "Liste des lieux" }).locator("li span.font-semibold").allInnerTexts();
  const dbPlaces = async () => (await admin.from("places").select("id,name,category,lat,lng,is_favorite,source,source_ref,deleted_at").eq("trip_id", trip.tripId)).data;

  await step("la carte s'affiche avec les tuiles OpenFreeMap et le lieu du planning", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/carte`);
    await marker(a, "Fushimi Inari").waitFor({ timeout: 30_000 });
    await a.locator(".maplibregl-canvas").waitFor();
    await a.getByText(/OpenStreetMap/).first().waitFor();
    assert.deepEqual(await listNames(a), ["Fushimi Inari"]);
  });

  await step("recherche réelle (Nominatim) puis ajout sans ressaisie", async () => {
    await a.getByLabel("Rechercher un lieu").fill("Kinkaku-ji Kyoto");
    await a.getByRole("button", { name: "Lancer la recherche" }).click();
    const results = a.getByRole("list", { name: "Résultats de recherche" });
    await results.waitFor({ timeout: 20_000 });
    await results.getByRole("button", { name: /^Ajouter « / }).first().click();
    const dlg = a.getByRole("dialog");
    const name = await dlg.getByLabel("Nom").inputValue();
    assert.match(name, /金閣|Kinkaku|鹿苑/);
    assert.match(await dlg.getByLabel("Coordonnées GPS").inputValue(), /^35\.0\d+, 135\.7\d+$/);
    await dlg.getByLabel("Catégorie").selectOption("monument");
    await dlg.getByRole("button", { name: "Ajouter le lieu" }).click();
    await dlg.getByRole("button", { name: /Ajouter aux favoris|Favori/ }).waitFor();
    await dlg.getByRole("button", { name: "Fermer" }).first().click();
    await marker(a, name).waitFor();
    await eventually(async () => {
      const row = (await dbPlaces()).find((p) => p.name === name);
      assert.ok(row?.source === "search" && row.source_ref?.startsWith("osm:"), "référence OpenStreetMap conservée");
    });
  });

  await step("placer un lieu en touchant la carte", async () => {
    await a.getByRole("button", { name: "Placer sur la carte" }).click();
    await a.getByText("Touchez la carte à l'endroit du lieu.").waitFor();
    await a.locator(".maplibregl-canvas").evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = await a.locator(".maplibregl-canvas").boundingBox();
    await a.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.45);
    const dlg = a.getByRole("dialog");
    assert.match(await dlg.getByLabel("Coordonnées GPS").inputValue(), /^\d+\.\d+, \d+\.\d+$/);
    await dlg.getByLabel("Nom").fill("Nishiki Market");
    await dlg.getByLabel("Catégorie").selectOption("restaurant");
    await dlg.getByRole("button", { name: "Ajouter le lieu" }).click();
    await dlg.getByRole("button", { name: "Fermer" }).first().click();
    await marker(a, "Nishiki Market").waitFor();
    assert.equal((await listNames(a)).length, 3);
  });

  await step("ouvrir un lieu depuis son marqueur, le mettre en favori, filtrer", async () => {
    await marker(a, "Nishiki Market").click();
    const dlg = a.getByRole("dialog");
    await dlg.getByRole("button", { name: "Ajouter aux favoris" }).click();
    await dlg.getByRole("button", { name: "Favori" }).waitFor();
    await dlg.getByRole("button", { name: "Fermer" }).first().click();
    await marker(a, "Nishiki Market").and(a.locator('[aria-label$=", favori"]')).waitFor();
    await a.getByRole("button", { name: "Favoris" }).click();
    assert.deepEqual(await listNames(a), ["Nishiki Market♥"]);
    await a.getByRole("button", { name: "Favoris" }).click();
    await a.getByRole("button", { name: "Restaurants" }).click();
    assert.deepEqual(await listNames(a), ["Nishiki Market♥"]);
    await a.getByRole("button", { name: "Restaurants" }).click();
    await a.getByLabel("Afficher les lieux d'une journée").selectOption("2027-03-14");
    assert.deepEqual(await listNames(a), ["Fushimi Inari"]);
    assert.equal(await marker(a, "Nishiki Market").count(), 0, "seuls les lieux de la journée sont sur la carte");
    await a.getByLabel("Afficher les lieux d'une journée").selectOption("");
  });

  await step("lieu → planning : il apparaît dans la journée choisie, sans ressaisie", async () => {
    await a.getByRole("button", { name: "Ouvrir « Nishiki Market »" }).click();
    const dlg = a.getByRole("dialog");
    await dlg.getByText("Pas encore dans le planning.").waitFor();
    await dlg.getByLabel("Ajouter au planning").selectOption("2027-03-15");
    await dlg.getByRole("button", { name: "Ajouter", exact: true }).click();
    await dlg.getByRole("link", { name: /lun\. 15 mars.*Nishiki Market/ }).waitFor();
    await dlg.getByRole("link", { name: /lun\. 15 mars/ }).click();
    await a.waitForURL(/\/planning#jour-2027-03-15/);
    await a.locator("#jour-2027-03-15").getByText("Nishiki Market").waitFor();
  });

  await step("planning → carte : l'activité ouvre son lieu sur la carte", async () => {
    await a.locator("#jour-2027-03-14").getByRole("link", { name: "Voir « Fushimi Inari » sur la carte" }).click();
    await a.waitForURL(/\/carte\?lieu=/);
    await a.getByRole("dialog", { name: "Fushimi Inari" }).waitFor();
    await a.getByRole("dialog").getByRole("link", { name: /dim\. 14 mars/ }).waitFor();
    await a.getByRole("dialog").getByRole("link", { name: "Itinéraire (Google)" }).waitFor();
    const contrast = await a.getByRole("dialog").evaluate((d) => {
      const title = d.querySelector("h2");
      return { title: getComputedStyle(title).color, panel: getComputedStyle(d).backgroundColor };
    });
    assert.notEqual(contrast.title, contrast.panel, "le titre du tiroir doit être lisible");
    assert.notEqual(contrast.title, "rgb(10, 10, 15)", "le titre ne doit pas prendre la couleur du fond de page");
    await assertNoHorizontalScroll(a, "carte, mobile");
    await a.screenshot({ path: `${SHOTS}/20-carte-fiche.png` });
  });

  await step("déplacer un point en le faisant glisser, puis valider", async () => {
    await a.getByRole("dialog").getByRole("button", { name: "Déplacer le point" }).click();
    await a.getByText("Faites glisser le point vers sa nouvelle position.").waitFor();
    const before = (await dbPlaces()).find((p) => p.name === "Fushimi Inari");
    await marker(a, "Fushimi Inari").evaluate((el) => el.scrollIntoView({ block: "center" }));
    const m = await marker(a, "Fushimi Inari").boundingBox();
    await a.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
    await a.mouse.down();
    await a.mouse.move(m.x + m.width / 2 + 40, m.y + m.height / 2 + 30, { steps: 10 });
    await a.mouse.up();
    await a.getByRole("button", { name: "Valider" }).click();
    await a.getByText("Position enregistrée.").waitFor();
    await eventually(async () => {
      const after = (await dbPlaces()).find((p) => p.name === "Fushimi Inari");
      assert.ok(after.lat !== before.lat || after.lng !== before.lng, "les coordonnées ont changé côté serveur");
    });
  });

  await step("suppression d'un lieu : l'activité du planning est conservée", async () => {
    await a.getByRole("button", { name: "Ouvrir « Nishiki Market »" }).click();
    const dlg = a.getByRole("dialog");
    await dlg.getByRole("button", { name: "Supprimer le lieu" }).click();
    await dlg.getByRole("button", { name: "Supprimer", exact: true }).click();
    await a.getByText("Lieu supprimé.").waitFor();
    assert.equal(await marker(a, "Nishiki Market").count(), 0);
    await eventually(async () => assert.ok((await dbPlaces()).find((p) => p.name === "Nishiki Market").deleted_at));
    const { data: act } = await admin.from("activities").select("deleted_at").eq("trip_id", trip.tripId).eq("title", "Nishiki Market").single();
    assert.equal(act.deleted_at, null);
  });

  await step("Bruno voit les mêmes lieux et favoris", async () => {
    await login(b, bruno);
    await b.goto(`${BASE}/carte`);
    await marker(b, "Fushimi Inari").waitFor({ timeout: 30_000 });
    assert.equal((await listNames(b)).length, 2);
    await b.screenshot({ path: `${SHOTS}/21-carte-mobile.png` });
  });

  await step("tuiles injoignables : message clair, la liste des lieux reste utilisable", async () => {
    const ctx = await browser.newContext({ ...env.mobile, storageState: await ctxB.storageState() });
    await ctx.route("https://tiles.openfreemap.org/**", (r) => r.abort("internetdisconnected"));
    const p = await ctx.newPage();
    await p.goto(`${BASE}/carte`);
    await p.getByText(/Fond de carte indisponible/).waitFor({ timeout: 30_000 });
    await p.getByRole("list", { name: "Liste des lieux" }).locator("li").nth(1).waitFor({ timeout: 20_000 });
    await p.getByRole("button", { name: "Ouvrir « Fushimi Inari »" }).click();
    await p.getByRole("dialog", { name: "Fushimi Inari" }).waitFor();
    await ctx.close();
  });

  console.log(`\n${done.length} étapes OK`);
} catch (e) {
  console.error("\nÉCHEC :", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
  console.log("Nettoyage effectué.");
}
