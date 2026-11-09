import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { dayId } from "@/lib/ids";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
let n = 0;
let server: FakeServer;
let dbs: LocalDb[] = [];

function device(user: string) {
  const db = new LocalDb(`test-${++n}`);
  dbs.push(db);
  return new SyncEngine(db, server.remote(user));
}

async function seedTrip(e: SyncEngine) {
  await e.insert("trips", { id: TRIP, group_id: "g", name: "Japan Trip", start_date: "2027-03-09", end_date: "2027-03-30" });
  await e.sync(TRIP);
}

beforeEach(() => {
  server = new FakeServer();
});
afterEach(async () => {
  for (const db of dbs) await db.delete();
  dbs = [];
});

describe("écritures locales et file d'attente", () => {
  it("une création hors ligne est visible localement et conservée jusqu'au retour du réseau", async () => {
    const a = device("alice");
    server.offline = true;
    const id = await a.insert("places", { trip_id: TRIP, name: "Dotonbori" });
    await a.sync(TRIP);
    expect(a.getStatus()).toMatchObject({ online: false, pending: 1 });
    expect((await a.db.data("places").get(id))?.name).toBe("Dotonbori");

    server.offline = false;
    await a.sync(TRIP);
    expect(a.getStatus()).toMatchObject({ online: true, pending: 0 });
    expect((await a.db.data("places").get(id))?.version).toBe(1);
  });

  it("fusionne création + modifications non envoyées en une seule mutation", async () => {
    const a = device("alice");
    const id = await a.insert("places", { trip_id: TRIP, name: "A" });
    await a.update("places", id, { name: "B" });
    await a.update("places", id, { notes: "n" });
    expect(await a.db.outbox.count()).toBe(1);
    await a.sync(TRIP);
    expect(server.rows.get(`places:${id}`)).toMatchObject({ name: "B", notes: "n", version: 1 });
  });

  it("créer puis supprimer avant envoi n'envoie rien", async () => {
    const a = device("alice");
    const id = await a.insert("places", { trip_id: TRIP, name: "A" });
    await a.remove("places", id);
    await a.sync(TRIP);
    expect(server.pushCalls).toBe(0);
    expect(await a.db.data("places").get(id)).toBeUndefined();
  });

  it("accusé de réception perdu : le renvoi ne crée pas de doublon (dépense)", async () => {
    const a = device("alice");
    server.dropNextResponse = true;
    const id = await a.insert("expenses", { trip_id: TRIP, title: "Ramen", amount_minor: 1000 });
    await a.sync(TRIP);
    expect(a.getStatus().pending).toBe(1);
    await a.sync(TRIP);
    expect(a.getStatus().pending).toBe(0);
    expect([...server.rows.keys()].filter((k) => k.startsWith("expenses:"))).toEqual([`expenses:${id}`]);
    expect(server.applied.size).toBe(1);
  });

  it("modification pendant un envoi : la version de base est mise à jour après l'accusé", async () => {
    const a = device("alice");
    const id = await a.insert("places", { trip_id: TRIP, name: "A" });
    await a.sync(TRIP);
    await a.update("places", id, { name: "B" });
    await a.sync(TRIP);
    await a.update("places", id, { name: "C" });
    await a.sync(TRIP);
    expect(server.rows.get(`places:${id}`)).toMatchObject({ name: "C", version: 3 });
    expect(await a.db.conflicts.count()).toBe(0);
  });
});

describe("collaboration entre appareils", () => {
  it("un autre voyageur reçoit les créations, modifications et suppressions", async () => {
    const a = device("alice");
    const b = device("bruno");
    await seedTrip(a);
    const id = await a.insert("activities", { trip_id: TRIP, title: "Fushimi Inari", date: "2027-03-14" });
    await a.sync(TRIP);
    await b.sync(TRIP);
    expect((await b.db.data("trips").get(TRIP))?.name).toBe("Japan Trip");
    expect((await b.db.data("activities").get(id))?.title).toBe("Fushimi Inari");

    await a.remove("activities", id);
    await a.sync(TRIP);
    await b.sync(TRIP);
    expect((await b.db.data("activities").get(id))?.deleted_at).not.toBeNull();
  });

  it("modifications concurrentes de champs différents : fusion automatique, rien n'est perdu", async () => {
    const a = device("alice");
    const b = device("bruno");
    await seedTrip(a);
    const id = await a.insert("activities", { trip_id: TRIP, title: "Temple", notes: "" });
    await a.sync(TRIP);
    await b.sync(TRIP);

    await a.update("activities", id, { start_time: "07:00" });
    await b.update("activities", id, { notes: "Prévoir de l'eau" });
    await a.sync(TRIP);
    await b.sync(TRIP);
    await a.sync(TRIP);

    expect(server.rows.get(`activities:${id}`)).toMatchObject({ start_time: "07:00", notes: "Prévoir de l'eau", version: 3 });
    expect(await b.db.conflicts.count()).toBe(0);
    expect(await a.db.data("activities").get(id)).toMatchObject({ start_time: "07:00", notes: "Prévoir de l'eau" });
  });

  it("même champ modifié par deux voyageurs : conflit explicite, aucune écriture silencieuse", async () => {
    const a = device("alice");
    const b = device("bruno");
    await seedTrip(a);
    const id = await a.insert("activities", { trip_id: TRIP, title: "Temple" });
    await a.sync(TRIP);
    await b.sync(TRIP);

    await a.update("activities", id, { title: "Kinkaku-ji" });
    await b.update("activities", id, { title: "Ginkaku-ji" });
    await a.sync(TRIP);
    await b.sync(TRIP);

    expect(server.rows.get(`activities:${id}`)?.title).toBe("Kinkaku-ji");
    const [conflict] = await b.db.conflicts.toArray();
    expect(conflict).toMatchObject({ kind: "update_update", fields: ["title"], local_patch: { title: "Ginkaku-ji" } });
    expect((await b.db.data("activities").get(id))?.title).toBe("Kinkaku-ji");
    expect(b.getStatus().conflicts).toBe(1);

    await b.resolveConflict(conflict.id, { title: "local" });
    await b.sync(TRIP);
    expect(server.rows.get(`activities:${id}`)?.title).toBe("Ginkaku-ji");
    expect(await b.db.conflicts.count()).toBe(0);
  });

  it("un pull pendant une modification en attente ne masque pas un conflit", async () => {
    const a = device("alice");
    const b = device("bruno");
    await seedTrip(a);
    const id = await a.insert("activities", { trip_id: TRIP, title: "Temple" });
    await a.sync(TRIP);
    await b.sync(TRIP);

    server.offline = true;
    await b.update("activities", id, { title: "Version Bruno" });
    server.offline = false;
    await a.update("activities", id, { title: "Version Alice" });
    await a.sync(TRIP);
    await b.pull(TRIP); // pull seul : la modification de Bruno est encore en attente
    expect((await b.db.data("activities").get(id))?.title).toBe("Version Bruno");
    await b.sync(TRIP);
    expect(server.rows.get(`activities:${id}`)?.title).toBe("Version Alice");
    expect(await b.db.conflicts.count()).toBe(1);
  });

  it("suppression locale d'un élément modifié par un autre : conflit, l'élément est conservé", async () => {
    const a = device("alice");
    const b = device("bruno");
    await seedTrip(a);
    const id = await a.insert("places", { trip_id: TRIP, name: "Nishiki" });
    await a.sync(TRIP);
    await b.sync(TRIP);
    await a.update("places", id, { notes: "ouvert 9h" });
    await b.remove("places", id);
    await a.sync(TRIP);
    await b.sync(TRIP);
    expect(server.rows.get(`places:${id}`)?.deleted_at).toBeNull();
    expect((await b.db.conflicts.toArray())[0]?.kind).toBe("delete_vs_update");
    expect((await b.db.data("places").get(id))?.deleted_at).toBeNull();
  });

  it("journée créée hors ligne sur deux appareils : même identifiant, pas de doublon", async () => {
    const a = device("alice");
    const b = device("bruno");
    const id = dayId(TRIP, "2027-03-14");
    expect(dayId(TRIP, "2027-03-14")).toBe(id);
    await a.insert("trip_days", { id, trip_id: TRIP, date: "2027-03-14", city: "Kyoto" });
    await b.insert("trip_days", { id, trip_id: TRIP, date: "2027-03-14", notes: "journée libre" });
    await a.sync(TRIP);
    await b.sync(TRIP);
    expect(server.rows.get(`trip_days:${id}`)).toMatchObject({ city: "Kyoto", notes: "journée libre" });
    expect(await b.db.conflicts.count()).toBe(0);
  });
});

describe("refus du serveur", () => {
  it("une mutation invalide est retirée de la file, la saisie conservée dans les refus", async () => {
    const a = device("alice");
    server.push = (_user, muts) =>
      muts.map((m) => ({ mutation_id: m.mutation_id, status: "error" as const, error: "shares_sum_mismatch" }));
    const id = await a.insert("expenses", { trip_id: TRIP, title: "Taxi" });
    await a.sync(TRIP);
    expect(a.getStatus()).toMatchObject({ pending: 0, rejected: 1 });
    expect(await a.db.data("expenses").get(id)).toBeUndefined();
    expect((await a.db.rejected.toArray())[0]).toMatchObject({ reason: "shares_sum_mismatch", data: { title: "Taxi" } });
  });
});
