import { describe, expect, it } from "vitest";
import { bucketActivities, chronologicalIndex, keyAtIndex, mapsLinks, sortKeyBetween } from "@/lib/planning";
import { minorToInput, parseAmountToMinor } from "@/lib/money";
import { parseCoordinates } from "@/lib/geo";
import { activitySchema, type ActivityForm } from "@/lib/validation/activity";
import type { Activity } from "@/lib/types/planning";

let n = 0;
const act = (o: Partial<Activity>): Activity =>
  ({ id: `a${++n}`, trip_id: "t", title: "x", category: "visit", date: "2027-03-14", start_time: null, end_time: null,
    sort_key: 0, deleted_at: null, version: 1, created_at: `2027-01-01T00:00:0${n % 10}Z`, ...o }) as Activity;

describe("ordre des activités", () => {
  it("clé entre deux voisines, en tête, en fin, liste vide", () => {
    expect(sortKeyBetween(null, null)).toBe(1024);
    expect(sortKeyBetween(1024, null)).toBe(2048);
    expect(sortKeyBetween(null, 1024)).toBe(0);
    expect(sortKeyBetween(1024, 2048)).toBe(1536);
  });
  it("signale l'épuisement de l'écart (renumérotation nécessaire)", () => {
    expect(sortKeyBetween(1, 1 + 1e-9)).toBeNull();
  });
  it("insertions répétées au même endroit : ordre strict, puis demande de renumérotation (jamais d'ex aequo)", () => {
    let lo = 0;
    const hi = 1024;
    let inserted = 0;
    for (;;) {
      const k = sortKeyBetween(lo, hi);
      if (k === null) break;
      expect(k).toBeGreaterThan(lo);
      expect(k).toBeLessThan(hi);
      lo = k;
      inserted++;
    }
    expect(inserted).toBeGreaterThanOrEqual(25);
  });
  it("place une activité horodatée chronologiquement, sans déplacer celles sans horaire", () => {
    const list = [act({ sort_key: 1, start_time: "08:00:00" }), act({ sort_key: 2 }), act({ sort_key: 3, start_time: "12:00:00" })];
    expect(chronologicalIndex(list, "10:30")).toBe(2);
    expect(chronologicalIndex(list, "07:00")).toBe(0);
    expect(chronologicalIndex(list, "20:00")).toBe(3);
    expect(keyAtIndex(list, 2)).toBe(2.5);
  });
});

describe("regroupement par journée", () => {
  it("journées du voyage, idées sans date, dates hors période ; suppressions ignorées", () => {
    const dates = ["2027-03-14", "2027-03-15"];
    const b = bucketActivities(
      [act({ date: "2027-03-15", sort_key: 2 }), act({ date: "2027-03-15", sort_key: 1, title: "premier" }), act({ date: null }),
        act({ date: "2027-04-01" }), act({ date: "2027-03-14", deleted_at: "2027-01-02T00:00:00Z" })],
      dates,
    );
    expect(b.byDate.get("2027-03-14")).toEqual([]);
    expect(b.byDate.get("2027-03-15")!.map((a) => a.title)[0]).toBe("premier");
    expect(b.ideas).toHaveLength(1);
    expect(b.outside).toHaveLength(1);
  });
});

describe("montants saisis", () => {
  it("EUR à 2 décimales, JPY sans décimale, sans erreur d'arrondi flottant", () => {
    expect(parseAmountToMinor("12,5", "EUR")).toBe(1250);
    expect(parseAmountToMinor("0.1", "EUR")).toBe(10);
    expect(parseAmountToMinor("1 500", "JPY")).toBe(1500);
    expect(parseAmountToMinor("19,99", "EUR")).toBe(1999);
    expect(parseAmountToMinor("1,5", "JPY")).toBeNull();
    expect(parseAmountToMinor("12,345", "EUR")).toBeNull();
    expect(parseAmountToMinor("-3", "EUR")).toBeNull();
    expect(parseAmountToMinor("abc", "EUR")).toBeNull();
  });
  it("retour au texte éditable", () => {
    expect(minorToInput(1250, "EUR")).toBe("12,50");
    expect(minorToInput(5, "EUR")).toBe("0,05");
    expect(minorToInput(1500, "JPY")).toBe("1500");
  });
});

describe("coordonnées et liens externes", () => {
  it("reconnaît coordonnées et liens Google Maps", () => {
    expect(parseCoordinates("34.9671, 135.7727")).toEqual({ lat: 34.9671, lng: 135.7727 });
    expect(parseCoordinates("https://www.google.com/maps/place/X/@34.9671,135.7727,17z")).toEqual({ lat: 34.9671, lng: 135.7727 });
    expect(parseCoordinates("https://maps.google.com/?q=35.0116,135.7681")).toEqual({ lat: 35.0116, lng: 135.7681 });
    expect(parseCoordinates("Kyoto")).toBeNull();
    expect(parseCoordinates("120, 200")).toBeNull();
  });
  it("liens d'itinéraire externes (aucun calcul interne)", () => {
    expect(mapsLinks({ lat: 34.9671, lng: 135.7727 })?.directions).toBe("https://www.google.com/maps/dir/?api=1&destination=34.9671%2C135.7727");
    expect(mapsLinks({ address: "Fushimi Inari, Kyoto" })?.view).toContain("Fushimi%20Inari");
    expect(mapsLinks({})).toBeNull();
  });
});

describe("validation d'une activité", () => {
  const schema = activitySchema({ start_date: "2027-03-09", end_date: "2027-03-30" });
  const base: ActivityForm = {
    title: "Fushimi Inari", category: "visit", date: "2027-03-14", start_time: "", end_time: "", duration: "", description: "",
    notes: "", url: "", cost: "", cost_currency: "JPY", travel_minutes: "", travel_mode: "", address: "", coords: "",
  };
  it("activité minimale sans horaire", () => {
    const r = schema.parse(base);
    expect(r.activity).toMatchObject({ title: "Fushimi Inari", date: "2027-03-14", start_time: null, estimated_cost_minor: null });
    expect(r.place).toBeNull();
  });
  it("idée sans date ni horaire", () => {
    expect(schema.parse({ ...base, date: "" }).activity.date).toBeNull();
  });
  it("horaires, budget estimé, trajet estimé, lieu", () => {
    const r = schema.parse({ ...base, start_time: "07:00", end_time: "09:30", cost: "500", travel_minutes: "25", travel_mode: "train",
      address: "68 Fukakusa Yabunouchicho", coords: "34.9671, 135.7727" });
    expect(r.activity).toMatchObject({ start_time: "07:00:00", end_time: "09:30:00", estimated_cost_minor: 500, estimated_cost_currency: "JPY",
      travel_minutes_estimate: 25, travel_mode: "train" });
    expect(r.place).toEqual({ address: "68 Fukakusa Yabunouchicho", lat: 34.9671, lng: 135.7727 });
  });
  it("refuse les incohérences", () => {
    const issues = (f: Partial<ActivityForm>) => schema.safeParse({ ...base, ...f }).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(issues({ title: " " })).toContain("title");
    expect(issues({ date: "2027-04-02" })).toContain("date");
    expect(issues({ date: "", start_time: "10:00" })).toContain("start_time");
    expect(issues({ start_time: "10:00", end_time: "09:00" })).toContain("end_time");
    expect(issues({ end_time: "09:00" })).toContain("end_time");
    expect(issues({ url: "javascript:alert(1)" })).toContain("url");
    expect(issues({ cost: "1,5" })).toContain("cost");
    expect(issues({ duration: "0" })).toContain("duration");
    expect(issues({ coords: "Kyoto" })).toContain("coords");
    expect(issues({ category: "hack" })).toContain("category");
  });
});
