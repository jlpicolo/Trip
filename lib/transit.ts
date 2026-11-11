import type { LocalDb } from "@/lib/db/schema";
import { distanceMeters, type Point } from "@/lib/route-plan";

/**
 * Gares et lignes (métro, train) autour des étapes, depuis OpenStreetMap via l'API Overpass (gratuite,
 * sans clé). Service en ligne uniquement : les résultats sont gardés sur l'appareil pour le hors ligne.
 * Aucune durée n'est calculée : on indique seulement les gares proches et les lignes qui les desservent.
 */
export const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 900;

export interface TransitLine {
  ref: string | null;
  name: string;
  colour: string | null;
  kind: "subway" | "train";
  /** Relation d'infrastructure (route=railway) : seule source pour certaines compagnies (Keihan…). */
  infra?: boolean;
}

export interface TransitStation extends Point {
  name: string;
  nameJa: string | null;
  lines: TransitLine[];
}

interface OsmElement {
  type: "node" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
}

export function buildQuery(points: Point[]): string {
  const around = (sel: string) => points.map((p) => `${sel}(around:${RADIUS_M},${p.lat.toFixed(5)},${p.lng.toFixed(5)});`).join("");
  return `[out:json][timeout:25];(${around('node["railway"="station"]')})->.s;(${around('node["public_transport"="stop_position"]["name"]')})->.p;` +
    `(.s;.p;)->.sp;rel(bn.sp)["route"~"^(subway|train|light_rail|monorail|railway)$"]->.r;.s out body;.p out body;.r out body;`;
}

/** « Tokyo Metro Chiyoda Line (Ayase → Yoyogi-Uehara) » → « Tokyo Metro Chiyoda Line ». */
const lineName = (t: Record<string, string>) => (t["name:en"] ?? t.name ?? t.ref ?? "Ligne").replace(/\s*\(.*\)\s*$/, "").trim();
const stationName = (t: Record<string, string>) => t["name:en"] ?? t["name:fr"] ?? t["name:ja-Latn"] ?? t.name ?? "";

/** Réponse Overpass → gares, avec les lignes desservant leurs points d'arrêt (dédoublonnées par sens). */
export function parseOverpass(json: { elements?: OsmElement[] }): TransitStation[] {
  const els = json.elements ?? [];
  // Les relations de ligne citent selon les compagnies les points d'arrêt ou directement le nœud de la gare.
  const stops = new Map(els.filter((e) => e.type === "node" && (e.tags?.public_transport === "stop_position" || e.tags?.railway === "station")).map((e) => [e.id, e]));
  const linesByStopName = new Map<string, Map<string, TransitLine>>();
  for (const r of els.filter((e) => e.type === "relation" && e.tags)) {
    const t = r.tags!;
    const infra = t.route === "railway";
    const line: TransitLine = { ref: infra ? null : t.ref ?? null, name: lineName(t), colour: t.colour ?? null, kind: t.route === "subway" ? "subway" : "train", ...(infra ? { infra } : {}) };
    for (const m of r.members ?? []) {
      const stop = m.type === "node" ? stops.get(m.ref) : undefined;
      const key = stop?.tags?.name;
      if (!key) continue;
      const set = linesByStopName.get(key) ?? new Map<string, TransitLine>();
      set.set(`${line.name}|${line.ref}`, line);
      linesByStopName.set(key, set);
    }
  }
  const out: TransitStation[] = [];
  for (const s of els.filter((e) => e.type === "node" && e.tags?.railway === "station" && e.lat != null)) {
    const t = s.tags!;
    const name = stationName(t);
    if (!name) continue;
    const lines = [...(linesByStopName.get(t.name ?? "")?.values() ?? [])];
    // Une même gare a souvent plusieurs nœuds (un par compagnie ou par quai) : fusionnés par nom à moins de 500 m.
    const same = out.find((o) => o.name.toLowerCase() === name.toLowerCase() && distanceMeters(o, { lat: s.lat!, lng: s.lon! }) < 500);
    if (same) same.lines = mainLines([...same.lines, ...lines]);
    else out.push({ name, nameJa: t.name && t.name !== name ? t.name : null, lat: s.lat!, lng: s.lon!, lines: mainLines(lines) });
  }
  return out;
}

export function nearestTransit(p: Point, stations: TransitStation[], maxM = RADIUS_M): (TransitStation & { distance: number }) | null {
  let best: (TransitStation & { distance: number }) | null = null;
  for (const s of stations) {
    const d = distanceMeters(p, s);
    if (d <= maxM && (!best || d < best.distance)) best = { ...s, distance: d };
  }
  return best;
}

/**
 * Lignes « officielles » : celles qui ont un code de ligne (C, JY, G…), une par code. Les variantes de
 * service (« C;JL », express nommés, sens de circulation) n'apportent rien pour choisir où monter.
 * Sans aucune ligne codée (cas de Keihan dans OpenStreetMap), on garde les lignes d'infrastructure nommées.
 */
function mainLines(lines: TransitLine[]): TransitLine[] {
  const byKey = new Map<string, TransitLine>();
  for (const l of lines) {
    if (!l.ref || !/^[A-Z]{1,3}$/.test(l.ref)) continue;
    const prev = byKey.get(l.ref);
    if (!prev || (!prev.colour && l.colour)) byKey.set(l.ref, l);
  }
  if (byKey.size === 0) for (const l of lines) if (l.infra && !byKey.has(l.name)) byKey.set(l.name, l);
  return [...byKey.values()].sort((a, b) => (a.kind === b.kind ? lineKey(a).localeCompare(lineKey(b)) : a.kind === "subway" ? -1 : 1));
}

export const lineKey = (l: TransitLine) => l.ref ?? l.name;

export function nearbyTransit(p: Point, stations: TransitStation[], n = 3, maxM = RADIUS_M): (TransitStation & { distance: number })[] {
  return stations.map((s) => ({ ...s, distance: distanceMeters(p, s) })).filter((s) => s.distance <= maxM)
    .sort((a, b) => a.distance - b.distance).slice(0, n);
}

export interface DirectOption {
  from: TransitStation & { distance: number };
  to: TransitStation & { distance: number };
  lines: TransitLine[];
}

/**
 * Meilleure paire de gares proches reliées par une même ligne (marche totale la plus courte). Indique
 * seulement qu'un trajet sans changement existe sur le réseau, pas sa durée ni ses horaires.
 */
export function directOption(from: Point, to: Point, stations: TransitStation[]): DirectOption | null {
  let best: DirectOption | null = null;
  for (const a of nearbyTransit(from, stations)) for (const b of nearbyTransit(to, stations)) {
    if (a.name === b.name) continue;
    const lines = sharedLines(a, b);
    if (lines.length && (!best || a.distance + b.distance < best.from.distance + best.to.distance)) best = { from: a, to: b, lines };
  }
  return best;
}

/** Lignes communes aux deux gares : trajet direct possible (sans correspondance) sur ces lignes. */
export function sharedLines(a: TransitStation, b: TransitStation): TransitLine[] {
  const keys = new Set(b.lines.map(lineKey));
  return a.lines.filter((l) => keys.has(lineKey(l)));
}

const cacheKey = (p: Point) => `transit:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

/**
 * Gares autour des points : cache local d'abord (hors ligne), puis une seule requête Overpass pour les
 * points manquants. L'instance publique est souvent saturée : trois essais espacés, puis erreur claire.
 */
export async function transitAround(db: LocalDb, points: Point[], fetcher: typeof fetch = fetch, pauseMs = 1500, timeoutMs = 30_000): Promise<{ stations: TransitStation[]; missing: number }> {
  const cached: TransitStation[] = [];
  const todo: Point[] = [];
  for (const p of points) {
    const hit = await db.getMeta<TransitStation[]>(cacheKey(p));
    if (hit) cached.push(...hit);
    else if (!todo.some((q) => cacheKey(q) === cacheKey(p))) todo.push(p);
  }
  if (todo.length === 0) return { stations: dedupe(cached), missing: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { stations: dedupe(cached), missing: todo.length };
  let json: { elements?: OsmElement[] } | null = null;
  for (let attempt = 0; attempt < 3 && !json; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, pauseMs * attempt));
    try {
      const res = await fetcher(OVERPASS_API, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: `data=${encodeURIComponent(buildQuery(todo))}`,
        // Sans limite, une connexion bloquée laisserait « Recherche des gares… » affiché indéfiniment.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) json = await res.json();
    } catch {
      // Réseau ou instance saturée : essai suivant.
    }
  }
  if (!json) throw new Error("Service des gares (OpenStreetMap) indisponible pour le moment. Réessayez dans quelques minutes.");
  const fresh = parseOverpass(json);
  for (const p of todo) await db.setMeta(cacheKey(p), fresh.filter((s) => distanceMeters(p, s) <= RADIUS_M));
  return { stations: dedupe([...cached, ...fresh]), missing: 0 };
}

function dedupe(list: TransitStation[]): TransitStation[] {
  const out: TransitStation[] = [];
  for (const s of list) if (!out.some((o) => o.name.toLowerCase() === s.name.toLowerCase() && distanceMeters(o, s) < 500)) out.push(s);
  return out;
}
