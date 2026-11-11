import type { KnownRate } from "@/lib/types/budget";
import type { TripSettings } from "@/lib/types/trip";

/**
 * Taux de référence quotidien de la BCE via Frankfurter (service en ligne uniquement, sans clé).
 * Jamais présenté comme un taux « en temps réel » : il est toujours affiché avec sa date.
 */
export const FX_API = "https://api.frankfurter.dev/v1/latest";
export const fxMetaKey = (base: string, quote: string) => `fx:${base}:${quote}`;

export class FxOfflineError extends Error {
  constructor() {
    super("Pas de connexion : le taux ne peut pas être mis à jour. Le dernier taux connu reste utilisé.");
    this.name = "FxOfflineError";
  }
}

export async function fetchEcbRate(base: string, quote: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<KnownRate> {
  let res: Response;
  try {
    res = await fetcher(`${FX_API}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`);
  } catch {
    throw new FxOfflineError();
  }
  if (!res.ok) throw new Error(`Service de taux indisponible (${res.status}). Le dernier taux connu reste utilisé.`);
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = json.rates?.[quote];
  if (typeof rate !== "number" || !(rate > 0) || typeof json.date !== "string") throw new Error("Réponse du service de taux illisible.");
  return { base, quote, rate, date: json.date, source: "ecb", fetched_at: now.toISOString() };
}

/** Taux effectif du voyage : taux manuel partagé s'il existe, sinon le dernier taux BCE connu. */
export function effectiveRate(settings: TripSettings | undefined, base: string, quote: string, ecb: KnownRate | null | undefined): KnownRate | null {
  const manual = settings?.manual_fx_rate;
  if (manual && manual.pair === `${base}/${quote}` && manual.rate > 0) {
    return { base, quote, rate: manual.rate, date: manual.set_at.slice(0, 10), source: "manual", fetched_at: manual.set_at };
  }
  return ecb ?? null;
}

/**
 * Taux « 1 unité de `currency` = x unités de `baseCurrency` » à figer dans une dépense,
 * déduit du taux connu dans un sens ou dans l'autre. null si inconnu (saisie manuelle requise).
 */
export function rateToBase(currency: string, baseCurrency: string, known: KnownRate | null): number | null {
  if (currency === baseCurrency) return 1;
  if (!known) return null;
  if (known.base === currency && known.quote === baseCurrency) return known.rate;
  if (known.base === baseCurrency && known.quote === currency) return 1 / known.rate;
  return null;
}

/** Âge du taux en jours (week-ends et jours fériés : la BCE ne publie pas). */
export function rateAgeDays(known: KnownRate, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${known.date}T00:00:00Z`)) / 86_400_000);
}

/** Libellé honnête du taux : source et date, « ancien » au-delà de 4 jours. */
export function rateLabel(known: KnownRate, today: string, formatDate: (iso: string) => string): string {
  if (known.source === "manual") return `Taux manuel saisi le ${formatDate(known.date)}`;
  const age = rateAgeDays(known, today);
  return `Taux de référence BCE du ${formatDate(known.date)}${age > 4 ? " — ancien, à mettre à jour" : ""}`;
}

/** Affiche un taux sans bruit : 177,38 ; 0,005638. */
export function formatRate(rate: number): string {
  return rate.toLocaleString("fr-FR", { maximumSignificantDigits: rate >= 1 ? 6 : 4 });
}

/**
 * Explication affichée après une vérification : la BCE ne publie qu'un taux par jour ouvré (vers 16 h,
 * heure de Paris). Sans ce message, un taux daté de la veille fait croire que l'actualisation a échoué.
 */
export function checkedLabel(known: KnownRate, now: Date, formatTime: (d: Date) => string): string {
  const checked = new Date(known.fetched_at);
  const sameDay = checked.toDateString() === now.toDateString();
  const when = sameDay ? `aujourd'hui à ${formatTime(checked)}` : `le ${checked.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
  return `Vérifié ${when} · la BCE publie un seul taux par jour ouvré, vers 16 h (heure de Paris) : le taux du jour n'apparaît qu'ensuite.`;
}
