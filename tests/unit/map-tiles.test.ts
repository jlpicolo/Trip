import { describe, expect, it } from "vitest";
import { bboxAround, bboxOfPoints, lngLatToTile, mapCacheKey, tilesForBbox, unionBbox } from "@/lib/map-tiles";
import { cityArea } from "@/lib/japan";

describe("tuiles des cartes hors ligne", () => {
  it("coordonnées → tuile (référence : Kyoto, zoom 15)", () => {
    expect(lngLatToTile(135.7681, 35.0116, 15)).toEqual({ x: 28741, y: 12978 }); // vérifié par la formule standard (asinh)
    expect(lngLatToTile(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("emprise autour d'un point : ±km dans les deux sens", () => {
    const [w, s, e, n] = bboxAround(35, 135, 5);
    expect(n - s).toBeCloseTo(0.0904, 3);
    expect(e - w).toBeGreaterThan(n - s); // un degré de longitude est plus court à 35° de latitude
  });

  it("union et emprise de points", () => {
    expect(unionBbox(null, [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(unionBbox([0, 0, 1, 1], [2, -1, 3, 0.5])).toEqual([0, -1, 3, 1]);
    expect(bboxOfPoints([])).toBeNull();
  });

  it("nombre de tuiles raisonnable pour une ville (Nara, zooms 0 à 15)", () => {
    const a = cityArea("Nara")!;
    const tiles = tilesForBbox(bboxAround(a.lat, a.lng, a.km), 0, 15);
    expect(tiles.filter((t) => t.z === 0)).toEqual([{ z: 0, x: 0, y: 0 }]);
    expect(tiles.length).toBeGreaterThan(40);
    expect(tiles.length).toBeLessThan(200);
    expect(cityArea("Atlantide")).toBeNull();
  });

  it("clé de cache identique quelle que soit la version hebdomadaire des tuiles", () => {
    expect(mapCacheKey("https://tiles.openfreemap.org/planet/20261101_080013_pt/15/28741/13020.pbf"))
      .toBe(mapCacheKey("https://tiles.openfreemap.org/planet/20261108_080013_pt/15/28741/13020.pbf"));
    expect(mapCacheKey("https://tiles.openfreemap.org/fonts/Noto Sans Regular/0-255.pbf")).toContain("fonts");
  });
});
