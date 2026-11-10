import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guessCategory } from "@/lib/places";
import { placeSchema, type PlaceForm } from "@/lib/validation/place";
import { searchPlaces, toResult } from "@/lib/geocoding";
import { NetworkError } from "@/lib/sync/remote";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { activitiesForPlace, addPlaceToPlanning, deletePlace, movePlace, savePlace, setPlaceFavorite } from "@/lib/db/places";
import { activitiesOfTrip } from "@/lib/db/planning";
import type { Place } from "@/lib/types/planning";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";

describe("catégorie devinée depuis OpenStreetMap", () => {
  it.each([
    ["tourism", "hotel", "hotel"], ["amenity", "restaurant", "restaurant"], ["amenity", "cafe", "restaurant"],
    ["railway", "station", "station"], ["aeroway", "aerodrome", "airport"], ["shop", "department_store", "shop"],
    ["amenity", "place_of_worship", "monument"], ["historic", "castle", "monument"], ["leisure", "park", "activity"],
    ["highway", "residential", "other"],
  ])("%s:%s → %s", (c, t, expected) => expect(guessCategory(c, t)).toBe(expected));
});

describe("validation d'un lieu", () => {
  const base: PlaceForm = { name: "Ichiran", category: "restaurant", address: "", address_local: "", city: "Kyoto", coords: "",
    description: "", notes: "", url: "", is_favorite: false };
  it("lieu sans coordonnées accepté (listé, absent de la carte)", () => {
    expect(placeSchema.parse(base)).toMatchObject({ name: "Ichiran", lat: null, lng: null, city: "Kyoto", address: null });
  });
  it("coordonnées collées depuis Google Maps", () => {
    expect(placeSchema.parse({ ...base, coords: "https://maps.google.com/?q=35.0116,135.7681" })).toMatchObject({ lat: 35.0116, lng: 135.7681 });
  });
  it("refuse nom vide, catégorie inconnue, lien dangereux, coordonnées invalides", () => {
    const paths = (f: Partial<PlaceForm>) => placeSchema.safeParse({ ...base, ...f }).error?.issues.map((i) => i.path[0]) ?? [];
    expect(paths({ name: "  " })).toContain("name");
    expect(paths({ category: "x" })).toContain("category");
    expect(paths({ url: "javascript:alert(1)" })).toContain("url");
    expect(paths({ coords: "Kyoto" })).toContain("coords");
  });
});

describe("recherche Nominatim", () => {
  const item = {
    osm_type: "node", osm_id: 42, lat: "34.9671", lon: "135.7727", name: "伏見稲荷大社", category: "amenity", type: "place_of_worship",
    display_name: "伏見稲荷大社, Fushimi, Kyoto, Japon", address: { city: "Kyoto" },
  };
  it("convertit un résultat (nom, adresse sans le nom, ville, catégorie, référence OSM)", () => {
    expect(toResult(item)).toEqual({ name: "伏見稲荷大社", address: "Fushimi, Kyoto, Japon", city: "Kyoto", lat: 34.9671, lng: 135.7727,
      category: "monument", sourceRef: "osm:node/42" });
  });
  it("respecte 1 requête par seconde, filtre par pays, pas de requête pour moins de 2 caractères", async () => {
    const calls: { url: string; t: number }[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push({ url, t: Date.now() });
      return new Response(JSON.stringify([item]), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await searchPlaces("a", { fetchImpl })).toEqual([]);
    await searchPlaces("Fushimi", { fetchImpl, countryCodes: "jp" });
    await searchPlaces("Kinkaku", { fetchImpl, countryCodes: "jp" });
    expect(calls).toHaveLength(2);
    expect(calls[1].t - calls[0].t).toBeGreaterThanOrEqual(1000);
    expect(calls[0].url).toContain("countrycodes=jp");
    expect(calls[0].url).toContain("q=Fushimi");
  }, 10_000);
  it("erreurs : réseau coupé → NetworkError ; limite atteinte → message clair", async () => {
    await expect(searchPlaces("Nara", { fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch }))
      .rejects.toBeInstanceOf(NetworkError);
    await expect(searchPlaces("Nara", { fetchImpl: (async () => new Response("", { status: 429 })) as unknown as typeof fetch }))
      .rejects.toThrow(/Trop de recherches/);
  }, 10_000);
});

describe("lieux (données locales + synchro)", () => {
  let db: LocalDb;
  let engine: SyncEngine;
  let server: FakeServer;
  beforeEach(() => {
    server = new FakeServer();
    db = new LocalDb(`places-${Math.random()}`);
    engine = new SyncEngine(db, server.remote("alice"));
  });
  afterEach(() => db.delete());
  const patch = { name: "Fushimi Inari", category: "monument", address: null, address_local: null, city: "Kyoto", lat: 34.9671, lng: 135.7727,
    description: null, notes: null, url: null, is_favorite: false };
  const get = async (id: string) => (await db.data("places").get(id)) as Place;

  it("création depuis une recherche, favori, déplacement du point, suppression logique", async () => {
    const id = await savePlace(engine, TRIP, { ...patch, source: "search", source_ref: "osm:node/42" });
    await setPlaceFavorite(engine, await get(id), true);
    await movePlace(engine, await get(id), 34.968, 135.773);
    await engine.sync(TRIP);
    expect(server.rows.get(`places:${id}`)).toMatchObject({ source: "search", source_ref: "osm:node/42", is_favorite: true, lat: 34.968, lng: 135.773 });
    await deletePlace(engine, await get(id));
    await engine.sync(TRIP);
    expect(server.rows.get(`places:${id}`)?.deleted_at).not.toBeNull();
  });

  it("ajout au planning sans ressaisie : journée ou idée, lien conservé dans les deux sens", async () => {
    const id = await savePlace(engine, TRIP, patch);
    const place = await get(id);
    await addPlaceToPlanning(engine, db, TRIP, place, "2027-03-14");
    await addPlaceToPlanning(engine, db, TRIP, place, null);
    const acts = await activitiesOfTrip(db, TRIP);
    expect(acts.map((a) => [a.title, a.date, a.category, a.place_id])).toEqual(expect.arrayContaining([
      ["Fushimi Inari", "2027-03-14", "visit", id], ["Fushimi Inari", null, "idea", id],
    ]));
    expect((await activitiesForPlace(db, TRIP, id)).map((a) => a.date)).toEqual(["2027-03-14", null]);
  });
});
