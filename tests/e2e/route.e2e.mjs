/**
 * Mode Parcours de la carte : ordre du planning, couleurs par jour, distances à vol d'oiseau, gares et
 * lignes (vrai service Overpass / OpenStreetMap, gardées pour le hors ligne), liens Google Maps.
 * Prérequis : app démarrée en production.
 */
import assert from "node:assert/strict";
import { BASE, SHOTS, admin, assertNoHorizontalScroll, cleanup, createTraveler, createTrip, eventually, launch, login, stepper } from "./helpers.mjs";

const users = [];
let trip;
let browser;
try {
  const alice = await createTraveler("Alice");
  users.push(alice);
  trip = await createTrip(users);
  const id = () => crypto.randomUUID();
  const P = {
    hotel: { id: id(), name: "Hotel Nezu", category: "hotel", lat: 35.7186, lng: 139.7633 },
    nezu: { id: id(), name: "Nezu Shrine", category: "monument", lat: 35.7202817, lng: 139.7607914 },
    ameyoko: { id: id(), name: "Ameyoko Market", category: "shop", lat: 35.7101, lng: 139.7745 },
    artcomplex: { id: id(), name: "Artcomplex Center", category: "monument", lat: 35.6882, lng: 139.7186 },
  };
  for (const p of Object.values(P)) await admin.from("places").insert({ ...p, trip_id: trip.tripId, city: "Tokyo" });
  await admin.from("accommodations").insert({ id: id(), trip_id: trip.tripId, name: "Hotel Nezu", city: "Tokyo", check_in_date: "2027-03-20", check_out_date: "2027-03-23", place_id: P.hotel.id });
  const act = (title, date, sort_key, place_id, start_time = null) => admin.from("activities").insert({ id: id(), trip_id: trip.tripId, title, date, sort_key, place_id, start_time, category: "visit" });
  await act("Nezu Shrine", "2027-03-21", 1024, P.nezu.id, "09:00");
  await act("Ameyoko Market", "2027-03-21", 2048, P.ameyoko.id);
  await act("Artcomplex Center", "2027-03-21", 3072, P.artcomplex.id);
  await act("Dîner sans lieu", "2027-03-21", 4096, null);
  await act("Nezu Shrine (retour)", "2027-03-22", 1024, P.nezu.id);
  await admin.from("transports").insert({ id: id(), trip_id: trip.tripId, kind: "shinkansen", carrier: "JR", reference: "Nozomi 21", departure_date: "2027-03-20", departure_time: "09:12", departure_name: "Kyoto", arrival_name: "Tokyo" });

  const env = await launch();
  browser = env.browser;
  const a = await (await browser.newContext(env.mobile)).newPage();
  const { step, done } = stepper({ alice: a });
  const day = (n) => a.getByRole("region", { name: `Parcours du jour ${n}` });

  await step("depuis le planning, « Voir le parcours » ouvre la carte en mode Parcours", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/planning`);
    await a.getByRole("link", { name: /Voir le parcours du dimanche 21 mars/ }).click();
    await a.waitForURL(/\/carte\?parcours=2027-03-21/);
    await a.getByRole("tab", { name: "Parcours", selected: true }).waitFor();
    assert.equal(await a.getByLabel("Journée du parcours").inputValue(), "2027-03-21");
  });

  await step("étapes dans l'ordre du planning, de l'hôtel à l'hôtel, distances à vol d'oiseau", async () => {
    const d = day(13);
    await d.waitFor();
    const items = await d.getByRole("listitem").allInnerTexts();
    assert.deepEqual(items.map((t) => t.split("\n").filter(Boolean).pop()), ["Hébergement · Hotel Nezu", "Nezu Shrine · 09:00", "Ameyoko Market", "Artcomplex Center", "Hébergement · Hotel Nezu"]);
    await d.getByText(/À pied · \d+ m à vol d'oiseau/).first().waitFor();
    await d.getByText(/Transports conseillés · [\d,]+ km à vol d'oiseau/).first().waitFor();
    await d.getByText("1 activité sans lieu, non tracée : Dîner sans lieu.", { exact: false }).waitFor();
    await eventually(async () => assert.equal(await a.locator(".jt-stop").count(), 5), { timeout: 30_000 });
  });

  await step("liens Google Maps : tronçon en transports, journée avec étapes", async () => {
    const transit = day(13).getByRole("link", { name: "Itinéraire en transports (Google Maps)" }).first();
    assert.match(await transit.getAttribute("href"), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=[\d.]+,[\d.]+&destination=[\d.]+,[\d.]+&travelmode=transit$/);
    const whole = await day(13).getByRole("link", { name: "Journée dans Google Maps" }).getAttribute("href");
    assert.match(whole, /waypoints=.+%7C.+%7C.+&travelmode=walking$/);
  });

  await step("gares et lignes (OpenStreetMap) aux extrémités du tronçon long, conservées hors ligne", async () => {
    const box = day(13).getByTestId("transit").first();
    // L'instance publique d'Overpass est parfois saturée : l'app le dit et propose « Réessayer ».
    await eventually(async () => {
      const retry = a.getByRole("button", { name: "Réessayer" });
      if (await retry.isVisible()) await retry.click();
      assert.ok(await box.isVisible());
    }, { timeout: 240_000, interval: 5_000 });
    const text = await box.innerText();
    assert.match(text, /Gares près du départ :\s*\S+/);
    assert.match(text, /Gares près de l'arrivée :\s*\S+/);
    assert.ok(await box.locator("span[title]").count() > 0, "au moins une ligne affichée");
    await a.screenshot({ path: `${SHOTS}/parcours.png`, fullPage: true });

    await eventually(async () => assert.ok(await a.evaluate(async () => {
      if (!navigator.serviceWorker.controller) return false;
      const key = (await caches.keys()).find((k) => k.startsWith("jt-shell-"));
      return !!key && !!(await (await caches.open(key)).match("/carte"));
    }), "précache terminé"), { timeout: 90_000, interval: 1000 });
    await a.context().setOffline(true);
    await a.reload();
    await day(13).getByTestId("transit").first().waitFor({ timeout: 30_000 });
    assert.equal(await day(13).getByTestId("transit").first().innerText(), text);
    await a.context().setOffline(false);
  });

  await step("tous les jours : une couleur par jour, trajet en train entre villes", async () => {
    await a.getByLabel("Journée du parcours").selectOption("");
    await day(12).getByRole("link", { name: /JR Nozomi 21 · Kyoto → Tokyo/ }).waitFor();
    await day(14).waitFor();
    const colors = await a.locator('section[aria-label^="Parcours du jour"] header > span[aria-hidden]').evaluateAll((els) => els.map((e) => e.style.background));
    assert.equal(new Set(colors).size, colors.length);
    await assertNoHorizontalScroll(a, "parcours");
  });

  await step("retour au mode Lieux : la liste de tous les lieux revient", async () => {
    await a.getByRole("tab", { name: "Lieux" }).click();
    await a.getByRole("list", { name: "Liste des lieux" }).waitFor();
    assert.equal(await a.locator(".jt-stop").count(), 0);
  });

  console.log(`\nParcours : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
