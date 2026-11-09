import { v5 as uuidv5 } from "uuid";

// Espace de noms fixe : changer cette valeur casserait la fusion des journées
// créées hors ligne sur plusieurs appareils.
const DAY_NAMESPACE = "6f1c2a52-8f0e-4c9b-9d55-3f0a7c1e2b64";

export const newId = (): string => crypto.randomUUID();

/** Identifiant déterministe d'une journée : deux appareils hors ligne obtiennent le même. */
export const dayId = (tripId: string, isoDate: string): string => uuidv5(`${tripId}/${isoDate}`, DAY_NAMESPACE);
