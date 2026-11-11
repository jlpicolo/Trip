/**
 * Import d'une liste de lieux (.xlsx et .csv) sur la carte, contre le VRAI Supabase.
 * Prérequis : app démarrée en production. Lancement : npm run test:e2e
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BASE, SHOTS, admin, cleanup, createTraveler, createTrip, eventually, launch, login, stepper } from "./helpers.mjs";

const { strToU8, zipSync } = createRequire(import.meta.url)("fflate");
const FIX = `${SHOTS}/fixtures`;
mkdirSync(FIX, { recursive: true });

// Classeur au format du modèle « Local Discovery » (19 adresses avec coordonnées), réduit à 4 lignes.
const rows = [
  ["Nom", "Latitude", "Longitude", "Adresse", "Catégorie", "Pourquoi l’ajouter", "Note de vérification", "Précision des coordonnées"],
  ["Nezu Shrine", 35.7202817, 139.7607914, "1 Chome-28-9 Nezu, Bunkyo City, Tokyo 113-0031, Japan", "Temple & sanctuaire", "Torii vermillon et jardin d’azalées.", "Horaires à recontrôler.", "Précise — coordonnées publiées"],
  ["Kissa Seikatsu", 35.7043, 139.649, "1 Chome-6-12 Koenjiminami, Suginami City, Tokyo, Japan", "Cafés (sélection courte)", "Kissaten à ambiance jazz.", "", "Approximative — point du secteur/adresse à confirmer"],
  ["Ameyoko Market", 35.7101, 139.7745, "6 Chome-10-7 Ueno, Taito City, Tokyo, Japan", "Marché & rue commerçante", "Marché animé.", "", "Précise — coordonnées publiées"],
  ["Nezu Shrine", 35.72029, 139.7608, "doublon", "Temple & sanctuaire", "", "", ""],
];
const shared = [];
const xml = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
  const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
  if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
  shared.push(v);
  return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
}).join("")}</row>`).join("");
const XLSX = `${FIX}/lieux-tokyo.xlsx`;
writeFileSync(XLSX, zipSync({
  "xl/workbook.xml": strToU8('<workbook xmlns:r="r"><sheets><sheet name="Tokyo" r:id="rId1"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${xml}</sheetData></worksheet>`),
  "xl/sharedStrings.xml": strToU8(`<sst>${shared.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`),
}));
const CSV = `${FIX}/lieux-my-maps.csv`;
writeFileSync(CSV, 'Nom,Adresse,Catégorie\n"ZEN Craft Studio, Asakusa","Tosei Building 10F, 1 Chome-27-2 Asakusa, Taito City, Tokyo 111-0032, Japan",Ateliers créatifs & artisanat\n');

const users = [];
let trip;
let browser;
try {
  const alice = await createTraveler("Alice");
  users.push(alice);
  trip = await createTrip(users);
  const env = await launch();
  browser = env.browser;
  const a = await (await browser.newContext(env.mobile)).newPage();
  const { step, done } = stepper({ alice: a });
  const dlg = () => a.getByRole("dialog");
  const dbPlaces = async () => (await admin.from("places").select("name,lat,lng,city,category,source,notes").eq("trip_id", trip.tripId).is("deleted_at", null)).data;

  await step("aperçu de l'Excel : précis, approximatif, doublon, rien n'est encore écrit", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/carte`);
    await a.getByRole("button", { name: "Importer un fichier" }).click();
    await dlg().getByLabel("Fichier (.csv ou .xlsx)").setInputFiles(XLSX);
    const summary = dlg().getByLabel("Résumé de l'import");
    await summary.getByText("2 précis").waitFor();
    await summary.getByText("1 approximatif").waitFor();
    await summary.getByText("1 doublon ignoré").waitFor();
    assert.equal((await dbPlaces()).length, 0);
    await a.screenshot({ path: `${SHOTS}/import-apercu.png` });
  });

  await step("import : lieux sur la carte et au carnet, position approximative signalée", async () => {
    await dlg().getByRole("button", { name: "Importer 3 lieux" }).click();
    await a.getByText("3 lieux importés (et ajoutés au carnet).").waitFor();
    await a.locator('button.jt-marker[aria-label^="Nezu Shrine ("]').waitFor({ state: "attached", timeout: 30_000 });
    await eventually(async () => {
      const places = await dbPlaces();
      assert.equal(places.length, 3);
      const kissa = places.find((p) => p.name === "Kissa Seikatsu");
      assert.ok(kissa.notes.includes("Position approximative"));
      assert.deepEqual([kissa.city, kissa.category, kissa.source], ["Tokyo", "restaurant", "import"]);
      const { data: entries } = await admin.from("journal_entries").select("title,category,place_id").eq("trip_id", trip.tripId);
      assert.equal(entries.length, 3);
      assert.ok(entries.every((e) => e.place_id));
    });
    await a.goto(`${BASE}/carnet`);
    await a.getByRole("button", { name: "Ouvrir « Ameyoko Market »" }).waitFor();
  });

  await step("ré-import du même fichier : tout est reconnu comme doublon", async () => {
    await a.goto(`${BASE}/carte`);
    await a.getByRole("button", { name: "Importer un fichier" }).click();
    await dlg().getByLabel("Fichier (.csv ou .xlsx)").setInputFiles(XLSX);
    await dlg().getByLabel("Résumé de l'import").getByText("4 doublons ignorés").waitFor();
    assert.ok(await dlg().getByRole("button", { name: "Importer 0 lieu" }).isDisabled());
  });

  await step("CSV Google My Maps sans coordonnées : importé « à placer », sans position inventée", async () => {
    await dlg().getByLabel("Fichier (.csv ou .xlsx)").setInputFiles(CSV);
    await dlg().getByLabel("Résumé de l'import").getByText("1 à placer").waitFor();
    await dlg().getByText("Ajouter aussi chaque lieu au carnet (envie à planifier)").click();
    await dlg().getByRole("button", { name: "Importer 1 lieu" }).click();
    await a.getByText("1 lieu importé.").waitFor();
    await eventually(async () => {
      const zen = (await dbPlaces()).find((p) => p.name === "ZEN Craft Studio, Asakusa");
      assert.ok(zen && zen.lat === null && zen.lng === null);
    });
  });

  console.log(`\nImport : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
