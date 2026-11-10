import Dexie, { type Table } from "dexie";
import { SYNC_TABLES, type ConflictRecord, type OutboxEntry, type RejectedMutation, type Shadow, type SyncTable, type SyncedRow } from "@/lib/types/sync";
import type { LocalFile, PendingUpload } from "@/lib/types/tickets";
import type { ActivityLogEntry, GroupMember, Profile } from "@/lib/types/trip";

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class LocalDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  shadows!: Table<Shadow, string>;
  conflicts!: Table<ConflictRecord, string>;
  rejected!: Table<RejectedMutation, number>;
  activity_log!: Table<ActivityLogEntry, number>;
  members!: Table<GroupMember, [string, string]>;
  profiles!: Table<Profile, string>;
  meta!: Table<MetaEntry, string>;
  files!: Table<LocalFile, string>;
  uploads!: Table<PendingUpload, string>;

  constructor(name: string) {
    super(name);
    const dataTables = Object.fromEntries(SYNC_TABLES.map((t) => [t, t === "trips" ? "&id, group_id" : "&id, trip_id"]));
    this.version(1).stores({
      ...dataTables,
      outbox: "++seq, row_key, &mutation_id",
      shadows: "&row_key",
      conflicts: "&id, row_key",
      rejected: "++id",
      activity_log: "&id, trip_id, created_at",
      members: "&[group_id+user_id], group_id, user_id",
      profiles: "&id",
      meta: "&key",
    });
    this.version(2).stores({
      files: "&document_id",
      uploads: "&document_id, trip_id",
    });
  }

  data(table: SyncTable): Table<SyncedRow, string> {
    return this.table(table);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

let shared: LocalDb | null = null;

/** Base locale unique de l'application (navigateur). */
export function getLocalDb(): LocalDb {
  shared ??= new LocalDb("japan-trip");
  return shared;
}

/** Purge complète (déconnexion ou changement de compte sur l'appareil). */
export async function wipeLocalDb(db: LocalDb): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
