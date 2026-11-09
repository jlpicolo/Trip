export const SYNC_TABLES = [
  "trips",
  "trip_days",
  "places",
  "activities",
  "transports",
  "accommodations",
  "journal_entries",
  "documents",
  "expenses",
  "settlements",
  "personal_expenses",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export type MutationOp = "insert" | "update" | "delete";

/** Colonnes gérées exclusivement par le serveur (triggers), jamais envoyées. */
export const SERVER_COLUMNS = [
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "deleted_at",
  "txid",
  "nights",
] as const;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type RowData = { [column: string]: JsonValue | undefined };

export interface SyncedRow extends RowData {
  id: string;
  version: number;
  deleted_at: string | null;
}

export interface OutboxEntry {
  seq?: number;
  mutation_id: string;
  row_key: string;
  table: SyncTable;
  op: MutationOp;
  id: string;
  base_version: number | null;
  data: RowData;
  created_at: string;
  attempts: number;
}

export type MutationStatus = "ok" | "conflict" | "not_found" | "error";

export interface MutationResult {
  mutation_id: string;
  status: MutationStatus;
  row?: SyncedRow | null;
  error?: string;
  code?: string;
}

export interface PullResponse {
  cursor: string;
  tables: Partial<Record<SyncTable | "activity_log", SyncedRow[]>>;
}

export type ConflictKind = "update_update" | "delete_vs_update" | "update_vs_delete" | "insert_insert";

export interface ConflictRecord {
  id: string;
  row_key: string;
  table: SyncTable;
  row_id: string;
  kind: ConflictKind;
  fields: string[];
  local_patch: RowData;
  base_row: SyncedRow | null;
  server_row: SyncedRow;
  created_at: string;
}

export interface RejectedMutation {
  id?: number;
  table: SyncTable;
  row_id: string;
  op: MutationOp;
  data: RowData;
  reason: string;
  code?: string;
  created_at: string;
}

export interface Shadow {
  row_key: string;
  row: SyncedRow;
}

export const rowKey = (table: SyncTable, id: string) => `${table}:${id}`;
