import type { SupabaseClient } from "@supabase/supabase-js";
import type { MutationResult, OutboxEntry, PullResponse } from "@/lib/types/sync";
import type { GroupMember, Profile, Trip } from "@/lib/types/trip";

/** Erreur réseau ou serveur indisponible : les mutations restent en file d'attente. */
export class NetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

/** Accès serveur utilisé par le moteur de synchro (remplaçable dans les tests). */
export interface RemoteApi {
  push(mutations: OutboxEntry[]): Promise<MutationResult[]>;
  pull(tripId: string, cursor: string | null): Promise<PullResponse>;
  listTrips(): Promise<Trip[]>;
  listMembers(groupId: string): Promise<{ members: GroupMember[]; profiles: Profile[] }>;
}

function isNetworkFailure(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return !error.code || /fetch|network|Failed to fetch|Load failed|timeout/i.test(error.message ?? "");
}

function fail(error: { message?: string; code?: string }, what: string): never {
  if (isNetworkFailure(error)) throw new NetworkError(`${what} : réseau indisponible`, error);
  throw new Error(`${what} : ${error.message ?? "erreur inconnue"}`);
}

export function supabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    async push(mutations) {
      const payload = mutations.map(({ mutation_id, table, op, id, base_version, data }) => ({
        mutation_id,
        table,
        op,
        id,
        base_version,
        data,
      }));
      const { data, error } = await client.rpc("sync_push", { p_mutations: payload });
      if (error) fail(error, "Envoi des modifications");
      return data as MutationResult[];
    },
    async pull(tripId, cursor) {
      const { data, error } = await client.rpc("sync_pull", { p_trip_id: tripId, p_cursor: cursor });
      if (error) fail(error, "Réception des modifications");
      return data as PullResponse;
    },
    async listTrips() {
      const { data, error } = await client.from("trips").select("*").is("deleted_at", null).order("start_date");
      if (error) fail(error, "Liste des voyages");
      return (data ?? []) as Trip[];
    },
    async listMembers(groupId) {
      const { data: members, error } = await client.from("group_members").select("*").eq("group_id", groupId);
      if (error) fail(error, "Membres du groupe");
      const ids = (members ?? []).map((m) => m.user_id as string);
      const { data: profiles, error: pErr } = await client.from("profiles").select("*").in("id", ids);
      if (pErr) fail(pErr, "Profils");
      return { members: (members ?? []) as GroupMember[], profiles: (profiles ?? []) as Profile[] };
    },
  };
}
