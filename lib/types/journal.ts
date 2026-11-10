import type { SyncedRow } from "./sync";

export const JOURNAL_CATEGORIES = ["food", "visit", "culture", "nature", "shopping", "experience", "nightlife", "practical", "other"] as const;
export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number];

/** 1 = incontournable, 2 = envie, 3 = si on a le temps. */
export type JournalPriority = 1 | 2 | 3;

export interface JournalEntry extends SyncedRow {
  trip_id: string;
  category: string;
  title: string;
  body: string | null;
  url: string | null;
  place_id: string | null;
  city: string | null;
  priority: JournalPriority | null;
  created_by: string | null;
  created_at: string;
}
