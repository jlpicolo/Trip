import type { RemoteApi } from "@/lib/sync/remote";
import { NetworkError } from "@/lib/sync/remote";
import { SERVER_COLUMNS, type MutationResult, type OutboxEntry, type PullResponse, type SyncedRow } from "@/lib/types/sync";
import type { GroupMember, Profile, Trip } from "@/lib/types/trip";

/** Réplique en mémoire de la sémantique de sync_push / sync_pull (migration SQL). */
export class FakeServer {
  rows = new Map<string, SyncedRow & { _tx: number; _table: string }>();
  applied = new Map<string, MutationResult>();
  tx = 0;
  offline = false;
  /** Simule un accusé de réception perdu : le serveur applique mais le client ne reçoit rien. */
  dropNextResponse = false;
  pushCalls = 0;

  remote(user: string): RemoteApi {
    return {
      push: async (muts) => this.push(user, muts),
      pull: async (tripId, cursor) => this.pull(tripId, cursor),
      listTrips: async () => {
        if (this.offline) throw new NetworkError("hors ligne");
        return [...this.rows.values()].filter((r) => r._table === "trips").map((r) => this.clean(r)) as unknown as Trip[];
      },
      listMembers: async () => ({ members: [] as GroupMember[], profiles: [] as Profile[] }),
    };
  }

  private clean(r: SyncedRow & { _tx: number; _table: string }): SyncedRow {
    const { _tx, _table, ...row } = r;
    void _tx;
    void _table;
    return structuredClone(row) as SyncedRow;
  }

  push(user: string, muts: OutboxEntry[]): MutationResult[] {
    this.pushCalls++;
    if (this.offline) throw new NetworkError("hors ligne");
    const tx = ++this.tx;
    const results = muts.map((m) => {
      const prev = this.applied.get(m.mutation_id);
      if (prev) return prev;
      const key = `${m.table}:${m.id}`;
      const existing = this.rows.get(key);
      const data = Object.fromEntries(
        Object.entries(m.data).filter(([k]) => !(SERVER_COLUMNS as readonly string[]).includes(k) && k !== "id"),
      );
      let res: MutationResult;
      if (m.op === "insert") {
        if (existing) res = { mutation_id: m.mutation_id, status: "conflict", row: this.clean(existing) };
        else {
          const row = { ...data, id: m.id, version: 1, deleted_at: null, created_by: user, updated_by: user, _tx: tx, _table: m.table };
          this.rows.set(key, row as never);
          res = { mutation_id: m.mutation_id, status: "ok", row: this.clean(row as never) };
        }
      } else if (!existing) {
        res = { mutation_id: m.mutation_id, status: "not_found", row: null };
      } else if (existing.version !== m.base_version) {
        res = { mutation_id: m.mutation_id, status: "conflict", row: this.clean(existing) };
      } else {
        const { trip_id: _t, ...patch } = data;
        void _t;
        const row = {
          ...existing,
          ...(m.op === "delete" ? { deleted_at: new Date().toISOString() } : patch),
          version: existing.version + 1,
          updated_by: user,
          _tx: tx,
        };
        this.rows.set(key, row);
        res = { mutation_id: m.mutation_id, status: "ok", row: this.clean(row) };
      }
      if (res.status === "ok") this.applied.set(m.mutation_id, res);
      return res;
    });
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new NetworkError("réponse perdue");
    }
    return results;
  }

  pull(tripId: string, cursor: string | null): PullResponse {
    if (this.offline) throw new NetworkError("hors ligne");
    const since = cursor ? Number(cursor) : 0;
    const tables: PullResponse["tables"] = {};
    for (const r of this.rows.values()) {
      const inTrip = r._table === "trips" ? r.id === tripId : r.trip_id === tripId;
      if (!inTrip || r._tx <= since) continue;
      ((tables as Record<string, SyncedRow[]>)[r._table] ??= []).push(this.clean(r));
    }
    return { cursor: String(this.tx), tables };
  }
}
