import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { sha256Hex } from "@/lib/sync/files";
import { newId } from "@/lib/ids";
import { detectMime, sortTransports, storagePathFor } from "@/lib/tickets";
import { MAX_FILE_BYTES, type Transport, type TripDocument } from "@/lib/types/tickets";
import type { DocumentPatch } from "@/lib/validation/document";
import type { TransportPatch } from "@/lib/validation/transport";

export async function transportsOfTrip(db: LocalDb, tripId: string): Promise<Transport[]> {
  const rows = (await db.data("transports").where("trip_id").equals(tripId).toArray()) as Transport[];
  return sortTransports(rows.filter((t) => !t.deleted_at));
}

export async function documentsOfTrip(db: LocalDb, tripId: string): Promise<TripDocument[]> {
  const rows = (await db.data("documents").where("trip_id").equals(tripId).toArray()) as TripDocument[];
  return rows.filter((d) => !d.deleted_at).sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

/** Identifiants des documents dont le fichier est réellement présent sur l'appareil. */
export async function localFileIds(db: LocalDb, ids: string[]): Promise<Set<string>> {
  return new Set(await db.files.where("document_id").anyOf(ids).primaryKeys());
}

export async function pendingUploadIds(db: LocalDb, tripId: string): Promise<Map<string, string | null>> {
  const rows = await db.uploads.where("trip_id").equals(tripId).toArray();
  return new Map(rows.map((u) => [u.document_id, u.last_error]));
}

export async function saveTransport(engine: SyncEngine, tripId: string, patch: TransportPatch, existing?: Transport) {
  if (existing) {
    await engine.update("transports", existing.id, patch);
    return existing.id;
  }
  return engine.insert("transports", { ...patch, trip_id: tripId });
}

/** Supprime un trajet ; ses billets restent dans les documents, détachés. */
export async function deleteTransport(engine: SyncEngine, db: LocalDb, transport: Transport) {
  const docs = (await documentsOfTrip(db, transport.trip_id)).filter((d) => d.transport_id === transport.id);
  for (const d of docs) await engine.update("documents", d.id, { transport_id: null });
  await engine.remove("transports", transport.id);
}

/** Lien ou code : aucune donnée binaire, la fiche suffit. */
export async function saveDocument(engine: SyncEngine, tripId: string, patch: DocumentPatch, existing?: TripDocument) {
  if (existing) {
    // Le type d'un document ne change pas (un fichier envoyé resterait orphelin).
    const { kind: _kind, ...rest } = patch;
    void _kind;
    await engine.update("documents", existing.id, existing.kind === "file" ? { ...rest, url: null, code_value: null, code_format: null } : rest);
    return existing.id;
  }
  if (patch.kind === "file") throw new Error("Choisissez un fichier.");
  return engine.insert("documents", { ...patch, trip_id: tripId });
}

export function checkFile(file: { name: string; type: string; size: number }): string {
  const mime = detectMime(file);
  if (!mime) throw new Error("Format non pris en charge : PDF, JPEG, PNG, WebP ou HEIC uniquement.");
  if (file.size === 0) throw new Error("Ce fichier est vide.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Fichier trop lourd : 25 Mo maximum.");
  return mime;
}

/**
 * Ajoute un document fichier : le fichier est d'abord conservé sur l'appareil (consultable
 * tout de suite, même hors ligne), puis envoyé au stockage du voyage à la synchro suivante.
 */
export async function addFileDocument(engine: SyncEngine, db: LocalDb, tripId: string, patch: DocumentPatch, file: File) {
  const mime = checkFile(file);
  const id = newId();
  const sha256 = await sha256Hex(file);
  const storage_path = storagePathFor(tripId, id, file.name);
  const blob = file.type === mime ? file : new Blob([file], { type: mime });
  await db.transaction("rw", [db.files, db.uploads], async () => {
    await db.files.put({ document_id: id, blob, sha256, saved_at: new Date().toISOString() });
    await db.uploads.put({ document_id: id, trip_id: tripId, storage_path, mime_type: mime, attempts: 0, last_error: null });
  });
  await engine.insert("documents", {
    ...patch, id, trip_id: tripId, kind: "file", url: null, code_value: null, code_format: null,
    storage_path, mime_type: mime, size_bytes: file.size, sha256,
  });
  return id;
}

/** Suppression logique (restaurable) ; le fichier local et un envoi en attente sont abandonnés. */
export async function deleteDocument(engine: SyncEngine, db: LocalDb, doc: TripDocument) {
  await engine.remove("documents", doc.id);
  await db.transaction("rw", [db.files, db.uploads], async () => {
    await db.uploads.delete(doc.id);
    await db.files.delete(doc.id);
  });
}
