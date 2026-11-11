import { describe, expect, it } from "vitest";
import { buildDayRoutes, dayColor, dayUrl, distanceMeters, formatDistance, transitUrl, TRANSIT_THRESHOLD_M } from "@/lib/route-plan";
import type { Activity, Place } from "@/lib/types/planning";
import type { Accommodation } from "@/lib/types/stays";
import type { Transport } from "@/lib/types/tickets";

const place = (id: string, lat: number | null, lng: number | null) => ({ id, name: id, lat, lng, deleted_at: null }) as unknown as Place;
const act = (id: string, date: string | null, sort_key: number, place_id: string | null, start_time: string | null = null) =>
  ({ id, title: id, date, sort_key, place_id, start_time, created_at: "2026-11-01", deleted_at: null }) as unknown as Activity;
const stay = (name: string, check_in_date: string, check_out_date: string, place_id: string) =>
  ({ id: name, name, check_in_date, check_out_date, place_id, deleted_at: null }) as unknown as Accommodation;

const places = new Map([
  ["hotelK", place("hotelK", 35.0065, 135.7686)],
  ["fushimi", place("fushimi", 34.9671, 135.7727)],
  ["nishiki", place("nishiki", 35.005, 135.7647)],
  ["kiyomizu", place("kiyomizu", 34.9949, 135.785)],
  ["inconnu", place("inconnu", null, null)],
  ["hotelT", place("hotelT", 35.6812, 139.7671)],
]);

describe("parcours des journées", () => {
  const routes = buildDayRoutes({
    dates: ["2027-03-13", "2027-03-14", "2027-03-15"],
    places,
    stays: [stay("Gracery Kyoto", "2027-03-12", "2027-03-15", "hotelK"), stay("Tokyo Hotel", "2027-03-15", "2027-03-20", "hotelT")],
    activities: [
      act("Kiyomizu", "2027-03-13", 3000, "kiyomizu", "17:00"),
      act("Fushimi", "2027-03-13", 1000, "fushimi", "07:00"),
      act("Nishiki", "2027-03-13", 2000, "nishiki"),
      act("Sans lieu", "2027-03-13", 2500, "inconnu"),
      act("Idée", null, 1, "fushimi"),
    ],
    transports: [{ id: "t", kind: "shinkansen", departure_date: "2027-03-15", departure_name: "Gare de Kyoto", arrival_name: "Tokyo", deleted_at: null } as unknown as Transport],
  });

  it("départ de l'hôtel, activités dans l'ordre du planning, retour à l'hôtel", () => {
    expect(routes[0].stops.map((s) => s.title)).toEqual(["Gracery Kyoto", "Fushimi", "Nishiki", "Kiyomizu", "Gracery Kyoto"]);
    expect(routes[0].stops[1].time).toBe("07:00");
    expect(routes[0].legs).toHaveLength(4);
    expect(routes[0].unplaced.map((a) => a.title)).toEqual(["Sans lieu"]);
  });

  it("journée sans activité : hôtel seul, pas de tracé ; jour de changement d'hôtel", () => {
    expect(routes[1].stops.map((s) => s.title)).toEqual(["Gracery Kyoto", "Gracery Kyoto"].slice(0, 1));
    expect(routes[1].legs).toEqual([]);
    expect(routes[2].stops.map((s) => s.title)).toEqual(["Gracery Kyoto", "Tokyo Hotel"]);
  });

  it("trajet entre villes (Billets) tracé entre les centres des villes reconnues", () => {
    expect(routes[2].hops).toHaveLength(1);
    expect(routes[2].hops[0].from).toMatchObject({ lat: 35.0116 });
    expect(routes[2].hops[0].to).toMatchObject({ lat: 35.6812 });
    expect(routes[0].hops).toEqual([]);
  });

  it("une couleur par jour, qui tourne après 10 jours", () => {
    expect(routes.map((r) => r.color)).toEqual([dayColor(0), dayColor(1), dayColor(2)]);
    expect(dayColor(10)).toBe(dayColor(0));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(dayColor)).size).toBe(10);
  });
});

describe("distances, liens et gares", () => {
  it("distance à vol d'oiseau (Kyoto → Tokyo ≈ 370 km, vérifié par haversine) et format", () => {
    expect(Math.round(distanceMeters({ lat: 35.0116, lng: 135.7681 }, { lat: 35.6812, lng: 139.7671 }) / 1000)).toBe(370);
    expect(formatDistance(643)).toBe("640 m");
    expect(formatDistance(4234)).toBe("4,2 km");
    expect(TRANSIT_THRESHOLD_M).toBe(1500);
  });
  it("liens Google Maps : transports pour un tronçon, journée à pied avec étapes (9 max)", () => {
    expect(transitUrl({ lat: 35.0065, lng: 135.7686 }, { lat: 34.9671, lng: 135.7727 }))
      .toBe("https://www.google.com/maps/dir/?api=1&origin=35.006500,135.768600&destination=34.967100,135.772700&travelmode=transit");
    expect(dayUrl([{ lat: 1, lng: 2 }])).toBeNull();
    const many = Array.from({ length: 13 }, (_, i) => ({ lat: 35 + i / 100, lng: 135 }));
    const url = dayUrl(many)!;
    expect(url.match(/%7C/g)).toHaveLength(8);
    expect(url).toContain("travelmode=walking");
  });
});
