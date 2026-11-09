import type { ActivityLogEntry } from "@/lib/types/trip";

const ENTITY: Record<string, string> = {
  trips: "le voyage",
  trip_days: "une journée",
  places: "un lieu",
  activities: "une activité",
  transports: "un transport",
  accommodations: "un hébergement",
  journal_entries: "une note au carnet",
  documents: "un document",
  expenses: "une dépense commune",
  settlements: "un remboursement",
  personal_expenses: "une dépense personnelle",
};

const PLACE_CATEGORY: Record<string, string> = {
  restaurant: "un restaurant",
  hotel: "un hôtel",
  monument: "un monument",
  shop: "un magasin",
  station: "une gare",
  airport: "un aéroport",
};

const VERB = { create: "ajouté", update: "modifié", delete: "supprimé", restore: "restauré" } as const;

/** Phrase lisible : « Thomas a ajouté un restaurant « Ichiran » à Kyoto. » */
export function describeActivity(entry: ActivityLogEntry, actorName: string, isSelf = false): string {
  const what =
    (entry.entity_type === "places" && entry.details.category && PLACE_CATEGORY[entry.details.category]) ||
    ENTITY[entry.entity_type] ||
    "un élément";
  const label = entry.label && entry.entity_type !== "trips" ? ` « ${entry.label} »` : "";
  const city = entry.details.city ? ` à ${entry.details.city}` : "";
  const subject = isSelf ? "Vous avez" : `${actorName} a`;
  return `${subject} ${VERB[entry.action]} ${what}${label}${city}.`;
}
