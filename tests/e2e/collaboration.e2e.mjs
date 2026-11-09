/**
 * Test de bout en bout dans Chromium, contre le VRAI projet Supabase.
 * Prérequis : application démarrée (npm run build && npm run start) et .env.local renseigné.
 * Lancement : npm run test:e2e
 * Scénario : Alice crée le voyage et invite Bruno ; Bruno rejoint ; Bruno modifie hors ligne ;
 * la modification est envoyée au retour du réseau et Alice la voit. Nettoyage complet à la fin.
 */
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usernameToEmail } from "../../scripts/lib/username.mjs";

// Playwright n'est pas une dépendance du projet (navigateur fourni par l'environnement de test).
const { chromium } = createRequire(import.meta.url)("playwright");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = "tests/e2e/screenshots";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const run = Date.now().toString(36);
const people = {
  alice: { username: `alice-${run}`, password: `Alice-${run}-pass`, name: "Alice" },
  bruno: { username: `bruno-${run}`, password: `Bruno-${run}-pass`, name: "Bruno" },
};
const results = [];
const pages = {};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    for (const [who, page] of Object.entries(pages)) {
      await page.screenshot({ path: `${SHOTS}/echec-${who}.png` }).catch(() => {});
      console.log(`--- ${who} @ ${page.url()}\n${(await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 400)}`);
    }
    throw e;
  }
  results.push(name);
  console.log(`  ✓ ${name}`);
};

let browser;
try {
  for (const p of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: usernameToEmail(p.username), password: p.password, email_confirm: true, user_metadata: { display_name: p.name },
    });
    if (error) throw error;
    p.id = data.user.id;
  }

  // Le conteneur de test passe par un proxy HTTPS qui réécrit les certificats.
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  browser = await chromium.launch({ proxy });
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: !!proxy, locale: "fr-FR" };
  const ctxA = await browser.newContext(mobile);
  const ctxB = await browser.newContext(mobile);
  const alice = await ctxA.newPage();
  const bruno = await ctxB.newPage();
  Object.assign(pages, { alice, bruno });
  for (const [who, page] of Object.entries(pages)) {
    page.on("console", (m) => m.type() === "error" && console.log(`[console ${who}] ${m.text()}`));
  }

  const login = async (page, p) => {
    await page.getByLabel("Nom d'utilisateur").fill(p.username.toUpperCase()); // casse indifférente
    await page.getByLabel("Mot de passe").fill(p.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
  };

  await step("une page protégée redirige vers la connexion", async () => {
    await alice.goto(`${BASE}/accueil`);
    await alice.waitForURL(/\/connexion\?next=%2Faccueil/);
    assert.equal(await alice.getByRole("link", { name: /Créer un compte/ }).count(), 0, "pas d'inscription publique");
    assert.equal(await alice.locator('input[type="email"]').count(), 0, "aucun champ email");
    await alice.screenshot({ path: `${SHOTS}/01-connexion.png` });
  });

  await step("mauvais mot de passe : message clair en français", async () => {
    await alice.getByLabel("Nom d'utilisateur").fill(people.alice.username);
    await alice.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await alice.getByRole("button", { name: "Se connecter" }).click();
    await alice.getByText("Nom d'utilisateur ou mot de passe incorrect.").waitFor();
  });

  await step("Alice se connecte et arrive sur la création du voyage", async () => {
    await login(alice, people.alice);
    await alice.waitForURL(/\/bienvenue/);
    assert.equal(await alice.getByLabel("Nom du voyage").inputValue(), "Japan Trip");
    await alice.screenshot({ path: `${SHOTS}/02-bienvenue.png`, fullPage: true });
  });

  await step("Alice crée le voyage (groupe + voyage synchronisés)", async () => {
    await alice.getByRole("button", { name: "Créer le voyage" }).click();
    await alice.waitForURL(/\/parametres/);
    const { data } = await admin.from("trips").select("id,name,created_by,timezone,destinations").eq("created_by", people.alice.id);
    assert.equal(data.length, 1);
    assert.equal(data[0].timezone, "Asia/Tokyo");
    assert.deepEqual(data[0].destinations.map((d) => d.name), ["Osaka", "Nara", "Kyoto", "Kanazawa", "Nagano", "Tokyo"]);
    people.tripId = data[0].id;
  });

  let link;
  await step("Alice crée un lien d'invitation pour Bruno", async () => {
    await alice.getByLabel("Inviter un voyageur (nom d'utilisateur)").fill(people.bruno.username);
    await alice.getByRole("button", { name: "Créer le lien d'invitation" }).click();
    const input = alice.getByLabel("Lien d'invitation");
    await input.waitFor();
    link = await input.inputValue();
    assert.match(link, /\/invitation\?token=[0-9a-f]{64}$/);
    await alice.screenshot({ path: `${SHOTS}/03-invitation.png`, fullPage: true });
  });

  await step("Bruno ouvre le lien, se connecte et rejoint le voyage", async () => {
    await bruno.goto(link);
    await bruno.getByRole("link", { name: "Se connecter" }).click();
    await login(bruno, people.bruno);
    await bruno.waitForURL(/\/invitation\?token=/);
    await bruno.getByText(`Connecté en tant que ${people.bruno.username}`).waitFor();
    await bruno.getByRole("button", { name: "Rejoindre" }).click();
    await bruno.waitForURL(/\/accueil/);
    await bruno.getByRole("heading", { name: "Japan Trip" }).waitFor();
    await bruno.getByText("Alice", { exact: true }).waitFor();
    const { data: colors } = await admin.from("profiles").select("color").in("id", [people.alice.id, people.bruno.id]);
    assert.notEqual(colors[0].color, colors[1].color, "chaque voyageur a sa propre couleur");
    await bruno.screenshot({ path: `${SHOTS}/04-accueil-bruno.png`, fullPage: true });
  });

  await step("Bruno modifie le voyage HORS LIGNE : enregistré localement, en attente", async () => {
    await bruno.goto(`${BASE}/parametres`);
    await bruno.getByLabel("Nom du voyage").waitFor();
    await ctxB.setOffline(true);
    await bruno.getByLabel("Nom du voyage").fill("Japon 2027");
    await bruno.getByRole("button", { name: "Enregistrer le voyage" }).click();
    await bruno.getByText("Enregistré sur l'appareil, envoyé au retour du réseau.").waitFor();
    await bruno.getByRole("link", { name: /État de la synchronisation : (Hors ligne · )?1 en attente/ }).waitFor();
    const { data } = await admin.from("trips").select("name").eq("id", people.tripId).single();
    assert.equal(data.name, "Japan Trip", "rien ne doit partir tant que le réseau est coupé");
    await bruno.screenshot({ path: `${SHOTS}/05-hors-ligne.png` });
  });

  await step("retour du réseau : la modification est envoyée automatiquement", async () => {
    await ctxB.setOffline(false);
    await bruno.getByRole("link", { name: /État de la synchronisation : Synchronisé/ }).waitFor({ timeout: 20_000 });
    const { data } = await admin.from("trips").select("name,version,updated_by").eq("id", people.tripId).single();
    assert.equal(data.name, "Japon 2027");
    assert.equal(data.updated_by, people.bruno.id);
  });

  await step("Alice voit la modification de Bruno et l'historique la lui attribue", async () => {
    await alice.goto(`${BASE}/accueil`);
    await alice.getByRole("heading", { name: "Japon 2027" }).waitFor({ timeout: 20_000 });
    await alice.getByText("Bruno a modifié le voyage.").waitFor({ timeout: 20_000 });
    await alice.getByText("Vous avez ajouté le voyage.").waitFor();
    await alice.screenshot({ path: `${SHOTS}/06-accueil-alice.png`, fullPage: true });
  });

  await step("page de synchronisation : état réel affiché", async () => {
    await alice.goto(`${BASE}/synchronisation`);
    await alice.getByRole("button", { name: "Synchroniser maintenant" }).click();
    await alice.getByText("Synchronisation terminée.").waitFor();
    await alice.getByText("Tout est envoyé.").waitFor();
  });

  await step("thème clair et affichage ordinateur", async () => {
    const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: !!proxy, storageState: await ctxA.storageState() });
    const page = await desk.newPage();
    await page.goto(`${BASE}/parametres`);
    await page.getByRole("radio", { name: "Clair" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    await page.goto(`${BASE}/accueil`);
    await page.getByRole("heading", { name: "Japon 2027" }).waitFor({ timeout: 20_000 }).catch(async (e) => {
      await page.screenshot({ path: `${SHOTS}/echec-ordinateur.png` });
      console.log("DEBUG", await page.evaluate(() => document.body.innerText.slice(0, 500)));
      throw e;
    });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light", "le thème persiste");
    await page.screenshot({ path: `${SHOTS}/07-ordinateur-clair.png` });
    await desk.close();
  });

  await step("Bruno change lui-même son mot de passe", async () => {
    await bruno.goto(`${BASE}/parametres`);
    await bruno.getByRole("link", { name: "Changer de mot de passe" }).click();
    await bruno.waitForURL(/\/nouveau-mot-de-passe/);
    people.bruno.password = `Nouveau-${run}-mdp`;
    await bruno.getByLabel("Nouveau mot de passe").fill(people.bruno.password);
    await bruno.getByLabel("Confirmation").fill(people.bruno.password);
    await bruno.getByRole("button", { name: "Enregistrer" }).click();
    await bruno.waitForURL(/\/accueil/);
  });

  await step("déconnexion : données locales effacées de l'appareil", async () => {
    await bruno.goto(`${BASE}/parametres`);
    await bruno.getByRole("button", { name: "Se déconnecter" }).click();
    await bruno.waitForURL(/\/connexion/);
    const left = await bruno.evaluate(async () => {
      const req = indexedDB.open("japan-trip");
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const count = await new Promise((res) => { const r = db.transaction("trips").objectStore("trips").count(); r.onsuccess = () => res(r.result); });
      db.close();
      return count;
    });
    assert.equal(left, 0, `${left} voyage(s) encore présent(s) en local après déconnexion`);
  });

  await step("Bruno se reconnecte avec son nouveau mot de passe et retrouve le voyage", async () => {
    await bruno.goto(`${BASE}/connexion`);
    await login(bruno, people.bruno);
    await bruno.waitForURL(/\/accueil/);
    await bruno.getByRole("heading", { name: "Japon 2027" }).waitFor({ timeout: 20_000 });
  });

  console.log(`\n${results.length} étapes OK`);
} catch (e) {
  console.error("\nÉCHEC :", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  const ids = Object.values(people).map((p) => p.id).filter(Boolean);
  const { data: groups } = await admin.from("group_members").select("group_id").in("user_id", ids);
  for (const g of new Set((groups ?? []).map((x) => x.group_id))) await admin.from("travel_groups").delete().eq("id", g);
  if (people.tripId) await admin.from("activity_log").delete().eq("trip_id", people.tripId);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  console.log("Nettoyage effectué.");
}
