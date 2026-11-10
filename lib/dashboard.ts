import { coversNight, tripNights } from "@/lib/stays";
import type { Activity } from "@/lib/types/planning";
import type { Accommodation } from "@/lib/types/stays";
import type { JournalEntry } from "@/lib/types/journal";

export interface PreparationStats {
  daysPlanned: number;
  totalDays: number;
  nightsCovered: number;
  totalNights: number;
  mustSeeUnplanned: JournalEntry[];
}

/**
 * État de préparation calculé à partir des données réelles uniquement : une journée compte
 * comme « prévue » si elle a au moins une activité ou est marquée libre.
 */
export function preparationStats(input: {
  dates: string[];
  start: string;
  end: string;
  activities: Pick<Activity, "date">[];
  freeDays: Set<string>;
  stays: Pick<Accommodation, "check_in_date" | "check_out_date">[];
  entries: JournalEntry[];
  planned: Set<string>;
}): PreparationStats {
  const withActivity = new Set(input.activities.map((a) => a.date).filter((d): d is string => !!d));
  const nights = tripNights(input.start, input.end);
  return {
    daysPlanned: input.dates.filter((d) => withActivity.has(d) || input.freeDays.has(d)).length,
    totalDays: input.dates.length,
    nightsCovered: nights.filter((n) => input.stays.some((s) => coversNight(s, n))).length,
    totalNights: nights.length,
    mustSeeUnplanned: input.entries.filter((e) => e.priority === 1 && !input.planned.has(e.id)),
  };
}

export function nowHm(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(now);
}
