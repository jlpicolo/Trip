import type { LocalDb } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { NetworkError, type RemoteApi } from "@/lib/sync/remote";
import { omit, pick, threeWayMerge } from "@/lib/sync/merge";
import {
  SERVER_COLUMNS,
  SYNC_TABLES,
  rowKey,
  type ConflictRecord,
  type MutationOp,
  type MutationResult,
  type OutboxEntry,
  type RowData,
  type SyncTable,
  type SyncedRow,
} from "@/lib/types/sync";

export interface SyncStatus {
  syncing: boolean;
  pending: number;
  /** Fichiers ajoutés sur cet appareil et pas encore envoyés. */
  pendingFiles: number;
  conflicts: number;
  rejected: number;
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean;
}

const BATCH = 100;

/** Tant que cette clé est absente, l'appareil ignore encore quels voyages existent. */
export const DIRECTORY_LOADED_KEY = "directoryLoadedAt";
const stripServer = (data: RowData) => omit(data, [...SERVER_COLUMNS, "id"]);

/**
 * Moteur offline-first : toutes les écritures passent par `mutate` (IndexedDB +
 * file d'attente), `sync` envoie la file puis récupère les changements des autres.
 */
export class SyncEngine {
  private listeners = new Set<(s: SyncStatus) => void>();
  private status: SyncStatus = {
    syncing: false,
    pending: 0,
    pendingFiles: 0,
    conflicts: 0,
    rejected: 0,
    lastSyncAt: null,
    lastError: null,
    online: true,
  };
  private inFlight = new Set<string>();
  private running: Promise<void> | null = null;
  private paused = false;

  constructor(
    readonly db: LocalDb,
    private remote: RemoteApi,
    private now: () => Date = () => new Date(),
    /** Envoi des fichiers en attente, AVANT les fiches : les autres voient ainsi le fichier dès la fiche. */
    private uploadFiles?: () => Promise<void>,
  ) {}

  // ---------------------------------------------------------------- état

  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private async refreshStatus(patch: Partial<SyncStatus> = {}) {
    const [pending, pendingFiles, conflicts, rejected, lastSyncAt] = await Promise.all([
      this.db.outbox.count(),
      this.db.uploads.count(),
      this.db.conflicts.count(),
      this.db.rejected.count(),
      this.db.getMeta<string>("lastSyncAt"),
    ]);
    this.status = { ...this.status, pending, pendingFiles, conflicts, rejected, lastSyncAt: lastSyncAt ?? null, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  // ---------------------------------------------------------------- écritures locales

  async insert(table: SyncTable, data: RowData & { id?: string }): Promise<string> {
    const id = data.id ?? newId();
    await this.mutate(table, "insert", id, data);
    return id;
  }

  update(table: SyncTable, id: string, patch: RowData): Promise<void> {
    return this.mutate(table, "update", id, patch);
  }

  remove(table: SyncTable, id: string): Promise<void> {
    return this.mutate(table, "delete", id, {});
  }

  /**
   * Applique la modification localement et l'ajoute à la file. Une seule mutation
   * non envoyée par ligne : les modifications successives sont fusionnées, ce qui
   * garde une version de base cohérente pour le verrouillage optimiste.
   */
  async mutate(table: SyncTable, op: MutationOp, id: string, input: RowData): Promise<void> {
    const key = rowKey(table, id);
    const data = op === "delete" ? {} : stripServer(input);
    const ts = this.now().toISOString();
    await this.db.transaction("rw", [this.db.data(table), this.db.outbox, this.db.shadows], async () => {
      const current = await this.db.data(table).get(id);
      const queued = (await this.db.outbox.where("row_key").equals(key).toArray()).filter(
        (e) => !this.inFlight.has(e.mutation_id),
      );
      const open = queued.at(-1);

      if (op === "insert") {
        if (current && !current.deleted_at) throw new Error("Cet élément existe déjà.");
        await this.db.data(table).put({ ...data, id, version: 0, deleted_at: null } as SyncedRow);
      } else {
        if (!current || current.deleted_at) throw new Error("Cet élément n'existe plus.");
        if (op === "update") await this.db.data(table).put({ ...current, ...data });
        else await this.db.data(table).put({ ...current, deleted_at: ts });
      }

      if (open) {
        if (open.op === "delete") throw new Error("Cet élément a été supprimé.");
        if (op === "delete" && open.op === "insert" && !(await this.hasBeenSent(key))) {
          await this.db.outbox.delete(open.seq!);
          await this.db.data(table).delete(id);
          return;
        }
        const merged: OutboxEntry =
          op === "delete" ? { ...open, op: "delete", data: {} } : { ...open, data: { ...open.data, ...data } };
        await this.db.outbox.put(merged);
        return;
      }

      const shadow = await this.db.shadows.get(key);
      await this.db.outbox.add({
        mutation_id: newId(),
        row_key: key,
        table,
        op,
        id,
        base_version: op === "insert" ? null : (shadow?.row.version ?? current?.version ?? null),
        data,
        created_at: ts,
        attempts: 0,
      });
    });
    await this.refreshStatus();
  }

  private async hasBeenSent(key: string): Promise<boolean> {
    return (await this.db.shadows.get(key)) !== undefined;
  }

  // ---------------------------------------------------------------- synchronisation

  /**
   * Suspend toute synchronisation et attend la fin de celle en cours : indispensable
   * avant d'effacer la base locale, sinon une réponse tardive y réécrirait des données.
   */
  async pause(): Promise<void> {
    this.paused = true;
    await this.running?.catch(() => undefined);
  }

  resume(): void {
    this.paused = false;
  }

  /** Envoie la file puis récupère les changements. Appels concurrents fusionnés. */
  sync(tripId: string | null): Promise<void> {
    if (this.paused) return Promise.resolve();
    this.running ??= this.runSync(tripId).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runSync(tripId: string | null) {
    await this.refreshStatus({ syncing: true, lastError: null });
    try {
      await this.uploadFiles?.();
      await this.pushAll();
      if (tripId) await this.pull(tripId);
      await this.db.setMeta("lastSyncAt", this.now().toISOString());
      await this.refreshStatus({ syncing: false, online: true });
    } catch (e) {
      const offline = e instanceof NetworkError;
      await this.refreshStatus({
        syncing: false,
        online: !offline,
        lastError: offline ? "Hors ligne : les modifications sont conservées sur l'appareil." : (e as Error).message,
      });
      if (!offline) throw e;
    }
  }

  async pushAll(): Promise<void> {
    for (;;) {
      const batch = await this.db.outbox.orderBy("seq").limit(BATCH).toArray();
      if (batch.length === 0) return;
      // Une mutation dont la version de base est inconnue attend l'accusé de
      // réception de la création de la ligne (envoyée dans le même lot).
      const sendable: OutboxEntry[] = [];
      const seen = new Set<string>();
      for (const e of batch) {
        if (seen.has(e.row_key)) break;
        seen.add(e.row_key);
        sendable.push(e);
      }
      sendable.forEach((e) => this.inFlight.add(e.mutation_id));
      let results: MutationResult[];
      try {
        results = await this.remote.push(sendable);
      } finally {
        sendable.forEach((e) => this.inFlight.delete(e.mutation_id));
      }
      const byId = new Map(results.map((r) => [r.mutation_id, r]));
      for (const entry of sendable) {
        const result = byId.get(entry.mutation_id);
        if (result) await this.applyResult(entry, result);
      }
    }
  }

  private async applyResult(entry: OutboxEntry, result: MutationResult) {
    const table = this.db.data(entry.table);
    await this.db.transaction(
      "rw",
      [table, this.db.outbox, this.db.shadows, this.db.conflicts, this.db.rejected],
      async () => {
        await this.db.outbox.delete(entry.seq!);
        const later = await this.db.outbox.where("row_key").equals(entry.row_key).toArray();

        if (result.status === "ok" && result.row) {
          const row = result.row;
          await this.db.shadows.put({ row_key: entry.row_key, row });
          for (const l of later) await this.db.outbox.put({ ...l, base_version: row.version });
          const pendingPatch = Object.assign({}, ...later.map((l) => l.data));
          await table.put({ ...row, ...pendingPatch });
          return;
        }

        if (result.status === "conflict" && result.row) {
          await this.handleConflict(entry, result.row, later);
          return;
        }

        if (result.status === "not_found") {
          // Ligne supprimée définitivement ou devenue inaccessible : rien à réessayer.
          for (const l of later) await this.db.outbox.delete(l.seq!);
          await this.db.rejected.add({
            table: entry.table,
            row_id: entry.id,
            op: entry.op,
            data: entry.data,
            reason: "Élément introuvable sur le serveur (supprimé ou inaccessible).",
            created_at: this.now().toISOString(),
          });
          return;
        }

        // Refus de validation : la retenter ne changerait rien. On rétablit la
        // dernière version serveur connue et on conserve la saisie pour l'utilisateur.
        const shadow = await this.db.shadows.get(entry.row_key);
        if (later.length === 0) {
          if (shadow) await table.put(shadow.row);
          else if (entry.op === "insert") await table.delete(entry.id);
        }
        await this.db.rejected.add({
          table: entry.table,
          row_id: entry.id,
          op: entry.op,
          data: entry.data,
          reason: result.error ?? "Modification refusée par le serveur.",
          code: result.code,
          created_at: this.now().toISOString(),
        });
      },
    );
  }

  private async handleConflict(entry: OutboxEntry, server: SyncedRow, later: OutboxEntry[]) {
    const table = this.db.data(entry.table);
    const base = (await this.db.shadows.get(entry.row_key))?.row ?? null;
    const record = (kind: ConflictRecord["kind"], fields: string[], patch: RowData): ConflictRecord => ({
      id: newId(),
      row_key: entry.row_key,
      table: entry.table,
      row_id: entry.id,
      kind,
      fields,
      local_patch: patch,
      base_row: base,
      server_row: server,
      created_at: this.now().toISOString(),
    });

    await this.db.shadows.put({ row_key: entry.row_key, row: server });
    for (const l of later) await this.db.outbox.put({ ...l, base_version: server.version });

    if (entry.op === "delete") {
      // Suppression locale d'un élément modifié entre-temps par quelqu'un d'autre.
      await table.put(server);
      if (!server.deleted_at) await this.db.conflicts.put(record("delete_vs_update", [], {}));
      return;
    }

    if (server.deleted_at) {
      await table.put(server);
      await this.db.conflicts.put(record("update_vs_delete", Object.keys(entry.data), entry.data));
      return;
    }

    const { safePatch, conflicting } = threeWayMerge(base, entry.data, server);
    if (Object.keys(safePatch).length > 0) {
      await this.db.outbox.add({
        ...entry,
        seq: undefined,
        mutation_id: newId(),
        op: "update",
        base_version: server.version,
        data: safePatch,
        attempts: entry.attempts + 1,
      });
    }
    if (conflicting.length > 0) {
      await this.db.conflicts.put(
        record(entry.op === "insert" ? "insert_insert" : "update_update", conflicting, pick(entry.data, conflicting)),
      );
    }
    const pendingPatch = Object.assign({}, safePatch, ...later.map((l) => l.data));
    await table.put({ ...server, ...pendingPatch });
  }

  async pull(tripId: string): Promise<void> {
    const cursorKey = `cursor:${tripId}`;
    const cursor = (await this.db.getMeta<string>(cursorKey)) ?? null;
    const res = await this.remote.pull(tripId, cursor);
    await this.db.transaction(
      "rw",
      [...SYNC_TABLES.map((t) => this.db.data(t)), this.db.outbox, this.db.shadows, this.db.activity_log, this.db.meta],
      async () => {
        for (const t of SYNC_TABLES) {
          for (const row of res.tables[t] ?? []) await this.applyServerRow(t, row);
        }
        const log = (res.tables.activity_log ?? []) as unknown as import("@/lib/types/trip").ActivityLogEntry[];
        if (log.length) await this.db.activity_log.bulkPut(log);
        await this.db.setMeta(cursorKey, res.cursor);
      },
    );
  }

  private async applyServerRow(t: SyncTable, row: SyncedRow) {
    const key = rowKey(t, row.id);
    const pending = await this.db.outbox.where("row_key").equals(key).toArray();
    if (pending.length === 0) {
      await this.db.shadows.put({ row_key: key, row });
      await this.db.data(t).put(row);
      return;
    }
    // Ne PAS avancer la version de base : la fusion à l'envoi doit pouvoir
    // détecter les champs modifiés par les autres depuis la saisie locale.
    if (pending.some((p) => p.op === "delete")) return;
    const patch = Object.assign({}, ...pending.map((p) => p.data));
    await this.db.data(t).put({ ...row, ...patch, version: row.version });
  }

  // ---------------------------------------------------------------- conflits

  /**
   * Résout un conflit : `choices[champ] = "local" | "server"`. Les valeurs locales
   * retenues sont renvoyées sur la base de la version serveur connue.
   */
  async resolveConflict(conflictId: string, choices: Record<string, "local" | "server">): Promise<void> {
    const c = await this.db.conflicts.get(conflictId);
    if (!c) return;
    await this.db.conflicts.delete(conflictId);
    if (c.kind === "delete_vs_update") {
      if (choices._delete === "local") await this.remove(c.table, c.row_id);
    } else if (c.kind === "update_vs_delete") {
      if (choices._restore === "local") {
        const { id: _id, ...rest } = c.server_row;
        void _id;
        await this.insert(c.table, { ...stripServer(rest), ...c.local_patch });
      }
    } else {
      const keep = c.fields.filter((f) => choices[f] === "local");
      if (keep.length) await this.update(c.table, c.row_id, pick(c.local_patch, keep));
    }
    await this.refreshStatus();
  }

  async dismissRejected(id: number): Promise<void> {
    await this.db.rejected.delete(id);
    await this.refreshStatus();
  }

  // ---------------------------------------------------------------- annuaire

  /** Met à jour voyages, membres et profils. Marque l'annuaire comme chargé au moins une fois. */
  async refreshDirectory(): Promise<void> {
    if (this.paused) return;
    const trips = await this.remote.listTrips();
    if (this.paused) return;
    const groups = [...new Set(trips.map((t) => t.group_id))];
    for (const trip of trips) await this.applyServerRow("trips", trip);
    for (const g of groups) {
      const { members, profiles } = await this.remote.listMembers(g);
      await this.db.transaction("rw", this.db.members, this.db.profiles, async () => {
        await this.db.members.where("group_id").equals(g).delete();
        await this.db.members.bulkPut(members);
        await this.db.profiles.bulkPut(profiles);
      });
    }
    await this.db.setMeta(DIRECTORY_LOADED_KEY, this.now().toISOString());
  }
}
