/**
 * Hors ligne et installation, sur une version de PRODUCTION (le service worker est désactivé en
 * dev) : E2E_BASE_URL=http://localhost:3100 après `npm run build && npx next start -p 3100`.
 * Vérifie la réouverture sans réseau (rechargement, navigation), les billets et une carte téléchargée.
 */
import assert from "node:assert/strict";
import { BASE, SHOTS, admin, cleanup, createTraveler, createTrip, eventually, launch, login, stepper } from "./helpers.mjs";

const users = [];
let trip;
let browser;
try {
  const alice = await createTraveler("Alice");
  users.push(alice);
  trip = await createTrip(users, {
    destinations: [{ id: crypto.randomUUID(), name: "Nara" }, { id: crypto.randomUUID(), name: "Kyoto" }],
  });
  const ins = async (table, row) => {
    const { error } = await admin.from(table).insert({ id: crypto.randomUUID(), trip_id: trip.tripId, ...row });
    if (error) throw new Error(`${table}: ${error.message}`);
  };
  const transportId = crypto.randomUUID();
  await admin.from("transports").insert({ id: transportId, trip_id: trip.tripId, kind: "train", carrier: "Kintetsu", reference: "Limited Express",
    departure_date: "2027-03-11", departure_time: "09:00", departure_name: "Kyoto", arrival_name: "Nara" });
  await ins("documents", { title: "Billet Kintetsu", category: "train", kind: "code", code_value: "KINTETSU-0311", code_format: "qrcode", transport_id: transportId });
  await ins("activities", { title: "Tōdai-ji", date: "2027-03-11", sort_key: 1024, category: "visit" });
  await ins("places", { name: "Tōdai-ji", category: "monument", city: "Nara", lat: 34.689, lng: 135.8398 });

  const env = await launch();
  browser = env.browser;
  const ctx = await browser.newContext(env.mobile);
  const a = await ctx.newPage();
  const { step, done } = stepper({ alice: a });

  await step("installable : manifeste et service worker actif avec les pages en cache", async () => {
    await login(a, alice);
    const manifest = await (await a.request.get(`${BASE}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
    // Prêt = service worker actif ET précache terminé (le cache existe dès le début de l'installation).
    // (waitForFunction n'attend pas une fonction asynchrone : la promesse compte comme « vraie ».)
    await eventually(async () => assert.ok(await a.evaluate(async () => {
      if (!navigator.serviceWorker.controller) return false;
      const key = (await caches.keys()).find((k) => k.startsWith("jt-shell-"));
      return !!key && !!(await (await caches.open(key)).match("/accueil"));
    }), "précache terminé"), { timeout: 90_000, interval: 1000 });
    const pages = await a.evaluate(async () => {
      const key = (await caches.keys()).find((k) => k.startsWith("jt-shell-"));
      return (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname);
    });
    for (const p of ["/accueil", "/planning", "/billets", "/carte", "/connexion"]) assert.ok(pages.includes(p), `page en cache : ${p} (cache : ${pages.join(", ")})`);
    await a.getByRole("link", { name: /Prochain trajet/ }).getByText(/Kintetsu/).waitFor({ timeout: 30_000 });
  });

  await step("Paramètres : application prête hors ligne, carte de Nara téléchargée", async () => {
    await a.goto(`${BASE}/parametres#hors-ligne`);
    await a.getByText("Prête hors ligne").waitFor({ timeout: 30_000 });
    await a.getByRole("button", { name: "Télécharger la carte de Nara" }).click();
    await a.getByRole("button", { name: "Mettre à jour la carte de Nara" }).waitFor({ timeout: 180_000 });
    const row = a.locator("#hors-ligne li").filter({ hasText: "Nara" });
    const text = await row.innerText();
    assert.match(text, /\d+(,\d)? (Ko|Mo)/);
    assert.doesNotMatch(text, /manquant/);
    await a.getByText(/Zone inconnue|Non téléchargée/).first().waitFor(); // Kyoto non téléchargée, présentée comme telle
  });

  await step("sans réseau : l'app se recharge et affiche les données de l'appareil", async () => {
    await ctx.setOffline(true);
    await a.goto(`${BASE}/accueil`);
    await a.getByRole("heading", { name: "Japan Trip", level: 1 }).waitFor();
    await a.getByRole("link", { name: /Prochain trajet/ }).getByText(/Kintetsu/).waitFor();
    await a.reload();
    await a.getByRole("heading", { name: "Japan Trip", level: 1 }).waitFor();
    await a.getByRole("link", { name: /État de la synchronisation/ }).getByText(/Hors ligne/).waitFor({ timeout: 20_000 });
  });

  await step("sans réseau : navigation vers le planning et les billets, QR code en plein écran", async () => {
    await a.getByRole("link", { name: "Planning" }).first().click();
    await a.locator("#jour-2027-03-11").getByText("Tōdai-ji").waitFor({ timeout: 20_000 });
    await a.getByRole("link", { name: "Billets" }).first().click();
    await a.getByRole("button", { name: "Afficher le code de « Billet Kintetsu » en plein écran" }).or(a.getByRole("button", { name: "Afficher le billet" })).first().click();
    await a.getByRole("dialog", { name: "Billet plein écran : Billet Kintetsu" }).getByRole("img").waitFor();
    await a.keyboard.press("Escape");
  });

  await step("sans réseau : la carte de Nara s'affiche depuis l'appareil", async () => {
    await a.goto(`${BASE}/carte?lieu=`);
    await a.locator('button.jt-marker[aria-label^="Tōdai-ji ("]').waitFor({ timeout: 30_000 });
    await a.waitForTimeout(4000);
    assert.equal(await a.getByText(/Fond de carte indisponible/).count(), 0, "fond de carte servi par le cache");
    await a.screenshot({ path: `${SHOTS}/carte-hors-ligne.png` });
    await ctx.setOffline(false);
  });

  console.log(`\nHors ligne : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
