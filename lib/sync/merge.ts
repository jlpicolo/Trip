import { SERVER_COLUMNS, type JsonValue, type RowData, type SyncedRow } from "@/lib/types/sync";

const IGNORED = new Set<string>([...SERVER_COLUMNS, "id", "trip_id", "group_id"]);
const TIME_HM = /^\d{2}:\d{2}$/;

function normalize(v: JsonValue | undefined): JsonValue | undefined {
  // Postgres renvoie les heures en HH:MM:SS ; le client peut saisir HH:MM.
  if (typeof v === "string" && TIME_HM.test(v)) return `${v}:00`;
  return v ?? null;
}

export function sameValue(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (typeof na === "object" || typeof nb === "object") return JSON.stringify(na) === JSON.stringify(nb);
  return false;
}

/** Champs métier dont la valeur diffère entre deux versions d'une ligne. */
export function changedFields(base: RowData | null, next: RowData): string[] {
  const keys = new Set([...Object.keys(next), ...(base ? Object.keys(base) : [])]);
  return [...keys].filter((k) => !IGNORED.has(k) && !sameValue(base?.[k], next[k]));
}

export interface MergeOutcome {
  /** Champs locaux applicables sans risque sur la version serveur. */
  safePatch: RowData;
  /** Champs modifiés des deux côtés avec des valeurs différentes. */
  conflicting: string[];
}

/**
 * Fusion à 3 voies champ par champ : `base` est la version serveur sur laquelle
 * la modification locale a été faite, `server` la version actuelle.
 */
export function threeWayMerge(base: SyncedRow | null, localPatch: RowData, server: SyncedRow): MergeOutcome {
  const serverChanged = new Set(base ? changedFields(base, server) : Object.keys(server).filter((k) => !IGNORED.has(k) && server[k] != null));
  const safePatch: RowData = {};
  const conflicting: string[] = [];
  for (const [k, v] of Object.entries(localPatch)) {
    if (IGNORED.has(k)) continue;
    if (sameValue(v, server[k])) continue;
    if (serverChanged.has(k)) conflicting.push(k);
    else safePatch[k] = v;
  }
  return { safePatch, conflicting };
}

export function pick(data: RowData, keys: string[]): RowData {
  return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
}

export function omit(data: RowData, keys: string[]): RowData {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(data).filter(([k]) => !drop.has(k)));
}
