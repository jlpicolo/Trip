/**
 * Planning, dans Chromium contre le VRAI Supabase : deux voyageurs, glisser-déposer,
 * idées, journées libres, hors ligne. Prérequis : app démarrée. Lancement : npm run test:e2e
 */
import assert from "node:assert/strict";
import { BASE, SHOTS, admin, assertNoHorizontalScroll, cleanup, createTraveler, createTrip, launch, login, stepper } from "./helpers.mjs";

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
  const ctxA = await browser.newContext(env.mobile);
  const ctxB = await browser.newContext(env.mobile);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const { step, done } = stepper({ alice: a, bruno: b });

  const day = (page, date) => page.locator(`#jour-${date}`);
  const titlesIn = async (page, date) =>
    day(page, date).locator("li[data-activity-id] p.font-semibold").allInnerTexts();
  const addActivity = async (page, date, fill) => {
    await day(page, date).getByRole("button", { name: /^Ajouter au/ }).click();
    const dlg = page.getByRole("dialog");
    await fill(dlg);
    await dlg.getByRole("button", { name: "Ajouter l'activité" }).click();
    await dlg.waitFor({ state: "detached" });
  };
  const serverActivities = async () =>
    (await admin.from("activities").select("title,date,start_time,sort_key,is_done,deleted_at,place_id").eq("trip_id", trip.tripId)).data;

  await step("le planning affiche les 22 journées du voyage, sans contenu inventé", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/planning`);
    await day(a, "2027-03-09").waitFor();
    assert.equal(await a.locator("section[id^=jour-]").count(), 22);
    assert.equal(await a.locator("li[data-activity-id]").count(), 0);
    await a.getByText("Idées non planifiées (0)").waitFor();
  });

  await step("ajout d'une activité avec horaires, lieu GPS, trajet estimé et budget estimé", async () => {
    await addActivity(a, "2027-03-14", async (dlg) => {
      await dlg.getByLabel("Titre").fill("Fushimi Inari");
      await dlg.getByLabel("Début (facultatif)").fill("07:00");
      await dlg.getByLabel("Fin (facultatif)").fill("09:30");
      await dlg.getByLabel("Adresse").fill("68 Fukakusa Yabunouchicho, Kyoto");
      await dlg.getByLabel("Coordonnées GPS").fill("https://www.google.com/maps/place/x/@34.9671,135.7727,17z");
      await dlg.getByLabel("Durée (min)").fill("25");
      await dlg.getByLabel("Moyen").selectOption("train");
      await dlg.getByLabel("Budget estimé (facultatif)").fill("0");
    });
    const card = day(a, "2027-03-14").locator("li[data-activity-id]").first();
    await card.getByText("07:00–09:30").waitFor();
    await card.getByText("≈ 25 min en train").waitFor();
    await card.getByText("· estimation").waitFor();
    const href = await card.getByRole("link", { name: /Itinéraire vers/ }).getAttribute("href");
    assert.equal(href, "https://www.google.com/maps/dir/?api=1&destination=34.9671%2C135.7727");
  });

  await step("validation : fin avant début refusée avec un message clair", async () => {
    await day(a, "2027-03-14").getByRole("button", { name: /^Ajouter au/ }).click();
    const dlg = a.getByRole("dialog");
    await dlg.getByLabel("Titre").fill("Incohérent");
    await dlg.getByLabel("Début (facultatif)").fill("10:00");
    await dlg.getByLabel("Fin (facultatif)").fill("09:00");
    await dlg.getByRole("button", { name: "Ajouter l'activité" }).click();
    await dlg.getByText("La fin doit être après le début").waitFor();
    await dlg.getByRole("button", { name: "Fermer" }).first().click();
  });

  await step("activité sans horaire, puis activité horodatée rangée chronologiquement", async () => {
    await addActivity(a, "2027-03-14", (dlg) => dlg.getByLabel("Titre").fill("Nishiki Market"));
    await addActivity(a, "2027-03-14", async (dlg) => {
      await dlg.getByLabel("Titre").fill("Kiyomizu-dera");
      await dlg.getByLabel("Début (facultatif)").fill("10:30");
    });
    assert.deepEqual(await titlesIn(a, "2027-03-14"), ["Fushimi Inari", "Nishiki Market", "Kiyomizu-dera"]);
  });

  await step("glisser-déposer au clavier (accessibilité)", async () => {
    await day(a, "2027-03-14").getByRole("button", { name: "Réordonner « Kiyomizu-dera »" }).focus();
    await a.keyboard.press("Space");
    await a.waitForTimeout(150);
    await a.keyboard.press("ArrowUp");
    await a.waitForTimeout(250);
    await a.keyboard.press("Space");
    await a.waitForFunction(() => {
      const t = [...document.querySelectorAll("#jour-2027-03-14 li[data-activity-id] p.font-semibold")].map((p) => p.textContent);
      return t.join("|") === "Fushimi Inari|Kiyomizu-dera|Nishiki Market";
    });
  });

  await step("glisser-déposer à la souris", async () => {
    // Nouvel appareil (ordinateur) avec la même session : base locale vide, tout doit arriver par la synchro.
    const desk = await browser.newContext({ ...env.desktop, storageState: await ctxA.storageState() });
    const page = await desk.newPage();
    await page.goto(`${BASE}/planning`);
    const logs = [];
    page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
    page.on("requestfailed", (r) => logs.push(`requête échouée: ${r.url().slice(0, 90)} ${r.failure()?.errorText}`));
    await day(page, "2027-03-14").locator("li[data-activity-id]").nth(2).waitFor({ timeout: 20_000 }).catch(async (e) => {
      console.log("DIAG statut:", await page.getByRole("link", { name: /État de la synchronisation/ }).first().getAttribute("aria-label").catch(() => "?"));
      console.log("DIAG url:", page.url(), "| items:", await day(page, "2027-03-14").locator("li[data-activity-id]").count());
      console.log("DIAG texte:", (await page.locator("body").innerText()).slice(0, 300).replace(/\n/g, " | "));
      console.log("DIAG logs:\n" + logs.slice(-10).join("\n"));
      throw e;
    });
    const handle = day(page, "2027-03-14").getByRole("button", { name: "Réordonner « Nishiki Market »" });
    const target = day(page, "2027-03-14").locator("li[data-activity-id]").first();
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(from.x + from.width / 2, to.y + 5, { steps: 15 });
    await page.mouse.up();
    await page.waitForFunction(() => {
      const t = [...document.querySelectorAll("#jour-2027-03-14 li[data-activity-id] p.font-semibold")].map((p) => p.textContent);
      return t[0] === "Nishiki Market";
    });
    await page.goto(`${BASE}/synchronisation`);
    await page.getByRole("button", { name: "Synchroniser maintenant" }).click();
    await page.getByText("Tout est envoyé.").waitFor();
    await desk.close();
    await a.reload();
    // Les données locales s'affichent immédiatement : attendre que la synchro apporte le nouvel ordre.
    await a.waitForFunction(() => [...document.querySelectorAll("#jour-2027-03-14 li[data-activity-id] p.font-semibold")]
      .map((p) => p.textContent).join("|") === "Nishiki Market|Fushimi Inari|Kiyomizu-dera", null, { timeout: 20_000 });
  });

  await step("idée sans date, puis planifiée sur un autre jour", async () => {
    await a.getByRole("button", { name: "Idée", exact: true }).click();
    const dlg = a.getByRole("dialog");
    await dlg.getByLabel("Titre").fill("Onsen à Hakone");
    assert.equal(await dlg.getByLabel("Début (facultatif)").isDisabled(), true, "pas d'horaire sans date");
    await dlg.getByRole("button", { name: "Ajouter l'activité" }).click();
    await dlg.waitFor({ state: "detached" });
    await a.getByText("Idées non planifiées (1)").waitFor();
    await a.getByRole("button", { name: "Ouvrir « Onsen à Hakone »" }).click();
    await a.getByRole("dialog").getByLabel("Journée").selectOption("2027-03-18");
    await a.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    await a.getByRole("dialog").waitFor({ state: "detached" });
    await a.getByText("Idées non planifiées (0)").waitFor();
    assert.deepEqual(await titlesIn(a, "2027-03-18"), ["Onsen à Hakone"]);
  });

  await step("activité réalisée, journée libre avec note", async () => {
    await day(a, "2027-03-14").getByRole("checkbox", { name: /Marquer « Fushimi Inari » comme réalisée/ }).click();
    await day(a, "2027-03-14").getByRole("checkbox", { name: /« Fushimi Inari » comme non réalisée/ }).waitFor();
    await day(a, "2027-03-15").getByRole("button", { name: /Note et ville du/ }).click();
    const dlg = a.getByRole("dialog");
    await dlg.getByLabel("Ville").fill("Nara");
    await dlg.getByLabel("Notes du jour").fill("On se laisse porter.");
    await dlg.getByLabel(/Journée libre/).check();
    await dlg.getByRole("button", { name: "Enregistrer la journée" }).click();
    await dlg.waitFor({ state: "detached" });
    await day(a, "2027-03-15").getByText("Journée libre").waitFor();
    await day(a, "2027-03-15").getByText("· Nara").waitFor();
  });

  await step("suppression avec confirmation", async () => {
    await a.getByRole("button", { name: "Ouvrir « Nishiki Market »" }).click();
    const dlg = a.getByRole("dialog");
    await dlg.getByRole("button", { name: "Supprimer l'activité" }).click();
    await dlg.getByText("Supprimer « Nishiki Market » pour tous les voyageurs ?").waitFor();
    await dlg.getByRole("button", { name: "Supprimer", exact: true }).click();
    await dlg.waitFor({ state: "detached" });
    assert.deepEqual(await titlesIn(a, "2027-03-14"), ["Fushimi Inari", "Kiyomizu-dera"]);
  });

  await step("tout est synchronisé côté serveur (suppression logique, lieu associé)", async () => {
    await a.getByRole("link", { name: /État de la synchronisation : Synchronisé/ }).waitFor({ timeout: 20_000 });
    const rows = await serverActivities();
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
    assert.equal(byTitle["Fushimi Inari"].is_done, true);
    assert.ok(byTitle["Fushimi Inari"].place_id);
    assert.ok(byTitle["Nishiki Market"].deleted_at);
    assert.equal(byTitle["Onsen à Hakone"].date, "2027-03-18");
    const { data: place } = await admin.from("places").select("name,lat,lng,category").eq("id", byTitle["Fushimi Inari"].place_id).single();
    assert.deepEqual(place, { name: "Fushimi Inari", lat: 34.9671, lng: 135.7727, category: "monument" });
  });

  await step("Bruno voit exactement le même planning", async () => {
    await login(b, bruno);
    await b.goto(`${BASE}/planning`);
    await day(b, "2027-03-14").locator("li[data-activity-id]").nth(1).waitFor({ timeout: 20_000 });
    assert.deepEqual(await titlesIn(b, "2027-03-14"), ["Fushimi Inari", "Kiyomizu-dera"]);
    assert.deepEqual(await titlesIn(b, "2027-03-18"), ["Onsen à Hakone"]);
    await day(b, "2027-03-15").getByText("Journée libre").waitFor();
    await assertNoHorizontalScroll(b, "planning chronologie, mobile");
    await b.screenshot({ path: `${SHOTS}/10-planning-mobile.png`, fullPage: false });
  });

  await step("Bruno ajoute une activité HORS LIGNE ; Alice la reçoit au retour du réseau", async () => {
    await ctxB.setOffline(true);
    await addActivity(b, "2027-03-14", async (dlg) => {
      await dlg.getByLabel("Titre").fill("Ramen Ichiran");
      await dlg.getByLabel("Catégorie").selectOption("restaurant");
      await dlg.getByLabel("Début (facultatif)").fill("12:30");
    });
    await b.getByText("Enregistré sur l'appareil, envoyé au retour du réseau.").waitFor();
    assert.deepEqual(await titlesIn(b, "2027-03-14"), ["Fushimi Inari", "Kiyomizu-dera", "Ramen Ichiran"]);
    assert.equal((await serverActivities()).some((r) => r.title === "Ramen Ichiran"), false);
    await ctxB.setOffline(false);
    await b.getByRole("link", { name: /État de la synchronisation : Synchronisé/ }).waitFor({ timeout: 20_000 });
    await a.reload();
    await day(a, "2027-03-14").locator("li[data-activity-id]").nth(2).waitFor({ timeout: 20_000 });
    assert.deepEqual(await titlesIn(a, "2027-03-14"), ["Fushimi Inari", "Kiyomizu-dera", "Ramen Ichiran"]);
  });

  await step("le tableau de bord affiche la vraie prochaine activité", async () => {
    await a.goto(`${BASE}/accueil`);
    await a.getByText("Fushimi Inari", { exact: true }).waitFor();
    await a.getByText("Bruno a ajouté une activité « Ramen Ichiran ».").waitFor({ timeout: 20_000 });
    await a.getByText(/dimanche 14 mars · 07:00/).waitFor();
  });

  await step("vue calendrier : sélection d'un jour", async () => {
    await a.goto(`${BASE}/planning`);
    await a.getByRole("tab", { name: "Calendrier" }).click();
    await a.getByRole("button", { name: /dimanche 14 mars : 3 activité/ }).click();
    await a.locator("#jour-2027-03-14").getByText("Ramen Ichiran").waitFor();
    await assertNoHorizontalScroll(a, "planning calendrier, mobile");
    await a.screenshot({ path: `${SHOTS}/11-planning-calendrier.png`, fullPage: true });
    await a.reload();
    await a.getByRole("tab", { name: "Calendrier", selected: true }).waitFor();
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
