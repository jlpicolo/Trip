import { describe, expect, it } from "vitest";
import { daysBetween, formatDateRange, formatMoney, todayIn, tripDates, tripPhase } from "@/lib/formatters";
import { describeActivity, describeGroup, groupActivity } from "@/lib/activity";
import { cityKanji, sameCity } from "@/lib/japan";
import { safeNext } from "@/lib/navigation";
import { tripSchema } from "@/lib/validation/schemas";
import type { ActivityLogEntry } from "@/lib/types/trip";

const START = "2027-03-09";
const END = "2027-03-30";

describe("dates du voyage", () => {
  it("compte 22 jours du 9 au 30 mars inclus", () => {
    expect(tripDates(START, END)).toHaveLength(22);
    expect(tripDates(START, END).at(-1)).toBe(END);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
  });

  it("avant le départ : compte à rebours", () => {
    const p = tripPhase(START, END, "Asia/Tokyo", new Date("2026-11-09T12:00:00Z"));
    expect(p).toEqual({ phase: "before", daysLeft: 120, totalDays: 22 });
  });

  it("pendant le voyage : la journée suit l'heure de Tokyo (UTC+9)", () => {
    // 8 mars 16h UTC = 9 mars 1h à Tokyo : premier jour du voyage.
    expect(tripPhase(START, END, "Asia/Tokyo", new Date("2027-03-08T16:00:00Z"))).toMatchObject({ phase: "during", dayNumber: 1 });
    expect(tripPhase(START, END, "Asia/Tokyo", new Date("2027-03-30T14:00:00Z"))).toMatchObject({ phase: "during", dayNumber: 22, percent: 100 });
    expect(tripPhase(START, END, "Asia/Tokyo", new Date("2027-03-30T15:30:00Z"))).toEqual({ phase: "after", totalDays: 22 });
  });

  it("todayIn respecte le fuseau", () => {
    expect(todayIn("Asia/Tokyo", new Date("2027-03-08T16:00:00Z"))).toBe("2027-03-09");
    expect(todayIn("Europe/Paris", new Date("2027-03-08T16:00:00Z"))).toBe("2027-03-08");
  });

  it("formate en français", () => {
    expect(formatDateRange(START, END)).toBe("9 mars – 30 mars 2027");
  });
});

describe("montants", () => {
  it("unités mineures selon la devise (JPY sans décimale)", () => {
    expect(formatMoney(123456, "EUR").replace(/\s/g, " ")).toBe("1 234,56 €");
    expect(formatMoney(3000, "JPY").replace(/\s/g, " ")).toBe("3 000 ¥");
  });
});

describe("historique lisible", () => {
  const entry = (o: Partial<ActivityLogEntry>): ActivityLogEntry => ({
    id: 1, trip_id: "t", actor_id: "u", action: "create", entity_type: "places", entity_id: "e", label: null, details: {},
    created_at: "2027-01-01T00:00:00Z", ...o,
  });
  it("construit la phrase avec catégorie et ville", () => {
    expect(describeActivity(entry({ label: "Ichiran", details: { category: "restaurant", city: "Kyoto" } }), "Thomas"))
      .toBe("Thomas a ajouté un restaurant « Ichiran » à Kyoto.");
  });
  it("accorde à la deuxième personne pour soi", () => {
    expect(describeActivity(entry({ entity_type: "trips", label: "Japan Trip" }), "Vous", true)).toBe("Vous avez ajouté le voyage.");
    expect(describeActivity(entry({ entity_type: "activities", action: "delete", label: "Temple" }), "Chloé"))
      .toBe("Chloé a supprimé une activité « Temple ».");
  });
});

describe("sécurité et validation", () => {
  it("refuse les redirections vers un autre site", () => {
    expect(safeNext("/planning")).toBe("/planning");
    expect(safeNext("//evil.example")).toBe("/accueil");
    expect(safeNext("https://evil.example")).toBe("/accueil");
    expect(safeNext("/\\evil.example")).toBe("/accueil");
  });
  it("valide les dates du voyage", () => {
    const base = { name: "T", start_date: START, end_date: END, timezone: "Asia/Tokyo", base_currency: "EUR", secondary_currency: "JPY", destinations: [] };
    expect(tripSchema.safeParse(base).success).toBe(true);
    expect(tripSchema.safeParse({ ...base, end_date: "2027-03-01" }).success).toBe(false);
    expect(tripSchema.safeParse({ ...base, base_currency: "euro" }).success).toBe(false);
    expect(tripSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

describe("historique regroupé", () => {
  const e = (id: number, actor: string, min: number, o: Partial<ActivityLogEntry> = {}): ActivityLogEntry => ({
    id, trip_id: "t", actor_id: actor, action: "create", entity_type: "activities", entity_id: `e${id}`, label: `A${id}`, details: {},
    created_at: new Date(Date.UTC(2027, 0, 1, 10, 60 - min)).toISOString(), ...o,
  });
  it("regroupe les ajouts successifs d'une même personne", () => {
    const groups = groupActivity([e(6, "a", 0), e(5, "a", 1), e(4, "a", 2), e(3, "b", 3), e(2, "a", 4, { action: "update" })]);
    expect(groups.map((g) => g.entries.length)).toEqual([3, 1, 1]);
    expect(describeGroup(groups[0], "Aiko")).toBe("Aiko a ajouté 3 activités.");
    expect(describeGroup(groups[0], "Vous", true)).toBe("Vous avez ajouté 3 activités.");
    expect(describeGroup(groups[1], "Bastien")).toBe("Bastien a ajouté une activité « A3 ».");
  });
  it("ne regroupe pas au-delà d'une heure d'écart", () => {
    const groups = groupActivity([e(2, "a", 0), { ...e(1, "a", 0), created_at: "2027-01-01T07:00:00.000Z" }]);
    expect(groups).toHaveLength(2);
  });
});

describe("villes japonaises", () => {
  it("kanji des villes connues, rien d'inventé sinon", () => {
    expect(cityKanji("Kyoto")).toBe("京都");
    expect(cityKanji("Tōkyō")).toBe("東京");
    expect(cityKanji("Paris")).toBeNull();
    expect(sameCity("kyôto", "Kyoto")).toBe(true);
  });
});
