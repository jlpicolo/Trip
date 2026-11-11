import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseCsv, parseXlsx } from "@/lib/import/table";
import { cityFromAddress, mapCategory, prepareImport } from "@/lib/import/places";

/** Petit .xlsx construit à la volée : chaînes partagées, nombre, cellule vide sautée. */
function xlsx(rows: (string | number | null)[][]): Uint8Array {
  const shared: string[] = [];
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    if (v === null) return "";
    const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
    if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
    shared.push(v);
    return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
  }).join("")}</row>`).join("");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns:r="r"><sheets><sheet name="Lieux" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
    "xl/sharedStrings.xml": strToU8(`<sst>${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`),
  });
}

const DEST = ["Osaka", "Kyoto", "Tokyo"];

describe("lecture des fichiers", () => {
  it("CSV Google My Maps : virgules, guillemets, retours à la ligne, BOM", () => {
    const t = parseCsv('﻿Nom,Adresse\r\n"ZEN Craft Studio, Asakusa","Tosei 10F, 1 Chome-27-2 Asakusa, Taito City, Tokyo"\r\n"Le ""bon"" café","ligne1\nligne2"\n');
    expect(t).toEqual([["Nom", "Adresse"], ["ZEN Craft Studio, Asakusa", "Tosei 10F, 1 Chome-27-2 Asakusa, Taito City, Tokyo"], ['Le "bon" café', "ligne1\nligne2"]]);
  });
  it("CSV Excel français : point-virgule", () => {
    expect(parseCsv("Nom;Latitude;Longitude\nNezu;35,72;139,76")).toEqual([["Nom", "Latitude", "Longitude"], ["Nezu", "35,72", "139,76"]]);
  });
  it("XLSX : chaînes partagées, nombres, cellules vides, kanji et &", () => {
    const t = parseXlsx(xlsx([["Nom", "Latitude", "Longitude", "Nom local"], ["Nezu Shrine & jardin", 35.7202817, 139.7607914, "根津神社"], ["Sans GPS", null, null, null]]));
    expect(t).toEqual([["Nom", "Latitude", "Longitude", "Nom local"], ["Nezu Shrine & jardin", "35.7202817", "139.7607914", "根津神社"], ["Sans GPS"]]);
  });
  it("XLSX corrompu : message clair", () => {
    expect(() => parseXlsx(new Uint8Array([1, 2, 3]))).toThrow(/Excel illisible/);
  });
});

describe("préparation de l'import", () => {
  const header = ["Nom", "Latitude", "Longitude", "Adresse", "Catégorie", "Pourquoi l’ajouter", "Note de vérification", "Précision des coordonnées"];
  const row = (o: Partial<Record<string, string>>) => header.map((h) => o[h] ?? "");

  it("catégories libres et ville déduite de l'adresse", () => {
    expect(mapCategory("Temple & sanctuaire")).toEqual({ place: "monument", journal: "visit" });
    expect(mapCategory("Izakaya & cuisine locale").journal).toBe("food");
    expect(mapCategory("Cafés (sélection courte)").place).toBe("restaurant");
    expect(mapCategory("Marché & rue commerçante").place).toBe("shop");
    expect(mapCategory("Ateliers créatifs & artisanat").journal).toBe("experience");
    expect(mapCategory("Culture & galeries").journal).toBe("culture");
    expect(mapCategory("Truc inconnu")).toEqual({ place: "other", journal: "other" });
    expect(cityFromAddress("6 Chome-1-27 Yanaka, Taito City, Tokyo, Japan", DEST)).toBe("Tokyo");
    expect(cityFromAddress("Somewhere", DEST)).toBeNull();
  });

  it("précis, approximatif, sans position, inversé, hors Japon, doublons", () => {
    const { rows, counts } = prepareImport([header,
      row({ Nom: "Nezu Shrine", Latitude: "35.7202817", Longitude: "139.7607914", Adresse: "1 Chome-28-9 Nezu, Bunkyo City, Tokyo", "Catégorie": "Temple & sanctuaire", "Précision des coordonnées": "Précise — coordonnées publiées", "Pourquoi l’ajouter": "Torii vermillon" }),
      row({ Nom: "Kissa Seikatsu", Latitude: "35.7043", Longitude: "139.649", "Précision des coordonnées": "Approximative — point du secteur à confirmer" }),
      row({ Nom: "Sans GPS", Adresse: "Yanaka, Taito City, Tokyo" }),
      row({ Nom: "Inversé", Latitude: "139.76", Longitude: "35.72" }),
      row({ Nom: "Paris", Latitude: "48.85", Longitude: "2.35" }),
      row({ Nom: "Demi", Latitude: "35.7" }),
      row({ Nom: "Nezu Shrine", Latitude: "35.72029", Longitude: "139.76080" }),
      row({ Nom: "Fushimi Inari", Latitude: "34.9671", Longitude: "135.7727" }),
      row({ Nom: "" }),
    ], { destinations: DEST, existing: [{ name: "Fushimi Inari", lat: 34.96712, lng: 135.77271 }] });
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Nezu Shrine", "ok"], ["Kissa Seikatsu", "approx"], ["Sans GPS", "no-position"], ["Inversé", "ok"],
      ["Paris", "error"], ["Demi", "error"], ["Nezu Shrine", "duplicate"], ["Fushimi Inari", "duplicate"],
    ]);
    expect(rows[0]).toMatchObject({ city: "Tokyo", placeCategory: "monument", journalCategory: "visit", description: "Torii vermillon" });
    expect(rows[3]).toMatchObject({ lat: 35.72, lng: 139.76 });
    expect(counts).toEqual({ ok: 2, approx: 1, noPosition: 1, duplicate: 2, error: 2 });
  });

  it("modèle « fiches » : nom officiel, nom japonais, lien Google Maps avec coordonnées, notes regroupées", () => {
    const { rows, recognized } = prepareImport([
      ["ID unique", "Nom officiel", "Nom local (japonais)", "Catégorie", "Adresse complète", "Latitude", "Longitude", "Horaires", "Budget indicatif", "Site officiel", "Lien fiche Google Maps"],
      ["TYO-1", "Nezu Shrine", "根津神社", "Temples & sanctuaires", "1 Chome-28-9 Nezu, Bunkyo City, Tokyo", "", "", "05:00–18:00", "Gratuit", "https://www.nedujinja.or.jp/", "https://www.google.com/maps/place/Nezu/@35.7202817,139.7607914,17z"],
    ], { destinations: DEST, existing: [] });
    expect(recognized).toEqual(expect.arrayContaining(["name", "nameLocal", "lat", "lng", "mapsLink", "address", "hours", "budget", "url"]));
    expect(rows[0]).toMatchObject({ name: "Nezu Shrine", name_local: "根津神社", lat: 35.7202817, lng: 139.7607914, status: "ok", url: "https://www.nedujinja.or.jp/" });
    expect(rows[0].notes).toBe("Horaires : 05:00–18:00\nBudget indicatif : Gratuit");
  });

  it("refus clairs : fichier vide, colonne Nom absente", () => {
    expect(() => prepareImport([["Nom"]], { destinations: DEST, existing: [] })).toThrow(/aucune ligne/);
    expect(() => prepareImport([["Adresse"], ["x"]], { destinations: DEST, existing: [] })).toThrow(/Colonne « Nom »/);
  });
});
