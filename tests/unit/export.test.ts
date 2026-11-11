import { afterEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { duplicateTrip } from "@/lib/db/duplicate";
import { exportTrip } from "@/lib/db/export";
import { activitiesOfTrip } from "@/lib/db/planning";
import { csvAmount, csvCell, expensesCsv, exportFileName, toCsv } from "@/lib/export";
import type { Expense } from "@/lib/types/budget";
import type { Trip } from "@/lib/types/trip";
import { FakeServer } from "../helpers/fake-server";

describe("CSV", () => {
  it("échappe séparateurs, guillemets, retours à la ligne, et neutralise les formules", () => {
    expect(csvCell("Ramen; gyoza")).toBe('"Ramen; gyoza"');
    expect(csvCell('Le "meilleur"')).toBe('"Le ""meilleur"""');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("-12,50")).toBe("-12,50");
    expect(csvCell(null)).toBe("");
  });
  it("BOM UTF-8, séparateur « ; », montants à la française", () => {
    const csv = toCsv(["a", "b"], [["京都", 1]]);
    expect(csv.startsWith("﻿a;b\r\n京都;1")).toBe(true);
    expect(csvAmount(1250, "EUR")).toBe("12,50");
    expect(csvAmount(5, "EUR")).toBe("0,05");
    expect(csvAmount(4800, "JPY")).toBe("4800");
    expect(csvAmount(-2250, "EUR")).toBe("-22,50");
  });
  it("export du pot commun : une ligne par dépense et remboursement, triées par date", () => {
    const e = { date: "2027-03-10", title: "Ramen", category: "food", paid_by: "a", amount_minor: 4800, currency: "JPY", fx_rate: 0.0056377,
      base_amount_minor: 2706, split_mode: "equal", shares: [{ user_id: "a", weight: 1, base_minor: 1353 }, { user_id: "b", weight: 1, base_minor: 1353 }] } as unknown as Expense;
    const csv = expensesCsv([e], [{ date: "2027-03-09", from_user: "b", to_user: "a", amount_minor: 1000, currency: "EUR", fx_rate: 1, base_amount_minor: 1000 } as never],
      "EUR", (id) => (id === "a" ? "Alice" : "Bruno"));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2027-03-09;Remboursement;Bruno → Alice;;Bruno;10,00;EUR;1;10,00;;");
    expect(lines[2]).toBe("2027-03-10;Dépense;Ramen;Repas;Alice;4800;JPY;0,0056377;27,06;Égal;Alice 13,53 | Bruno 13,53");
  });
  it("nom de fichier sûr", () => {
    expect(exportFileName("Japan Trip — été", "2026-11-10", "json")).toBe("japan-trip-ete-2026-11-10.json");
    expect(exportFileName("旅", "2026-11-10", "csv", "pot-commun")).toBe("voyage-pot-commun-2026-11-10.csv");
  });
});

describe("export JSON et duplication", () => {
  const dbs: LocalDb[] = [];
  let n = 0;
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((d) => d.delete()));
  });
  const setup = async () => {
    const db = new LocalDb(`export-${++n}`);
    dbs.push(db);
    const engine = new SyncEngine(db, new FakeServer().remote("alice"));
    const tripId = await engine.insert("trips", {
      group_id: "g1", name: "Japan Trip", start_date: "2027-03-09", end_date: "2027-03-30", timezone: "Asia/Tokyo", base_currency: "EUR",
      secondary_currency: "JPY", locale: "fr", destinations: [{ id: "d1", name: "Kyoto" }], settings: { manual_fx_rate: { pair: "EUR/JPY", rate: 160, set_at: "x" } },
    });
    const placeId = await engine.insert("places", { trip_id: tripId, name: "Fushimi Inari", category: "monument", lat: 34.9, lng: 135.7 });
    const entryId = await engine.insert("journal_entries", { trip_id: tripId, title: "Matcha", category: "food" });
    await engine.insert("activities", { trip_id: tripId, title: "Fushimi", date: "2027-03-14", place_id: placeId, journal_entry_id: entryId, sort_key: 1024, is_done: true });
    await engine.insert("activities", { trip_id: tripId, title: "Idée", date: null, sort_key: 2048, is_done: false });
    await engine.insert("trip_days", { id: "day", trip_id: tripId, date: "2027-03-14", notes: "Réveil tôt" });
    await engine.insert("expenses", { trip_id: tripId, title: "Ramen", amount_minor: 1 });
    await engine.insert("personal_expenses", { trip_id: tripId, owner_id: "bob", title: "Secret" });
    await engine.insert("personal_expenses", { trip_id: tripId, owner_id: "alice", title: "Furoshiki" });
    return { db, engine, trip: (await db.data("trips").get(tripId)) as Trip };
  };

  it("export : tout le voyage, sans les dépenses personnelles des autres ni colonnes internes", async () => {
    const { db, trip } = await setup();
    const out = await exportTrip(db, trip.id, "alice", [{ id: "alice", display_name: "Alice" }]);
    expect(out).toMatchObject({ format: "japan-trip-export", version: 1, trip: { name: "Japan Trip" } });
    expect(out.activities).toHaveLength(2);
    expect(out.personal_expenses?.map((p) => p.title)).toEqual(["Furoshiki"]);
    expect(JSON.stringify(out)).not.toMatch(/"_[a-z]/);
  });

  it("duplication : planning décalé, liens lieu/carnet recréés, pas de dépenses ni de taux manuel", async () => {
    const { db, engine, trip } = await setup();
    const id = await duplicateTrip(engine, db, trip, { name: "Japon 2028", start_date: "2028-04-01" });
    const copy = (await db.data("trips").get(id)) as Trip;
    expect(copy).toMatchObject({ name: "Japon 2028", start_date: "2028-04-01", end_date: "2028-04-22", group_id: "g1" });
    expect(copy.settings.manual_fx_rate).toBeNull();
    const acts = await activitiesOfTrip(db, id);
    const fushimi = acts.find((a) => a.title === "Fushimi")!;
    expect(fushimi.date).toBe("2028-04-06");
    expect(fushimi.is_done).toBe(false);
    expect(fushimi.place_id).not.toBeNull();
    expect(((await db.data("places").get(fushimi.place_id!)) as unknown as { trip_id: string }).trip_id).toBe(id);
    expect(((await db.data("journal_entries").get(fushimi.journal_entry_id!)) as unknown as { title: string; trip_id: string })).toMatchObject({ title: "Matcha", trip_id: id });
    expect(acts.find((a) => a.title === "Idée")?.date).toBeNull();
    expect((await db.data("trip_days").where("trip_id").equals(id).toArray()).map((d) => [d.date, d.notes])).toEqual([["2028-04-06", "Réveil tôt"]]);
    expect(await db.data("expenses").where("trip_id").equals(id).count()).toBe(0);
    expect((await activitiesOfTrip(db, trip.id)).map((a) => a.date).sort()).toEqual(["2027-03-14", null].sort());
  });
});
