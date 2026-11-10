import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { activitiesOfTrip } from "@/lib/db/planning";
import { deleteEntry, entriesOfTrip, planEntry, plannedFromJournal, saveEntry } from "@/lib/db/journal";
import { filterEntries, sortEntries } from "@/lib/journal";
import { journalSchema, type JournalForm } from "@/lib/validation/journal";
import type { Place } from "@/lib/types/planning";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
const form = (o: Partial<JournalForm> = {}): JournalForm => ({
  title: "Okonomiyaki Mizuno", category: "food", priority: "1", city: "Osaka", body: "Le yamaimo-yaki", url: "", address: "", coords: "", ...o,
});
const row = (id: string, o: Record<string, unknown>) => ({ id, category: "food", city: null, title: id, body: null, priority: null, ...o });

describe("carnet : tri, filtres, validation", () => {
  it("incontournables d'abord, sans priorité en dernier", () => {
    const list = [row("b", { priority: 3 }), row("z", { priority: null }), row("a", { priority: 3 }), row("m", { priority: 1 })];
    expect(sortEntries(list as never[]).map((e: { id: string }) => e.id)).toEqual(["m", "a", "b", "z"]);
  });

  it("filtre par catégorie, ville, recherche sans accents et « à planifier »", () => {
    const list = [row("ramen", { city: "Kyoto", body: "Bouillon épais" }), row("temple", { category: "visit", city: "Nara" }), row("udon", { city: "Kyoto" })];
    const base = { category: null, city: null, unplannedOnly: false, query: "" };
    expect(filterEntries(list, { ...base, category: "food" }, new Set()).map((e) => e.id)).toEqual(["ramen", "udon"]);
    expect(filterEntries(list, { ...base, city: "Nara" }, new Set()).map((e) => e.id)).toEqual(["temple"]);
    expect(filterEntries(list, { ...base, query: "EPAIS" }, new Set()).map((e) => e.id)).toEqual(["ramen"]);
    expect(filterEntries(list, { ...base, unplannedOnly: true }, new Set(["ramen"])).map((e) => e.id)).toEqual(["temple", "udon"]);
  });

  it("validation : titre requis, lien et coordonnées vérifiés, lieu seulement si adresse ou GPS", () => {
    expect(journalSchema.safeParse(form({ title: " " })).success).toBe(false);
    expect(journalSchema.safeParse(form({ url: "pas un lien" })).success).toBe(false);
    expect(journalSchema.safeParse(form({ coords: "ailleurs" })).success).toBe(false);
    expect(journalSchema.parse(form()).place).toBeNull();
    expect(journalSchema.parse(form({ priority: "" })).entry.priority).toBeNull();
    expect(journalSchema.parse(form({ coords: "34.6687, 135.5013" })).place).toEqual({ address: null, lat: 34.6687, lng: 135.5013 });
  });
});

describe("carnet : données et conversion en activité", () => {
  let server: FakeServer;
  const dbs: LocalDb[] = [];
  let n = 0;
  const device = (user: string) => {
    const db = new LocalDb(`journal-${++n}`);
    dbs.push(db);
    return { db, engine: new SyncEngine(db, server.remote(user)) };
  };
  beforeEach(() => {
    server = new FakeServer();
  });
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((d) => d.delete()));
  });

  it("l'entrée devient une activité sans ressaisie (titre, notes, lien, lieu, catégorie)", async () => {
    const a = device("alice");
    const id = await saveEntry(a.engine, a.db, TRIP, journalSchema.parse(form({ url: "https://example.com/mizuno", coords: "34.6687, 135.5013" })));
    const [entry] = await entriesOfTrip(a.db, TRIP);
    expect(entry.id).toBe(id);
    expect(await a.db.data("places").get(entry.place_id!)).toMatchObject({ category: "restaurant", name: "Okonomiyaki Mizuno", city: "Osaka" });

    await planEntry(a.engine, a.db, TRIP, entry, "2027-03-10");
    await planEntry(a.engine, a.db, TRIP, entry, null);
    const acts = await activitiesOfTrip(a.db, TRIP);
    expect(acts.find((x) => x.date === "2027-03-10")).toMatchObject({
      title: "Okonomiyaki Mizuno", description: "Le yamaimo-yaki", url: "https://example.com/mizuno",
      place_id: entry.place_id, category: "restaurant", journal_entry_id: id,
    });
    expect(acts.find((x) => x.date === null)?.category).toBe("idea");
    expect((await plannedFromJournal(a.db, TRIP)).get(id)).toHaveLength(2);
  });

  it("modifier sans adresse détache le lieu ; supprimer l'entrée garde le planning ; synchro vers Bruno", async () => {
    const a = device("alice");
    const b = device("bruno");
    await saveEntry(a.engine, a.db, TRIP, journalSchema.parse(form({ address: "Dōtonbori" })));
    let [entry] = await entriesOfTrip(a.db, TRIP);
    const placeId = entry.place_id!;
    await saveEntry(a.engine, a.db, TRIP, journalSchema.parse(form({ title: "Mizuno" })), entry);
    [entry] = await entriesOfTrip(a.db, TRIP);
    expect(entry).toMatchObject({ title: "Mizuno", place_id: null });
    expect(((await a.db.data("places").get(placeId)) as Place).deleted_at).toBeFalsy();

    await planEntry(a.engine, a.db, TRIP, entry, "2027-03-11");
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    expect((await entriesOfTrip(b.db, TRIP)).map((e) => e.title)).toEqual(["Mizuno"]);
    await deleteEntry(b.engine, (await entriesOfTrip(b.db, TRIP))[0]);
    await b.engine.sync(TRIP);
    await a.engine.sync(TRIP);
    expect(await entriesOfTrip(a.db, TRIP)).toEqual([]);
    expect((await activitiesOfTrip(a.db, TRIP)).map((x) => x.title)).toEqual(["Mizuno"]);
  });
});
