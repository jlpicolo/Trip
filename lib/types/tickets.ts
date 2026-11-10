import type { SyncedRow } from "./sync";

export const TRANSPORT_KINDS = ["plane", "train", "shinkansen", "metro", "bus", "ferry", "other"] as const;
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

export interface Transport extends SyncedRow {
  trip_id: string;
  kind: TransportKind;
  carrier: string | null;
  reference: string | null;
  booking_ref: string | null;
  departure_date: string;
  departure_time: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  departure_name: string | null;
  arrival_name: string | null;
  seat_info: string | null;
  notes: string | null;
  booking_url: string | null;
  traveler_ids: string[];
}

export const DOCUMENT_CATEGORIES = ["flight", "train", "hotel", "id", "insurance", "confirmation", "photo", "other"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_KINDS = ["file", "link", "code"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const CODE_FORMATS = ["qrcode", "azteccode", "pdf417", "datamatrix", "code128", "ean13", "code39"] as const;
export type CodeFormat = (typeof CODE_FORMATS)[number];
export const FILE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type FileMimeType = (typeof FILE_MIME_TYPES)[number];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface TripDocument extends SyncedRow {
  trip_id: string;
  title: string;
  category: DocumentCategory;
  kind: DocumentKind;
  storage_path: string | null;
  mime_type: FileMimeType | null;
  size_bytes: number | null;
  sha256: string | null;
  url: string | null;
  code_value: string | null;
  code_format: CodeFormat | null;
  scope: "group" | "travelers";
  traveler_ids: string[];
  date: string | null;
  transport_id: string | null;
  accommodation_id: string | null;
  activity_id: string | null;
  place_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** Fichier présent sur l'appareil : seule preuve qu'un document est consultable hors ligne. */
export interface LocalFile {
  document_id: string;
  blob: Blob;
  sha256: string;
  saved_at: string;
}

/** Fichier ajouté sur cet appareil, pas encore envoyé dans le stockage du voyage. */
export interface PendingUpload {
  document_id: string;
  trip_id: string;
  storage_path: string;
  mime_type: string;
  attempts: number;
  last_error: string | null;
}
