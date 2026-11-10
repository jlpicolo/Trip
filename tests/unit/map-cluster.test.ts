import { describe, expect, it } from "vitest";
import { clusterPoints } from "@/lib/map-cluster";

const p = (id: string, x: number, y: number) => ({ id, x, y });

describe("regroupement des marqueurs", () => {
  it("regroupe les points proches, garde séparés les points éloignés", () => {
    const groups = clusterPoints([p("a", 100, 100), p("b", 110, 105), p("c", 300, 300), p("d", 120, 95)], new Set());
    expect(groups.map((g) => g.map((x) => x.id).sort())).toEqual([["a", "b", "d"], ["c"]]);
  });
  it("ne regroupe jamais le lieu sélectionné", () => {
    const groups = clusterPoints([p("a", 100, 100), p("b", 105, 100), p("c", 108, 102)], new Set(["b"]));
    expect(groups.find((g) => g.some((x) => x.id === "b"))).toHaveLength(1);
    expect(groups.flat()).toHaveLength(3);
  });
  it("aucun point perdu ni dupliqué", () => {
    const pts = Array.from({ length: 50 }, (_, i) => p(`p${i}`, (i * 37) % 400, (i * 53) % 400));
    const ids = clusterPoints(pts, new Set()).flat().map((x) => x.id).sort();
    expect(ids).toEqual(pts.map((x) => x.id).sort());
  });
});
