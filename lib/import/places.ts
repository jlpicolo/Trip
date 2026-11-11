import { parseCoordinates } from "@/lib/geo";
import type { JournalCategory } from "@/lib/types/journal";
import type { PlaceCategory } from "@/lib/places";
import type { Place } from "@/lib/types/planning";
import type { Table } from "./table";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/** En-têtes reconnus (Google My Maps, modèle « fiches », tableurs maison). */
const COLUMNS = {
  name: ["nom", "nom officiel", "name", "titre", "title", "lieu"],
  nameLocal: ["nom local (japonais)", "nom local", "nom japonais", "name (ja)"],
  lat: ["latitude", "lat"],
  lng: ["longitude", "lng", "lon", "long"],
  coords: ["coordonnees", "coordonnees gps", "gps", "coordinates"],
  mapsLink: ["lien fiche google maps", "lien google maps", "google maps", "lien maps"],
  address: ["adresse complete", "adresse", "address"],
  city: ["ville", "city"],
  category: ["categorie", "category", "type"],
  subcategory: ["sous-categorie"],
  why: ["pourquoi l'ajouter", "pourquoi on le recommande", "description editoriale", "description"],
  experience: ["experience / specialite"],
  budget: ["budget indicatif"],
  hours: ["horaires"],
  closed: ["jours de fermeture"],
  booking: ["reservation necessaire"],
  check: ["note de verification", "notes internes", "notes"],
  url: ["site officiel", "site", "url", "lien"],
  precision: ["precision des coordonnees", "precision"],
} as const;
type Column = keyof typeof COLUMNS;

export interface ImportRow {
  line: number;
  name: string;
  name_local: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  approximate: boolean;
  placeCategory: PlaceCategory;
  journalCategory: JournalCategory;
  description: string | null;
  notes: string | null;
  url: string | null;
  status: "ok" | "approx" | "no-position" | "duplicate" | "error";
  message: string | null;
}

/** Catégories libres du fichier → catégories de l'app (mots-clés, sans jamais refuser une ligne). */
export function mapCategory(raw: string): { place: PlaceCategory; journal: JournalCategory } {
  const c = norm(raw);
  const has = (...words: string[]) => words.some((w) => c.includes(w));
  if (has("temple", "sanctuaire", "shrine", "jinja", "monument", "chateau")) return { place: "monument", journal: "visit" };
  if (has("izakaya", "restaurant", "cuisine", "cafe", "kissa", "bar", "ramen", "sushi", "food", "manger")) return { place: "restaurant", journal: "food" };
  if (has("marche", "rue commercante", "boutique", "shop", "magasin", "shopping")) return { place: "shop", journal: "shopping" };
  if (has("atelier", "artisanat", "experience", "workshop", "cours")) return { place: "activity", journal: "experience" };
  if (has("musee", "galerie", "culture", "art")) return { place: "monument", journal: "culture" };
  if (has("parc", "jardin", "nature", "onsen", "randonnee")) return { place: "activity", journal: "nature" };
  if (has("hotel", "ryokan", "hebergement")) return { place: "hotel", journal: "practical" };
  if (has("gare", "station")) return { place: "station", journal: "practical" };
  return { place: "other", journal: "other" };
}

/** Ville déduite de l'adresse parmi les destinations du voyage (« …, Taito City, Tokyo 110-0001 » → Tokyo). */
export function cityFromAddress(address: string, destinations: string[]): string | null {
  const a = norm(address);
  return destinations.find((d) => new RegExp(`\\b${norm(d)}\\b`).test(a)) ?? null;
}

const inJapan = (lat: number, lng: number) => lat >= 20 && lat <= 46.5 && lng >= 122 && lng <= 154.5;
const toNumber = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
};

/**
 * Prépare l'import : colonnes reconnues, coordonnées vérifiées (au Japon, colonnes pas inversées),
 * précision signalée, doublons détectés (même nom à moins de 150 m d'un lieu existant ou d'une autre ligne).
 * Aucune position n'est inventée : une ligne sans coordonnées est importée « à placer ».
 */
export function prepareImport(table: Table, ctx: { destinations: string[]; existing: Pick<Place, "name" | "lat" | "lng">[] }) {
  if (table.length < 2) throw new Error("Le fichier ne contient aucune ligne de données.");
  const header = table[0].map(norm);
  const col = {} as Record<Column, number>;
  for (const key of Object.keys(COLUMNS) as Column[]) {
    col[key] = header.findIndex((h) => (COLUMNS[key] as readonly string[]).includes(h));
  }
  if (col.name < 0) throw new Error("Colonne « Nom » introuvable : la première ligne doit contenir les en-têtes (Nom, Adresse, Latitude, Longitude…).");
  const get = (r: string[], k: Column) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
  const join = (parts: [string, string][]) => {
    const t = parts.filter(([, v]) => v).map(([label, v]) => (label ? `${label} : ${v}` : v)).join("\n");
    return t || null;
  };

  const rows: ImportRow[] = [];
  const kept: { name: string; lat: number; lng: number }[] = ctx.existing
    .filter((p) => p.lat != null && p.lng != null).map((p) => ({ name: norm(p.name), lat: p.lat!, lng: p.lng! }));
  const existingNames = new Set(ctx.existing.map((p) => norm(p.name)));

  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = get(r, "name").slice(0, 160);
    if (!name) return;
    let lat = toNumber(get(r, "lat"));
    let lng = toNumber(get(r, "lng"));
    if ((lat === null || lng === null) && (get(r, "coords") || get(r, "mapsLink"))) {
      const c = parseCoordinates(get(r, "coords")) ?? parseCoordinates(get(r, "mapsLink"));
      if (c) ({ lat, lng } = c);
    }
    const cat = mapCategory(`${get(r, "category")} ${get(r, "subcategory")}`);
    const address = get(r, "address").slice(0, 400) || null;
    const precision = norm(get(r, "precision"));
    const base: Omit<ImportRow, "status" | "message" | "lat" | "lng" | "approximate"> = {
      line, name,
      name_local: get(r, "nameLocal").slice(0, 400) || null,
      address,
      city: (get(r, "city") || (address ? cityFromAddress(address, ctx.destinations) : null))?.slice(0, 80) ?? null,
      placeCategory: cat.place, journalCategory: cat.journal,
      description: join([["", get(r, "why")], ["Expérience", get(r, "experience")]])?.slice(0, 10000) ?? null,
      notes: join([["Horaires", get(r, "hours")], ["Fermeture", get(r, "closed")], ["Budget indicatif", get(r, "budget")],
        ["Réservation", get(r, "booking")], ["Vérification", get(r, "check")]])?.slice(0, 10000) ?? null,
      url: /^https?:\/\/\S+$/i.test(get(r, "url")) ? get(r, "url") : null,
    };

    if ((lat === null) !== (lng === null)) {
      rows.push({ ...base, lat: null, lng: null, approximate: false, status: "error", message: "Latitude ou longitude manquante" });
      return;
    }
    if (lat !== null && lng !== null && !inJapan(lat, lng)) {
      // Colonnes inversées : erreur fréquente dans les tableurs.
      if (inJapan(lng, lat)) [lat, lng] = [lng, lat];
      else {
        rows.push({ ...base, lat: null, lng: null, approximate: false, status: "error", message: `Coordonnées hors du Japon (${lat}, ${lng})` });
        return;
      }
    }
    const key = norm(name);
    const dup = lat !== null && lng !== null
      ? kept.find((k) => k.name === key && metersBetween(k, { lat: lat!, lng: lng! }) < 150)
      : existingNames.has(key) || rows.some((x) => norm(x.name) === key);
    if (dup) {
      rows.push({ ...base, lat, lng, approximate: false, status: "duplicate", message: "Déjà présent (même nom au même endroit) : ignoré" });
      return;
    }
    if (lat !== null && lng !== null) kept.push({ name: key, lat, lng });
    existingNames.add(key);
    const approximate = lat !== null && /approx|secteur|quartier|a confirmer|a corriger/.test(precision);
    rows.push({
      ...base, lat, lng, approximate,
      status: lat === null ? "no-position" : approximate ? "approx" : "ok",
      message: lat === null ? "Sans coordonnées : importé dans la liste, à placer sur la carte" : approximate ? "Position approximative (indiquée dans le fichier) : à affiner" : null,
    });
  });
  return {
    rows,
    counts: {
      ok: rows.filter((r) => r.status === "ok").length,
      approx: rows.filter((r) => r.status === "approx").length,
      noPosition: rows.filter((r) => r.status === "no-position").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      error: rows.filter((r) => r.status === "error").length,
    },
    recognized: (Object.keys(COLUMNS) as Column[]).filter((k) => col[k] >= 0),
  };
}

export const importable = (r: ImportRow) => r.status === "ok" || r.status === "approx" || r.status === "no-position";
