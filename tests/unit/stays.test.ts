import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { deleteStay, saveStay, staysOfTrip } from "@/lib/db/stays";
import { saveDocument, documentsOfTrip } from "@/lib/db/tickets";
import { coversNight, nightsOf, nightsReport, stayEventsFor, stayForNight, toRanges, tripNights } from "@/lib/stays";
import { accommodationSchema, type AccommodationForm } from "@/lib/validation/accommodation";
import { documentSchema } from "@/lib/validation/document";
import type { Place } from "@/lib/types/planning";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
const trip = { start_date: "2027-03-09", end_date: "2027-03-30" };
const s = (id: string, check_in_date: string, check_out_date: string) => ({ id, check_in_date, check_out_date });
const form = (o: Partial<AccommodationForm> = {}): AccommodationForm => ({
  name: "Hotel Gracery Kyoto", city: "Kyoto", address: "", address_local: "", coords: "", check_in_date: "2027-03-12",
  check_in_time: "15:00", check_out_date: "2027-03-15", check_out_time: "11:00", guests: "4", rooms: "", booking_site: "",
  booking_ref: "", booking_url: "", phone: "", email: "", practical_info: "", notes: "", ...o,
});

describe("nuits", () => {
  it("compte les nuits et la nuit couverte (départ exclu)", () => {
    const h = s("a", "2027-03-12", "2027-03-15");
    expect(nightsOf(h)).toBe(3);
    expect([coversNight(h, "2027-03-11"), coversNight(h, "2027-03-12"), coversNight(h, "2027-03-14"), coversNight(h, "2027-03-15")])
      .toEqual([false, true, true, false]);
    expect(tripNights("2027-03-09", "2027-03-30")).toHaveLength(21);
    expect(tripNights("2027-03-09", "2027-03-09")).toEqual([]);
  });

  it("repère les nuits sans hébergement et les chevauchements", () => {
    const r = nightsReport([s("osaka", "2027-03-09", "2027-03-12"), s("kyoto", "2027-03-14", "2027-03-30"), s("ryokan", "2027-03-20", "2027-03-21")], trip.start_date, trip.end_date);
    expect(r.uncovered).toEqual(["2027-03-12", "2027-03-13"]);
    expect(r.overlaps).toEqual([{ date: "2027-03-20", ids: ["kyoto", "ryokan"] }]);
    expect(toRanges(["2027-03-13", "2027-03-12", "2027-03-20"])).toEqual([
      { from: "2027-03-12", to: "2027-03-13", count: 2 }, { from: "2027-03-20", to: "2027-03-20", count: 1 },
    ]);
  });

  it("journée de changement d'hôtel : départ puis arrivée", () => {
    const stays = [s("b", "2027-03-12", "2027-03-15"), s("a", "2027-03-09", "2027-03-12")];
    expect(stayEventsFor(stays, "2027-03-12").map((e) => `${e.kind}:${e.stay.id}`)).toEqual(["check_out:a", "check_in:b"]);
    expect(stayEventsFor(stays, "2027-03-13").map((e) => e.kind)).toEqual(["night"]);
    expect(stayEventsFor(stays, "2027-03-20")).toEqual([]);
    expect(stayForNight(stays, "2027-03-12")?.id).toBe("b");
  });
});

describe("validation d'un hébergement", () => {
  const schema = accommodationSchema(trip);
  it("accepte une fiche complète et nettoie les champs vides", () => {
    const r = schema.parse(form({ coords: "https://www.google.com/maps/place/@35.0065,135.7686,17z", phone: "+81 75 123 4567" }));
    expect(r.stay).toMatchObject({ guests: 4, address: null, phone: "+81 75 123 4567", check_in_time: "15:00" });
    expect(r.location).toEqual({ lat: 35.0065, lng: 135.7686 });
  });
  it("refuse dates incohérentes ou hors voyage, et valeurs invalides", () => {
    expect(schema.safeParse(form({ check_out_date: "2027-03-12" })).success).toBe(false);
    expect(schema.safeParse(form({ check_in_date: "2027-03-08" })).success).toBe(false);
    expect(schema.safeParse(form({ check_in_date: "2027-03-30", check_out_date: "2027-03-31" })).success).toBe(false);
    expect(schema.safeParse(form({ guests: "2,5" })).success).toBe(false);
    expect(schema.safeParse(form({ email: "pas-un-email" })).success).toBe(false);
    expect(schema.safeParse(form({ coords: "n'importe où" })).success).toBe(false);
  });
});

describe("hébergements : données locales et synchro", () => {
  let server: FakeServer;
  const dbs: LocalDb[] = [];
  let n = 0;
  const device = (user: string) => {
    const db = new LocalDb(`stays-${++n}`);
    dbs.push(db);
    return { db, engine: new SyncEngine(db, server.remote(user)) };
  };
  beforeEach(() => {
    server = new FakeServer();
  });
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((d) => d.delete()));
  });

  it("crée le lieu « hôtel » sur la carte, le met à jour, puis retire l'association sans le supprimer", async () => {
    const a = device("alice");
    const id = await saveStay(a.engine, a.db, TRIP, accommodationSchema(trip).parse(form({ coords: "35.0065, 135.7686", address: "Shinkyogoku" })));
    let [stay] = await staysOfTrip(a.db, TRIP);
    const place = (await a.db.data("places").get(stay.place_id!)) as Place;
    expect(place).toMatchObject({ category: "hotel", name: "Hotel Gracery Kyoto", lat: 35.0065, address: "Shinkyogoku", city: "Kyoto" });

    await saveStay(a.engine, a.db, TRIP, accommodationSchema(trip).parse(form({ name: "Gracery", coords: "35.01, 135.77" })), stay);
    [stay] = await staysOfTrip(a.db, TRIP);
    expect(stay.place_id).toBe(place.id);
    expect(await a.db.data("places").get(place.id)).toMatchObject({ name: "Gracery", lat: 35.01 });

    await saveStay(a.engine, a.db, TRIP, accommodationSchema(trip).parse(form({ name: "Gracery" })), stay);
    [stay] = await staysOfTrip(a.db, TRIP);
    expect(stay.id).toBe(id);
    expect(stay.place_id).toBeNull();
    expect((await a.db.data("places").get(place.id))?.deleted_at).toBeFalsy();
  });

  it("synchronise vers un autre voyageur ; supprimer garde les confirmations, détachées", async () => {
    const a = device("alice");
    const b = device("bruno");
    const id = await saveStay(a.engine, a.db, TRIP, accommodationSchema(trip).parse(form()));
    const doc = await saveDocument(a.engine, TRIP, documentSchema.parse({
      title: "Confirmation", category: "hotel", kind: "link", url: "https://booking.example/c", code_value: "", code_format: "qrcode",
      for_travelers: false, traveler_ids: [], date: "", transport_id: "", accommodation_id: id, notes: "",
    }));
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    expect((await staysOfTrip(b.db, TRIP)).map((x) => [x.name, x.check_in_date, x.check_out_date])).toEqual([["Hotel Gracery Kyoto", "2027-03-12", "2027-03-15"]]);
    await deleteStay(b.engine, b.db, (await staysOfTrip(b.db, TRIP))[0]);
    await b.engine.sync(TRIP);
    await a.engine.sync(TRIP);
    expect(await staysOfTrip(a.db, TRIP)).toEqual([]);
    expect(await documentsOfTrip(a.db, TRIP)).toMatchObject([{ id: doc, accommodation_id: null }]);
  });
});
