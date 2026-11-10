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

const PLURAL: Record<string, [string, string]> = {
  trips: ["le voyage", "le voyage"],
  trip_days: ["une journée", "journées"],
  places: ["un lieu", "lieux"],
  activities: ["une activité", "activités"],
  transports: ["un transport", "transports"],
  accommodations: ["un hébergement", "hébergements"],
  journal_entries: ["une note au carnet", "notes au carnet"],
  documents: ["un document", "documents"],
  expenses: ["une dépense commune", "dépenses communes"],
  settlements: ["un remboursement", "remboursements"],
  personal_expenses: ["une dépense personnelle", "dépenses personnelles"],
};

export interface ActivityGroup {
  entries: ActivityLogEntry[];
  actor_id: string | null;
  action: ActivityLogEntry["action"];
  entity_type: string;
  latest: string;
}

/**
 * Regroupe les entrées consécutives d'un même auteur, même action, même type d'élément,
 * à moins d'une heure d'intervalle (« Aiko a ajouté 6 activités »).
 */
export function groupActivity(entries: ActivityLogEntry[], windowMs = 3_600_000): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const e of entries) {
    const g = groups.at(-1);
    const last = g?.entries.at(-1);
    if (g && last && g.actor_id === e.actor_id && g.action === e.action && g.entity_type === e.entity_type
      && Math.abs(Date.parse(last.created_at) - Date.parse(e.created_at)) <= windowMs) {
      g.entries.push(e);
    } else {
      groups.push({ entries: [e], actor_id: e.actor_id, action: e.action, entity_type: e.entity_type, latest: e.created_at });
    }
  }
  return groups;
}

export function describeGroup(group: ActivityGroup, actorName: string, isSelf = false): string {
  if (group.entries.length === 1) return describeActivity(group.entries[0], actorName, isSelf);
  const subject = isSelf ? "Vous avez" : `${actorName} a`;
  const noun = PLURAL[group.entity_type]?.[1] ?? "éléments";
  const verb = { create: "ajouté", update: "modifié", delete: "supprimé", restore: "restauré" }[group.action];
  return `${subject} ${verb} ${group.entries.length} ${noun}.`;
}
