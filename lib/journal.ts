import type { IconName } from "@/components/ui/Icon";
import type { ActivityCategory } from "@/lib/types/planning";
import type { PlaceCategory } from "@/lib/places";
import { JOURNAL_CATEGORIES, type JournalCategory, type JournalEntry, type JournalPriority } from "@/lib/types/journal";

export const JOURNAL_META: Record<JournalCategory, { label: string; icon: IconName; activity: ActivityCategory; place: PlaceCategory }> = {
  food: { label: "À manger", icon: "food", activity: "restaurant", place: "restaurant" },
  visit: { label: "À visiter", icon: "torii", activity: "visit", place: "monument" },
  culture: { label: "Culture", icon: "book", activity: "visit", place: "monument" },
  nature: { label: "Nature", icon: "sun", activity: "visit", place: "activity" },
  shopping: { label: "Boutiques", icon: "bag", activity: "shopping", place: "shop" },
  experience: { label: "Expériences", icon: "star", activity: "activity", place: "activity" },
  nightlife: { label: "Sorties", icon: "moon", activity: "activity", place: "activity" },
  practical: { label: "Pratique", icon: "bulb", activity: "other", place: "other" },
  other: { label: "Autre", icon: "more", activity: "other", place: "other" },
};

export const journalMeta = (c: string) => JOURNAL_META[c as JournalCategory] ?? JOURNAL_META.other;

export const PRIORITY_META: Record<JournalPriority, { label: string; short: string }> = {
  1: { label: "Incontournable", short: "★★★" },
  2: { label: "Envie", short: "★★" },
  3: { label: "Si on a le temps", short: "★" },
};

/** Incontournables d'abord ; sans priorité en dernier ; puis ordre alphabétique. */
export function sortEntries<T extends Pick<JournalEntry, "priority" | "title">>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.title.localeCompare(b.title, "fr"));
}

export interface JournalFilter {
  category: string | null;
  city: string | null;
  /** « à planifier » : pas encore d'activité tirée de cette entrée. */
  unplannedOnly: boolean;
  query: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterEntries<T extends Pick<JournalEntry, "id" | "category" | "city" | "title" | "body">>(
  list: T[], f: JournalFilter, planned: Set<string>,
): T[] {
  const q = fold(f.query.trim());
  return list.filter((e) =>
    (!f.category || e.category === f.category) &&
    (!f.city || (e.city ?? "") === f.city) &&
    (!f.unplannedOnly || !planned.has(e.id)) &&
    (!q || fold(`${e.title} ${e.body ?? ""} ${e.city ?? ""}`).includes(q)));
}

export const isJournalCategory = (c: string): c is JournalCategory => (JOURNAL_CATEGORIES as readonly string[]).includes(c);
