/**
 * Accessibilité (axe-core, règles WCAG 2.1 A/AA) sur toutes les pages, thèmes sombre et clair,
 * avec des données réelles. Prérequis : app démarrée en production. Lancement : npm run test:e2e
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BASE, admin, cleanup, createTraveler, createTrip, launch, login, stepper } from "./helpers.mjs";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["/accueil", "/planning", "/carte", "/billets", "/hebergements", "/carnet", "/budget", "/plus", "/parametres", "/synchronisation", "/carte?parcours=2027-03-14"];

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
  const placeId = crypto.randomUUID();
  await admin.from("places").insert({ id: placeId, trip_id: trip.tripId, name: "Fushimi Inari", category: "monument", city: "Kyoto", lat: 34.9671, lng: 135.7727, is_favorite: true });
  await ins("activities", { title: "Fushimi Inari", date: "2027-03-14", start_time: "07:00", sort_key: 1024, category: "visit", place_id: placeId });
  const kiyomizu = crypto.randomUUID();
  await admin.from("places").insert({ id: kiyomizu, trip_id: trip.tripId, name: "Kiyomizu-dera", category: "monument", city: "Kyoto", lat: 34.9949, lng: 135.785 });
  await ins("activities", { title: "Kiyomizu-dera", date: "2027-03-14", sort_key: 2048, category: "visit", place_id: kiyomizu });
  await ins("transports", { kind: "shinkansen", carrier: "JR", reference: "Nozomi 21", departure_date: "2027-03-20", departure_name: "Kyoto", arrival_name: "Tokyo" });
  await ins("accommodations", { name: "Hotel Gracery", city: "Kyoto", check_in_date: "2027-03-12", check_out_date: "2027-03-15" });
  await ins("journal_entries", { title: "Matcha à Uji", category: "food", priority: 1 });
  await ins("expenses", { title: "Ramen", category: "food", date: "2027-03-10", amount_minor: 1000, currency: "EUR", fx_rate: 1, base_amount_minor: 1000,
    paid_by: alice.id, split_mode: "equal", shares: [{ user_id: alice.id, weight: 1, base_minor: 1000 }] });

  const env = await launch();
  browser = env.browser;
  const report = [];
  for (const theme of ["dark", "light"]) {
    const ctx = await browser.newContext(env.mobile);
    await ctx.addInitScript((t) => { try { localStorage.setItem("jt-theme", t); } catch {} }, theme);
    const p = await ctx.newPage();
    const { step } = stepper({ [theme]: p });
    await step(`connexion (${theme})`, async () => {
      await p.goto(`${BASE}/connexion`);
      await p.getByLabel("Nom d'utilisateur").waitFor();
      report.push(...(await audit(p, `/connexion (${theme})`)));
      await login(p, alice);
      await p.getByText("Hotel Gracery").first().waitFor({ timeout: 30_000 });
    });
    for (const path of PAGES) {
      await step(`${path} (${theme})`, async () => {
        await p.goto(`${BASE}${path}`);
        await p.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20_000 });
        await p.waitForTimeout(path.startsWith("/carte") ? 3000 : 800);
        // Parcours : attendre les gares (ou le message d'indisponibilité) pour les auditer aussi.
        if (path.includes("parcours")) await p.locator('[data-testid="transit"], [role="alert"]').first().waitFor({ timeout: 60_000 });
        report.push(...(await audit(p, `${path} (${theme})`)));
      });
    }
    const dialogs = [
      ["/planning", (pg) => pg.getByRole("button", { name: "Ouvrir « Fushimi Inari »" }).click()],
      ["/carte", (pg) => pg.getByRole("button", { name: /Ajouter/ }).last().click()],
      ["/carte", (pg) => pg.getByRole("button", { name: "Importer un fichier" }).click()],
      ["/billets", (pg) => pg.getByRole("button", { name: "Document", exact: true }).click()],
      ["/hebergements", (pg) => pg.getByRole("button", { name: "Ouvrir « Hotel Gracery »" }).click()],
      ["/carnet", (pg) => pg.getByRole("button", { name: "Envie", exact: true }).click()],
      ["/budget", (pg) => pg.getByRole("button", { name: "Dépense", exact: true }).click()],
    ];
    for (const [path, open] of dialogs) {
      await step(`fenêtre ${path} (${theme})`, async () => {
        await p.goto(`${BASE}${path}`);
        await p.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20_000 });
        await open(p);
        await p.getByRole("dialog").waitFor();
        await p.waitForTimeout(500);
        report.push(...(await audit(p, `${path} · fenêtre (${theme})`)));
      });
    }
    await ctx.close();
  }
  if (report.length) {
    console.log("\nViolations :");
    for (const r of report) console.log(`- ${r.page} · ${r.id} (${r.impact}) : ${r.help}\n    ${r.nodes.join("\n    ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nAccessibilité : aucune violation WCAG 2.1 A/AA sur 38 écrans et fenêtres.");
  }
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}

async function audit(page, label) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    // Fond de carte : texte rendu dans un canvas WebGL par MapLibre, hors de portée d'axe.
    exclude: [[".maplibregl-canvas-container"]],
  }));
  return res.violations.map((v) => ({
    page: label, id: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} — ${(n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim()}`),
  }));
}
