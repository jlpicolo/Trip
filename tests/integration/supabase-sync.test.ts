/**
 * Test d'intégration contre un VRAI projet Supabase (aucune simulation).
 * Crée 4 voyageurs + 1 compte extérieur, les fait collaborer via le moteur de
 * synchronisation, puis supprime tout. Lancement : npm run test:integration
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { NetworkError, supabaseRemote, type RemoteApi } from "@/lib/sync/remote";
import { newId } from "@/lib/ids";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const run = Date.now().toString(36);
const names = ["alice", "bruno", "chloe", "thomas", "mallory"] as const;
type Name = (typeof names)[number];

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const users: Partial<Record<Name, { id: string; client: SupabaseClient; engine: SyncEngine; db: LocalDb; email: string }>> = {};
const groupIds: string[] = [];
let tripId = "";

const u = (n: Name) => users[n]!;

beforeAll(async () => {
  for (const n of names) {
    const email = `jt-test-${run}-${n}@example.com`;
    const password = `Test-${newId()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: n[0].toUpperCase() + n.slice(1) },
    });
    if (error) throw error;
    const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
    const db = new LocalDb(`it-${run}-${n}`);
    users[n] = { id: data.user.id, client, db, email, engine: new SyncEngine(db, supabaseRemote(client)) };
  }
}, 60_000);

afterAll(async () => {
  for (const g of groupIds) await admin.from("travel_groups").delete().eq("id", g);
  if (tripId) await admin.from("activity_log").delete().eq("trip_id", tripId);
  for (const n of names) {
    const x = users[n];
    if (!x) continue;
    await admin.auth.admin.deleteUser(x.id);
    await x.db.delete();
  }
}, 60_000);

describe("Supabase réel : 4 voyageurs, un voyage partagé", () => {
  it("Alice crée le groupe et invite les 3 autres, qui acceptent", async () => {
    const { data: gid, error } = await u("alice").client.rpc("create_group", { p_name: "Japon 2027 (test)" });
    expect(error).toBeNull();
    groupIds.push(gid as string);
    for (const n of ["bruno", "chloe", "thomas"] as const) {
      const { data: token, error: iErr } = await u("alice").client.rpc("create_invitation", {
        p_group_id: gid,
        p_email: u(n).email,
      });
      expect(iErr).toBeNull();
      const { data: joined, error: aErr } = await u(n).client.rpc("accept_invitation", { p_token: token });
      expect(aErr).toBeNull();
      expect(joined).toBe(gid);
    }
    const { data: members } = await u("thomas").client.from("group_members").select("user_id").eq("group_id", gid);
    expect(members).toHaveLength(4);
  });

  it("Bruno crée le voyage hors ligne, il est envoyé au retour du réseau", async () => {
    const real = supabaseRemote(u("bruno").client);
    let offline = true;
    const flaky: RemoteApi = {
      ...real,
      push: (m) => (offline ? Promise.reject(new NetworkError("hors ligne")) : real.push(m)),
      pull: (t, c) => (offline ? Promise.reject(new NetworkError("hors ligne")) : real.pull(t, c)),
    };
    const engine = new SyncEngine(u("bruno").db, flaky);
    tripId = await engine.insert("trips", {
      group_id: groupIds[0],
      name: "Japan Trip",
      start_date: "2027-03-09",
      end_date: "2027-03-30",
      timezone: "Asia/Tokyo",
      base_currency: "EUR",
      secondary_currency: "JPY",
    });
    await engine.sync(tripId);
    expect(engine.getStatus()).toMatchObject({ online: false, pending: 1 });
    offline = false;
    await engine.sync(tripId);
    expect(engine.getStatus()).toMatchObject({ online: true, pending: 0 });
    const local = await u("bruno").db.data("trips").get(tripId);
    expect(local).toMatchObject({ version: 1, created_by: u("bruno").id });
  });

  it("les 3 autres voient le même voyage et le même lieu", async () => {
    const placeId = await u("bruno").engine.insert("places", {
      trip_id: tripId,
      name: "Fushimi Inari",
      category: "monument",
      city: "Kyoto",
      lat: 34.9671,
      lng: 135.7727,
    });
    await u("bruno").engine.sync(tripId);
    for (const n of ["alice", "chloe", "thomas"] as const) {
      await u(n).engine.refreshDirectory();
      await u(n).engine.sync(tripId);
      expect((await u(n).db.data("trips").get(tripId))?.name).toBe("Japan Trip");
      expect((await u(n).db.data("places").get(placeId))?.name).toBe("Fushimi Inari");
      expect(await u(n).db.members.where("group_id").equals(groupIds[0]).count()).toBe(4);
    }
  });

  it("modifications simultanées : champs différents fusionnés, même champ en conflit", async () => {
    const id = await u("alice").engine.insert("activities", { trip_id: tripId, title: "Temple", date: "2027-03-14" });
    await u("alice").engine.sync(tripId);
    await u("chloe").engine.sync(tripId);
    await u("thomas").engine.sync(tripId);

    await u("alice").engine.update("activities", id, { start_time: "07:00" });
    await u("chloe").engine.update("activities", id, { notes: "Prévoir de l'eau" });
    await u("thomas").engine.update("activities", id, { start_time: "09:30" });
    await u("alice").engine.sync(tripId);
    await u("chloe").engine.sync(tripId);
    await u("thomas").engine.sync(tripId);

    const { data: row } = await u("bruno").client.from("activities").select("*").eq("id", id).single();
    expect(row).toMatchObject({ start_time: "07:00:00", notes: "Prévoir de l'eau", version: 3 });
    expect(await u("chloe").db.conflicts.count()).toBe(0);
    const conflicts = await u("thomas").db.conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ fields: ["start_time"], local_patch: { start_time: "09:30" } });
  });

  it("l'historique nomme l'auteur de chaque modification", async () => {
    await u("alice").engine.sync(tripId);
    const log = await u("alice").db.activity_log.where("trip_id").equals(tripId).toArray();
    const created = log.find((l) => l.entity_type === "places" && l.action === "create");
    expect(created).toMatchObject({ actor_id: u("bruno").id, label: "Fushimi Inari", details: { city: "Kyoto" } });
  });

  it("le compte extérieur ne voit et ne modifie rien", async () => {
    const m = u("mallory");
    expect((await m.client.from("trips").select("id")).data).toEqual([]);
    expect((await m.client.from("places").select("id")).data).toEqual([]);
    const { error } = await m.client.rpc("sync_pull", { p_trip_id: tripId, p_cursor: null });
    expect(error?.message).toMatch(/forbidden/);
    const [res] = await supabaseRemote(m.client).push([
      {
        mutation_id: newId(),
        row_key: "x",
        table: "places",
        op: "insert",
        id: newId(),
        base_version: null,
        data: { trip_id: tripId, name: "Intrus" },
        created_at: new Date().toISOString(),
        attempts: 0,
      },
    ]);
    expect(res.status).toBe("error");
  });
});
