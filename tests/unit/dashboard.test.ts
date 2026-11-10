import { describe, expect, it } from "vitest";
import { nowHm, preparationStats } from "@/lib/dashboard";
import { tripDates } from "@/lib/formatters";
import type { JournalEntry } from "@/lib/types/journal";

const entry = (id: string, priority: 1 | 2 | 3 | null) => ({ id, priority, title: id }) as JournalEntry;

describe("préparation du voyage (accueil)", () => {
  const base = { dates: tripDates("2027-03-09", "2027-03-30"), start: "2027-03-09", end: "2027-03-30" };

  it("voyage vide : tout à zéro, aucun chiffre inventé", () => {
    expect(preparationStats({ ...base, activities: [], freeDays: new Set(), stays: [], entries: [], planned: new Set() }))
      .toEqual({ daysPlanned: 0, totalDays: 22, nightsCovered: 0, totalNights: 21, mustSeeUnplanned: [] });
  });

  it("journées avec activité ou libres, nuits couvertes, incontournables non planifiés", () => {
    const r = preparationStats({
      ...base,
      activities: [{ date: "2027-03-09" }, { date: "2027-03-09" }, { date: null }, { date: "2027-03-12" }],
      freeDays: new Set(["2027-03-15"]),
      stays: [{ check_in_date: "2027-03-09", check_out_date: "2027-03-12" }, { check_in_date: "2027-03-11", check_out_date: "2027-03-13" }],
      entries: [entry("a", 1), entry("b", 1), entry("c", 2)],
      planned: new Set(["a"]),
    });
    expect(r.daysPlanned).toBe(3);
    expect(r.nightsCovered).toBe(4);
    expect(r.mustSeeUnplanned.map((e) => e.id)).toEqual(["b"]);
  });

  it("heure courante dans le fuseau du voyage", () => {
    expect(nowHm("Asia/Tokyo", new Date("2027-03-09T23:30:00Z"))).toBe("08:30");
  });
});
