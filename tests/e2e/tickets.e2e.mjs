/**
 * Billets (trajets, fichiers, QR codes) dans Chromium contre le VRAI Supabase (base + Storage).
 * Prérequis : app démarrée. Lancement : npm run test:e2e
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BASE, SHOTS, admin, assertContrast, assertNoHorizontalScroll, cleanup, createTraveler, createTrip, eventually, launch, login, stepper } from "./helpers.mjs";

const bwipjs = createRequire(import.meta.url)("bwip-js");
const FIX = `${SHOTS}/fixtures`;
mkdirSync(FIX, { recursive: true });
// Billet PDF minimal mais valide, et capture d'écran contenant un vrai QR code.
const PDF = `${FIX}/billet-nozomi.pdf`;
writeFileSync(PDF, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const QR_TEXT = "JR-WEST-RESA-0420-7A";
const QR = `${FIX}/capture-qr.png`;
writeFileSync(QR, await bwipjs.toBuffer({ bcid: "qrcode", text: QR_TEXT, scale: 6, paddingwidth: 10, paddingheight: 10, backgroundcolor: "FFFFFF" }));

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
  const a = await ctxA.newPage();
  const ctxB = await browser.newContext(env.mobile);
  const b = await ctxB.newPage();
  const { step, done } = stepper({ alice: a, bruno: b });
  const dbDocs = async () => (await admin.from("documents").select("*").eq("trip_id", trip.tripId).is("deleted_at", null)).data;
  const dlg = (p) => p.getByRole("dialog");
  const TRAJET = /Ouvrir le trajet « JR Nozomi 21 · Kyoto → Tokyo »/;

  await step("Billets vide : état vide honnête et deux boutons d'ajout", async () => {
    await login(a, alice);
    await a.goto(`${BASE}/billets`);
    await a.getByText("Aucun billet pour l'instant").waitFor();
    await assertNoHorizontalScroll(a, "billets vide");
    await assertContrast(a.getByRole("button", { name: "Document" }), 4.5, "bouton Document");
  });

  await step("ajout d'un trajet (shinkansen, heures, voyageurs)", async () => {
    await a.getByRole("button", { name: "Trajet" }).click();
    const d = dlg(a);
    await d.getByLabel("Type").selectOption("shinkansen");
    await d.getByLabel("Compagnie").fill("JR");
    await d.getByLabel("N° de vol / train").fill("Nozomi 21");
    await d.getByLabel("Départ de").fill("Kyoto");
    await d.getByLabel("Date de départ").selectOption("2027-03-20");
    await d.getByLabel("Heure").first().fill("11:24");
    await d.getByLabel("Arrivée à").fill("Tokyo");
    await d.getByLabel("Heure").nth(1).fill("09:12");
    await d.getByRole("button", { name: "Ajouter le trajet" }).click();
    await d.getByText(/Arrivée avant le départ/).waitFor(); // incohérence signalée, rien d'enregistré
    await d.getByLabel("Heure").first().fill("09:12");
    await d.getByLabel("Heure").nth(1).fill("11:24");
    await d.getByLabel("Places (voiture, siège…)").fill("Voiture 7, sièges 12A–12B");
    await d.getByText(bruno.name, { exact: true }).click();
    await d.getByText(alice.name, { exact: true }).click();
    await d.getByRole("button", { name: "Ajouter le trajet" }).click();
    await d.getByRole("heading", { name: "JR Nozomi 21 · Kyoto → Tokyo" }).waitFor();
    await d.getByText("Aucun billet rattaché pour l'instant.").waitFor();
  });

  let pdfId;
  await step("billet PDF rattaché au trajet : sur l'appareil tout de suite, puis envoyé au stockage privé", async () => {
    await dlg(a).getByRole("button", { name: "Ajouter un billet à ce trajet" }).click();
    const d = dlg(a);
    assert.equal(await d.getByLabel("Catégorie").inputValue(), "train");
    await d.getByLabel("Fichier", { exact: true }).setInputFiles(PDF);
    assert.equal(await d.getByLabel("Titre").inputValue(), "billet-nozomi");
    await d.getByLabel("Titre").fill("Billet Nozomi (PDF)");
    await d.getByRole("button", { name: "Ajouter le document" }).click();
    await d.getByRole("heading", { name: "Billet Nozomi (PDF)" }).waitFor();
    await d.locator("object[type='application/pdf']").waitFor();
    const row = await eventually(async () => {
      const r = (await dbDocs()).find((x) => x.title === "Billet Nozomi (PDF)");
      assert.ok(r, "fiche synchronisée");
      return r;
    });
    pdfId = row.id;
    assert.equal(row.kind, "file");
    assert.equal(row.transport_id && typeof row.transport_id, "string");
    assert.ok(row.storage_path.startsWith(`${trip.tripId}/${row.id}/`));
    const { data: blob, error } = await admin.storage.from("trip-files").download(row.storage_path);
    assert.ifError(error);
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256, "empreinte identique à la fiche");
    await d.getByText("Sur l'appareil").waitFor();
  });

  await step("QR code lu depuis une capture d'écran, puis affiché en plein écran", async () => {
    await dlg(a).getByRole("button", { name: "Fermer" }).first().click();
    await a.getByRole("button", { name: "Document" }).click();
    const d = dlg(a);
    await d.getByText("QR / code-barres").click();
    await d.getByLabel(/Lire le code depuis une image/).setInputFiles(QR);
    await d.getByText("QR code reconnu.").waitFor({ timeout: 20_000 });
    assert.equal(await d.getByLabel("Contenu du code").inputValue(), QR_TEXT);
    await d.getByRole("img", { name: "Aperçu du code" }).waitFor();
    await d.getByLabel("Titre").fill("QR Nozomi");
    await d.getByLabel("Catégorie").selectOption("train");
    const label = await d.getByLabel("Trajet associé").locator("option", { hasText: "Nozomi 21" }).innerText();
    await d.getByLabel("Trajet associé").selectOption({ label });
    await d.getByRole("button", { name: "Ajouter le document" }).click();
    await d.getByRole("button", { name: "Plein écran" }).click();
    const full = a.getByRole("dialog", { name: "Billet plein écran : QR Nozomi" });
    await full.waitFor();
    const size = await full.getByRole("img", { name: "Code de « QR Nozomi »" }).boundingBox();
    assert.ok(size.width >= 300, `QR agrandi (${size.width}px)`);
    await a.screenshot({ path: `${SHOTS}/billet-plein-ecran.png` });
    await full.getByRole("button", { name: "Fermer" }).click();
    await full.waitFor({ state: "detached" });
    await eventually(async () => assert.ok((await dbDocs()).some((x) => x.kind === "code" && x.code_value === QR_TEXT && x.code_format === "qrcode")));
  });

  await step("liste : carte d'embarquement du trajet avec ses 2 billets, sans débordement", async () => {
    await a.keyboard.press("Escape");
    const card = a.getByRole("button", { name: TRAJET });
    await card.waitFor();
    await card.getByText("2 billets").waitFor();
    await a.getByText("Prochain trajet").waitFor();
    await assertNoHorizontalScroll(a, "billets");
    await a.screenshot({ path: `${SHOTS}/billets.png`, fullPage: true });
  });

  await step("Bruno : trajet reçu, PDF téléchargé automatiquement sur son appareil", async () => {
    await login(b, bruno);
    await b.goto(`${BASE}/billets`);
    await b.getByRole("button", { name: TRAJET }).click();
    const d = dlg(b);
    const row = d.getByRole("listitem").filter({ hasText: "Billet Nozomi (PDF)" });
    await row.getByText("Sur l'appareil").waitFor({ timeout: 30_000 });
    await row.getByRole("button", { name: "Ouvrir « Billet Nozomi (PDF) »" }).click();
    await dlg(b).locator("object[type='application/pdf']").waitFor();
  });

  await step("Bruno hors ligne : PDF et QR code restent consultables (données de l'appareil)", async () => {
    await ctxB.setOffline(true);
    await dlg(b).getByRole("button", { name: "Fermer" }).first().click();
    await b.getByRole("button", { name: "Afficher le code de « QR Nozomi » en plein écran" }).click();
    const full = b.getByRole("dialog", { name: "Billet plein écran : QR Nozomi" });
    await full.getByRole("img", { name: "Code de « QR Nozomi »" }).waitFor();
    await full.getByRole("button", { name: "Fermer" }).click();
    await b.getByRole("button", { name: TRAJET }).click();
    await dlg(b).getByRole("button", { name: "Ouvrir « Billet Nozomi (PDF) »" }).click();
    await dlg(b).locator("object[type='application/pdf']").waitFor();
    await ctxB.setOffline(false);
  });

  await step("retirer puis re-télécharger un fichier : l'indicateur suit la présence réelle", async () => {
    const d = dlg(b);
    await d.getByRole("button", { name: "Retirer de l'appareil" }).click();
    await d.getByText("En ligne uniquement").waitFor();
    await d.getByRole("button", { name: "Télécharger sur l'appareil" }).click();
    await d.getByText("Sur l'appareil").waitFor();
    await d.locator("object[type='application/pdf']").waitFor();
  });

  await step("document réservé à Alice : absent des « Mes billets » de Bruno", async () => {
    await dlg(b).getByRole("button", { name: "Fermer" }).first().click();
    await a.getByRole("button", { name: "Document" }).click();
    const d = dlg(a);
    await d.getByText("Lien", { exact: true }).click();
    await d.getByLabel("Adresse du lien").fill("https://www.example.com/assurance-alice");
    await d.getByLabel("Titre").fill("Assurance d'Alice");
    await d.getByLabel("Catégorie").selectOption("insurance");
    await d.getByText("Ne concerne que certains voyageurs").click();
    await d.getByRole("button", { name: "Ajouter le document" }).click();
    await d.getByText("Choisissez au moins un voyageur").waitFor();
    await d.getByText(alice.name, { exact: true }).click();
    await d.getByRole("button", { name: "Ajouter le document" }).click();
    await d.getByRole("link", { name: /assurance-alice/ }).waitFor();
    await eventually(async () => assert.ok((await dbDocs()).some((x) => x.title === "Assurance d'Alice" && x.scope === "travelers")));
    await b.reload();
    await b.getByRole("button", { name: "Ouvrir « Assurance d'Alice »" }).waitFor({ timeout: 30_000 });
    await b.getByRole("button", { name: "Mes billets" }).click();
    await b.getByRole("button", { name: "Ouvrir « Assurance d'Alice »" }).waitFor({ state: "detached" });
    await b.getByRole("button", { name: TRAJET }).waitFor(); // Bruno est l'un des voyageurs du trajet
    await b.getByRole("button", { name: "Tout le groupe" }).click();
  });

  await step("le trajet apparaît sur sa journée du planning et mène à son billet", async () => {
    await dlg(a).getByRole("button", { name: "Fermer" }).first().click();
    await a.goto(`${BASE}/planning`);
    const list = a.getByRole("list", { name: /^Trajets du Samedi 20 mars/ });
    await list.getByText("JR Nozomi 21 · Kyoto → Tokyo").click();
    await a.waitForURL(/\/billets\?trajet=/);
    await dlg(a).getByRole("heading", { name: "JR Nozomi 21 · Kyoto → Tokyo" }).waitFor();
    await dlg(a).getByRole("button", { name: "Fermer" }).first().click();
    await a.waitForURL(/\/billets$/);
  });

  await step("suppression du trajet : ses billets sont conservés, détachés", async () => {
    await a.getByRole("button", { name: TRAJET }).click();
    await dlg(a).getByRole("button", { name: "Supprimer le trajet" }).click();
    await dlg(a).getByRole("button", { name: /Confirmer/ }).click();
    await a.getByRole("button", { name: TRAJET }).waitFor({ state: "detached" });
    await a.getByRole("button", { name: "Ouvrir « Billet Nozomi (PDF) »" }).waitFor();
    await eventually(async () => {
      const r = (await dbDocs()).find((x) => x.id === pdfId);
      assert.equal(r.transport_id, null);
      const { data: t } = await admin.from("transports").select("deleted_at").eq("trip_id", trip.tripId);
      assert.ok(t.every((x) => x.deleted_at), "trajet supprimé (logiquement)");
    });
  });

  await step("/transports et /documents mènent aux Billets", async () => {
    await a.goto(`${BASE}/documents`);
    await a.waitForURL(/\/billets$/);
    await a.getByRole("heading", { name: "Billets", level: 1 }).waitFor();
  });

  console.log(`\nBillets : ${done.length} étapes réussies.`);
} catch (e) {
  console.error("ÉCHEC", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await cleanup(users, trip ? [trip.tripId] : []);
}
