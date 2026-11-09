import { describe, expect, it } from "vitest";
import { changedFields, sameValue, threeWayMerge } from "@/lib/sync/merge";
import type { SyncedRow } from "@/lib/types/sync";

const row = (o: Record<string, unknown>) => ({ id: "a", version: 1, deleted_at: null, ...o }) as SyncedRow;

describe("sameValue", () => {
  it("normalise les heures HH:MM et HH:MM:SS", () => {
    expect(sameValue("07:00", "07:00:00")).toBe(true);
    expect(sameValue("07:00", "07:30:00")).toBe(false);
  });
  it("compare null et undefined comme égaux, et les objets par contenu", () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(sameValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe("changedFields", () => {
  it("ignore les colonnes serveur", () => {
    expect(changedFields(row({ title: "x" }), row({ title: "x", version: 7, updated_at: "z" }))).toEqual([]);
    expect(changedFields(row({ title: "x" }), row({ title: "y" }))).toEqual(["title"]);
  });
});

describe("threeWayMerge", () => {
  const base = row({ title: "Temple", notes: "", start_time: null });
  it("fusionne des modifications disjointes", () => {
    const server = row({ title: "Temple", notes: "réserver", version: 2 });
    expect(threeWayMerge(base, { start_time: "07:00" }, server)).toEqual({ safePatch: { start_time: "07:00" }, conflicting: [] });
  });
  it("signale un même champ modifié avec des valeurs différentes", () => {
    const server = row({ title: "Kinkaku-ji", version: 2 });
    expect(threeWayMerge(base, { title: "Ginkaku-ji" }, server).conflicting).toEqual(["title"]);
  });
  it("ne signale rien si les deux côtés ont fait la même modification", () => {
    const server = row({ title: "Kinkaku-ji", version: 2 });
    expect(threeWayMerge(base, { title: "Kinkaku-ji" }, server)).toEqual({ safePatch: {}, conflicting: [] });
  });
  it("sans base (création concurrente), tout champ serveur renseigné et différent est un conflit", () => {
    const server = row({ city: "Kyoto", notes: null });
    expect(threeWayMerge(null, { city: "Nara", notes: "libre" }, server)).toEqual({ safePatch: { notes: "libre" }, conflicting: ["city"] });
  });
});
