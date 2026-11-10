import type { IconName } from "@/components/ui/Icon";
import type { CodeFormat, DocumentCategory, Transport, TransportKind, TripDocument } from "@/lib/types/tickets";

export const TRANSPORT_META: Record<TransportKind, { label: string; icon: IconName }> = {
  plane: { label: "Avion", icon: "plane" },
  train: { label: "Train", icon: "train" },
  shinkansen: { label: "Shinkansen", icon: "train" },
  metro: { label: "Métro", icon: "train" },
  bus: { label: "Bus", icon: "bus" },
  ferry: { label: "Ferry", icon: "ship" },
  other: { label: "Autre", icon: "route" },
};

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  flight: "Billet d'avion",
  train: "Billet de train",
  hotel: "Hébergement",
  id: "Identité",
  insurance: "Assurance",
  confirmation: "Confirmation / réservation",
  photo: "Photo / capture",
  other: "Autre",
};

export const CODE_FORMAT_LABEL: Record<CodeFormat, string> = {
  qrcode: "QR code",
  azteccode: "Aztec (billets de train)",
  pdf417: "PDF417 (cartes d'embarquement)",
  datamatrix: "Data Matrix",
  code128: "Code-barres Code 128",
  ean13: "Code-barres EAN-13",
  code39: "Code-barres Code 39",
};

/** Codes 2D : affichés carrés ; les autres (linéaires) en bandeau. */
export const SQUARE_CODES: ReadonlySet<CodeFormat> = new Set(["qrcode", "azteccode", "datamatrix"]);

/**
 * Catégories téléchargées automatiquement après la synchro (« billets et QR codes du
 * voyage »). Les pièces d'identité restent à la demande : moins de copies sur les appareils.
 */
export const AUTO_DOWNLOAD: ReadonlySet<DocumentCategory> = new Set(["flight", "train", "hotel", "confirmation", "photo", "other"]);

/** Un document « pour certains voyageurs » ne concerne que ceux-là ; sinon tout le groupe. */
export const concerns = (row: { traveler_ids: string[] }, userId: string) =>
  row.traveler_ids.length === 0 || row.traveler_ids.includes(userId);

export function transportTitle(t: Pick<Transport, "kind" | "carrier" | "reference" | "departure_name" | "arrival_name">): string {
  const route = t.departure_name && t.arrival_name ? `${t.departure_name} → ${t.arrival_name}` : (t.departure_name ?? t.arrival_name);
  const label = [t.carrier, t.reference].filter(Boolean).join(" ") || TRANSPORT_META[t.kind].label;
  return route ? `${label} · ${route}` : label;
}

/** Trajets dans l'ordre chronologique de départ (sans heure : en fin de journée). */
export function sortTransports<T extends Pick<Transport, "departure_date" | "departure_time">>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    a.departure_date.localeCompare(b.departure_date) || (a.departure_time ?? "99").localeCompare(b.departure_time ?? "99"));
}

/** Prochain trajet non passé (comparaison en heure locale du voyage). */
export function nextTransport<T extends Pick<Transport, "departure_date" | "departure_time">>(list: T[], today: string, nowHm: string): T | null {
  return sortTransports(list).find((t) => t.departure_date > today || (t.departure_date === today && (t.departure_time ?? "99:99") >= nowHm)) ?? null;
}

export function documentsFor(docs: TripDocument[], transportId: string) {
  return docs.filter((d) => d.transport_id === transportId);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/** Nom de fichier sûr pour le stockage (pas d'accents, d'espaces ni de « / »). */
export function safeFileName(raw: string): string {
  const name = raw.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "fichier";
  return ext ? `${base}.${ext}` : base;
}

export const storagePathFor = (tripId: string, documentId: string, fileName: string) =>
  `${tripId}/${documentId}/${safeFileName(fileName)}`;

/** Type MIME accepté : celui du navigateur, sinon déduit de l'extension (iOS laisse parfois le type vide). */
export function detectMime(file: { name: string; type: string }): string | null {
  const known = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
  if (known.includes(file.type)) return file.type;
  if (file.type === "image/heif") return "image/heic";
  const ext = file.name.toLowerCase().split(".").pop();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heic" } as Record<string, string>)[ext ?? ""] ?? null;
}

/** Format lu par le scanner (noms ZXing) → format enregistré (noms bwip-js), null si non géré. */
export function codeFormatFromScan(format: string): CodeFormat | null {
  if (format.startsWith("QRCode") || format === "MicroQRCode") return "qrcode";
  if (format.startsWith("Aztec")) return "azteccode";
  if (format.includes("PDF417")) return "pdf417";
  if (format === "DataMatrix") return "datamatrix";
  if (format === "Code128") return "code128";
  if (format === "EAN13") return "ean13";
  if (format.startsWith("Code39")) return "code39";
  return null;
}
