import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { activitiesOfTrip, deleteActivity, moveActivity, reorderActivity, saveActivity, saveDay, setActivityDone } from "@/lib/db/planning";
import { bucketActivities, compareActivities } from "@/lib/planning";
import { dayId } from "@/lib/ids";
import type { Activity } from "@/lib/types/planning";
import type { ActivityPatch } from "@/lib/validation/activity";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
let server: FakeServer;
let db: LocalDb;
let engine: SyncEngine;
let n = 0;

const patch = (o: Partial<ActivityPatch>): ActivityPatch => ({
  title: "x", category: "visit", date: "2027-03-14", start_time: null, end_time: null, duration_minutes: null, description: null,
  notes: null, url: null, estimated_cost_minor: null, estimated_cost_currency: null, travel_minutes_estimate: null, travel_mode: null, ...o,
});
const add = (o: Partial<ActivityPatch>, place: { address: string | null; lat: number | null; lng: number | null } | null = null) =>
  saveActivity(engine, db, TRIP, { activity: patch(o), place });
const day = async (date: string | null) =>
  (await activitiesOfTrip(db, TRIP)).filter((a) => a.date === date).sort(compareActivities).map((a) => a.title);
const get = async (id: string) => (await db.data("activities").get(id)) as Activity;

beforeEach(() => {
  server = new FakeServer();
  db = new LocalDb(`planning-${++n}`);
  engine = new SyncEngine(db, server.remote("alice"));
});
afterEach(() => db.delete());

describe("planning (données locales + synchro)", () => {
  it("ajoute en fin de journée sans horaire, et chronologiquement avec horaire", async () => {
    await add({ title: "Sans horaire" });
    await add({ title: "Midi", start_time: "12:00:00" });
    await add({ title: "Matin", start_time: "08:00:00" });
    await add({ title: "Après-midi", start_time: "15:00:00" });
    // Les activités horodatées sont rangées chronologiquement ; celle sans horaire garde sa place.
    expect(await day("2027-03-14")).toEqual(["Sans horaire", "Matin", "Midi", "Après-midi"]);
  });

  it("idée sans date, puis planifiée sur une journée", async () => {
    const id = await add({ title: "Onsen", date: null, category: "idea" });
    expect(await day(null)).toEqual(["Onsen"]);
    await moveActivity(engine, db, TRIP, await get(id), "2027-03-20");
    expect(await day(null)).toEqual([]);
    expect(await day("2027-03-20")).toEqual(["Onsen"]);
  });

  it("déplacer vers les idées retire l'horaire", async () => {
    const id = await add({ title: "Dîner", start_time: "19:00:00", end_time: "21:00:00" });
    await moveActivity(engine, db, TRIP, await get(id), null);
    expect(await get(id)).toMatchObject({ date: null, start_time: null, end_time: null });
  });

  it("réordonne par glisser-déposer en ne modifiant que l'activité déplacée", async () => {
    for (const t of ["A", "B", "C", "D"]) await add({ title: t });
    await engine.sync(TRIP);
    const all = (await activitiesOfTrip(db, TRIP)).sort(compareActivities);
    const before = new Map(all.map((a) => [a.id, a.sort_key]));
    await reorderActivity(engine, db, TRIP, all[3], 1); // D en deuxième position
    expect(await day("2027-03-14")).toEqual(["A", "D", "B", "C"]);
    const changed = (await activitiesOfTrip(db, TRIP)).filter((a) => a.sort_key !== before.get(a.id));
    expect(changed.map((a) => a.title)).toEqual(["D"]);
    expect(await db.outbox.count()).toBe(1);
  });

  it("renumérote la journée si l'écart entre deux clés est épuisé", async () => {
    const a = await add({ title: "A" });
    const b = await add({ title: "B" });
    await engine.update("activities", b, { sort_key: (await get(a)).sort_key + 1e-9 });
    const c = await add({ title: "C" });
    await reorderActivity(engine, db, TRIP, await get(c), 1);
    expect(await day("2027-03-14")).toEqual(["A", "C", "B"]);
    const keys = (await activitiesOfTrip(db, TRIP)).map((x) => x.sort_key);
    expect(new Set(keys).size).toBe(3);
  });

  it("lieu associé : création, mise à jour, dissociation sans suppression", async () => {
    const id = await add({ title: "Fushimi Inari" }, { address: "Kyoto", lat: 34.9671, lng: 135.7727 });
    const placeId = (await get(id)).place_id!;
    expect(await db.data("places").get(placeId)).toMatchObject({ name: "Fushimi Inari", category: "monument", lat: 34.9671 });
    await saveActivity(engine, db, TRIP, { activity: patch({ title: "Fushimi Inari" }), place: { address: "Fushimi, Kyoto", lat: 34.9671, lng: 135.7727 } }, await get(id));
    expect(await db.data("places").get(placeId)).toMatchObject({ address: "Fushimi, Kyoto" });
    await saveActivity(engine, db, TRIP, { activity: patch({ title: "Fushimi Inari" }), place: null }, await get(id));
    expect((await get(id)).place_id).toBeNull();
    expect((await db.data("places").get(placeId))?.deleted_at).toBeNull();
  });

  it("fait / non fait, suppression, notes du jour, et tout arrive au serveur", async () => {
    const id = await add({ title: "Temple" });
    await setActivityDone(engine, await get(id), true);
    await saveDay(engine, db, TRIP, "2027-03-15", { is_free: true, notes: "Repos" });
    await saveDay(engine, db, TRIP, "2027-03-15", { city: "Kyoto" });
    const gone = await add({ title: "Annulé" });
    await deleteActivity(engine, await get(gone));
    await engine.sync(TRIP);
    expect(server.rows.get(`activities:${id}`)).toMatchObject({ is_done: true });
    expect(server.rows.get(`trip_days:${dayId(TRIP, "2027-03-15")}`)).toMatchObject({ is_free: true, notes: "Repos", city: "Kyoto" });
    expect(server.rows.has(`activities:${gone}`)).toBe(false); // créée puis supprimée avant envoi : rien n'est parti
    const b = bucketActivities(await activitiesOfTrip(db, TRIP), ["2027-03-14"]);
    expect(b.byDate.get("2027-03-14")!.map((a) => a.title)).toEqual(["Temple"]);
  });
});
