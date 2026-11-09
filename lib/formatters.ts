const DAY = 86_400_000;

/** Date du jour (AAAA-MM-JJ) dans un fuseau donné, ou celui de l'appareil. */
export function todayIn(timeZone?: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Écart en jours calendaires entre deux dates AAAA-MM-JJ (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

export function tripDates(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  return Array.from({ length: n + 1 }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10));
}

export type TripPhase =
  | { phase: "before"; daysLeft: number; totalDays: number }
  | { phase: "during"; dayNumber: number; totalDays: number; percent: number }
  | { phase: "after"; totalDays: number };

/**
 * Avant le départ, le compte à rebours suit la date de l'appareil (les voyageurs
 * sont en France) ; pendant le voyage, la journée en cours suit le fuseau du voyage.
 */
export function tripPhase(start: string, end: string, timeZone: string, now: Date = new Date()): TripPhase {
  const totalDays = daysBetween(start, end) + 1;
  const localToday = todayIn(undefined, now);
  const tripToday = todayIn(timeZone, now);
  if (tripToday < start) return { phase: "before", daysLeft: Math.max(0, daysBetween(localToday, start)), totalDays };
  if (tripToday > end) return { phase: "after", totalDays };
  const dayNumber = daysBetween(start, tripToday) + 1;
  return { phase: "during", dayNumber, totalDays, percent: Math.round((dayNumber / totalDays) * 100) };
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T00:00:00Z`));
}

export function formatDateRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, sameYear ? { day: "numeric", month: "long" } : undefined)} – ${formatDate(end)}`;
}

export function formatRelative(isoDateTime: string, now: Date = new Date()): string {
  const diff = (now.getTime() - Date.parse(isoDateTime)) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `il y a ${Math.floor(diff / 3600)} h`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(isoDateTime));
}

export function formatMoney(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat("fr-FR", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(minor / 10 ** digits);
}
