import { daysBetween, tripDates } from "@/lib/formatters";
import type { Accommodation } from "@/lib/types/stays";

type Span = Pick<Accommodation, "check_in_date" | "check_out_date">;

/** Nombre de nuits, calculé sur l'appareil (identique à la colonne générée du serveur). */
export const nightsOf = (s: Span) => daysBetween(s.check_in_date, s.check_out_date);

/** La nuit « du jour d » est couverte si l'arrivée est ce jour-là ou avant, et le départ après. */
export const coversNight = (s: Span, date: string) => s.check_in_date <= date && date < s.check_out_date;

/** Nuits du voyage : du premier jour à la veille du dernier. */
export const tripNights = (start: string, end: string) => (end > start ? tripDates(start, end).slice(0, -1) : []);

export function sortStays<T extends Span>(list: T[]): T[] {
  return [...list].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date) || a.check_out_date.localeCompare(b.check_out_date));
}

export interface NightsReport {
  /** Nuits du voyage sans aucun hébergement saisi. */
  uncovered: string[];
  /** Nuits couvertes par plusieurs hébergements (groupe séparé, ou erreur de saisie). */
  overlaps: { date: string; ids: string[] }[];
}

export function nightsReport<T extends Span & { id: string }>(stays: T[], start: string, end: string): NightsReport {
  const uncovered: string[] = [];
  const overlaps: NightsReport["overlaps"] = [];
  for (const date of tripNights(start, end)) {
    const ids = stays.filter((s) => coversNight(s, date)).map((s) => s.id);
    if (ids.length === 0) uncovered.push(date);
    else if (ids.length > 1) overlaps.push({ date, ids });
  }
  return { uncovered, overlaps };
}

/** Regroupe des dates consécutives en plages, pour un affichage lisible (« 12 → 14 mars »). */
export function toRanges(dates: string[]): { from: string; to: string; count: number }[] {
  const out: { from: string; to: string; count: number }[] = [];
  for (const d of [...dates].sort()) {
    const last = out[out.length - 1];
    if (last && daysBetween(last.to, d) === 1) {
      last.to = d;
      last.count++;
    } else out.push({ from: d, to: d, count: 1 });
  }
  return out;
}

/** Ce que l'hébergement représente pour une journée du planning. */
export function stayEventsFor<T extends Span>(stays: T[], date: string): { stay: T; kind: "check_in" | "night" | "check_out" }[] {
  const out: { stay: T; kind: "check_in" | "night" | "check_out" }[] = [];
  for (const s of sortStays(stays)) {
    if (s.check_out_date === date) out.push({ stay: s, kind: "check_out" });
    else if (s.check_in_date === date) out.push({ stay: s, kind: "check_in" });
    else if (coversNight(s, date)) out.push({ stay: s, kind: "night" });
  }
  // Départ avant arrivée dans la même journée : ordre réel d'un changement d'hôtel.
  return out.sort((a, b) => (a.kind === "check_out" ? -1 : 0) - (b.kind === "check_out" ? -1 : 0));
}

/** Hébergement de la nuit en cours ou à venir (pour l'accueil et « ce soir »). */
export function stayForNight<T extends Span>(stays: T[], date: string): T | null {
  return sortStays(stays).find((s) => coversNight(s, date)) ?? null;
}
