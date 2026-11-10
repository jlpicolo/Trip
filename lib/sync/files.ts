import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalDb } from "@/lib/db/schema";
import { NetworkError } from "@/lib/sync/remote";
import { AUTO_DOWNLOAD, concerns } from "@/lib/tickets";
import type { TripDocument } from "@/lib/types/tickets";

export const BUCKET = "trip-files";

/** Stockage des fichiers du voyage (remplaçable dans les tests). */
export interface FileRemote {
  upload(path: string, blob: Blob, contentType: string): Promise<void>;
  download(path: string): Promise<Blob>;
}

/** Fichier absent du stockage : l'appareil qui l'a ajouté ne l'a pas encore envoyé. */
export class FileMissingError extends Error {
  constructor() {
    super("Le fichier n'est pas encore disponible : l'appareil qui l'a ajouté doit d'abord se synchroniser.");
    this.name = "FileMissingError";
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isNetwork = (e: unknown) =>
  e instanceof TypeError || /fetch|network|Load failed|timeout/i.test((e as Error)?.message ?? "");

export function supabaseFiles(client: SupabaseClient): FileRemote {
  return {
    async upload(path, blob, contentType) {
      let res;
      try {
        res = await client.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
      } catch (e) {
        throw new NetworkError("Envoi du fichier : réseau indisponible", e);
      }
      if (!res.error) return;
      const status = String((res.error as { statusCode?: string | number }).statusCode ?? "");
      // Déjà présent : un envoi précédent a abouti mais sa réponse a été perdue.
      if (status === "409" || /exists|duplicate/i.test(res.error.message)) return;
      if (isNetwork(res.error)) throw new NetworkError("Envoi du fichier : réseau indisponible", res.error);
      throw new Error(`Envoi du fichier refusé : ${res.error.message}`);
    },
    async download(path) {
      let res;
      try {
        res = await client.storage.from(BUCKET).download(path);
      } catch (e) {
        throw new NetworkError("Téléchargement : réseau indisponible", e);
      }
      if (res.data) return res.data;
      const err = res.error as { message?: string; status?: number; statusCode?: string | number } | null;
      const status = String(err?.statusCode ?? err?.status ?? "");
      if (status === "404" || /not.?found/i.test(err?.message ?? "")) throw new FileMissingError();
      if (isNetwork(err)) throw new NetworkError("Téléchargement : réseau indisponible", err);
      throw new Error(`Téléchargement impossible : ${err?.message ?? "erreur inconnue"}`);
    },
  };
}

/**
 * Fichiers des documents : envoi différé (file `uploads`), téléchargement vérifié par
 * SHA-256, et disponibilité hors ligne établie par la seule présence du blob local.
 */
export class FileSync {
  constructor(private db: LocalDb, private remote: FileRemote) {}

  /** Envoie les fichiers en attente. Réseau absent : on s'arrête (NetworkError propagée). */
  async uploadPending(): Promise<void> {
    for (const up of await this.db.uploads.toArray()) {
      const file = await this.db.files.get(up.document_id);
      if (!file) {
        await this.db.uploads.delete(up.document_id);
        continue;
      }
      try {
        await this.remote.upload(up.storage_path, file.blob, up.mime_type);
        await this.db.uploads.delete(up.document_id);
      } catch (e) {
        if (e instanceof NetworkError) throw e;
        await this.db.uploads.update(up.document_id, { attempts: up.attempts + 1, last_error: (e as Error).message });
      }
    }
  }

  /** Télécharge le fichier d'un document sur l'appareil (contrôle d'intégrité compris). */
  async download(doc: TripDocument): Promise<void> {
    if (doc.kind !== "file" || !doc.storage_path) throw new Error("Ce document n'a pas de fichier.");
    const blob = await this.remote.download(doc.storage_path);
    const hash = await sha256Hex(blob);
    if (doc.sha256 && hash !== doc.sha256) throw new Error("Fichier reçu altéré (empreinte différente) : réessayez.");
    const typed = doc.mime_type && blob.type !== doc.mime_type ? new Blob([blob], { type: doc.mime_type }) : blob;
    await this.db.files.put({ document_id: doc.id, blob: typed, sha256: hash, saved_at: new Date().toISOString() });
  }

  /** Retire le fichier de l'appareil (jamais un fichier pas encore envoyé : ce serait le perdre). */
  async forget(documentId: string): Promise<void> {
    if (await this.db.uploads.get(documentId)) throw new Error("Ce fichier n'a pas encore été envoyé : il ne peut pas être retiré de l'appareil.");
    await this.db.files.delete(documentId);
  }

  /**
   * Après une synchro : télécharge les billets et confirmations qui concernent le voyageur.
   * Les pièces d'identité restent à la demande. Un échec n'interrompt pas les suivants.
   */
  async autoDownload(tripId: string, userId: string): Promise<number> {
    const docs = ((await this.db.data("documents").where("trip_id").equals(tripId).toArray()) as TripDocument[])
      .filter((d) => !d.deleted_at && d.kind === "file" && AUTO_DOWNLOAD.has(d.category) && concerns(d, userId));
    const present = new Set(await this.db.files.where("document_id").anyOf(docs.map((d) => d.id)).primaryKeys());
    let done = 0;
    for (const d of docs) {
      if (present.has(d.id)) continue;
      try {
        await this.download(d);
        done++;
      } catch (e) {
        if (e instanceof NetworkError) throw e;
      }
    }
    return done;
  }
}
