import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { buildQuery, directOption, nearbyTransit, nearestTransit, parseOverpass, sharedLines, transitAround, type TransitStation } from "@/lib/transit";

// Extrait réduit d'une vraie réponse Overpass (Nezu, Tokyo) : gare, points d'arrêt, relations de ligne
// dans les deux sens (à dédoublonner) et une ligne de bus (exclue par la requête, ignorée ici aussi).
const RESPONSE = {
  elements: [
    { type: "node", id: 1, lat: 35.7176, lon: 139.7663, tags: { railway: "station", name: "根津", "name:en": "Nezu", station: "subway" } },
    { type: "node", id: 2, lat: 35.7128, lon: 139.7620, tags: { railway: "station", name: "湯島", "name:en": "Yushima", station: "subway" } },
    { type: "node", id: 11, lat: 35.7177, lon: 139.7664, tags: { public_transport: "stop_position", name: "根津" } },
    { type: "node", id: 12, lat: 35.7129, lon: 139.7621, tags: { public_transport: "stop_position", name: "湯島" } },
    { type: "relation", id: 100, members: [{ type: "node", ref: 11, role: "stop" }, { type: "node", ref: 12, role: "stop" }],
      tags: { route: "subway", name: "東京メトロ千代田線", "name:en": "Tokyo Metro Chiyoda Line (Ayase → Yoyogi-Uehara)", ref: "C", colour: "#00A650" } },
    { type: "relation", id: 101, members: [{ type: "node", ref: 12, role: "stop" }, { type: "node", ref: 11, role: "stop" }],
      tags: { route: "subway", "name:en": "Tokyo Metro Chiyoda Line (Yoyogi-Uehara → Ayase)", ref: "C", colour: "#00A650" } },
    { type: "relation", id: 102, members: [{ type: "node", ref: 11, role: "stop" }],
      tags: { route: "subway", "name:en": "Chiyoda-Joban Lines Through-service", ref: "C;JL", colour: "#00A650" } },
    // Deuxième nœud de la même gare (autre compagnie) : fusionné.
    { type: "node", id: 3, lat: 35.7179, lon: 139.7660, tags: { railway: "station", name: "根津", "name:en": "Nezu" } },
  ],
};

const dbs: LocalDb[] = [];
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.delete()));
});

describe("gares et lignes (Overpass)", () => {
  it("requête : un rayon par point, gares + points d'arrêt + lignes ferrées", () => {
    const q = buildQuery([{ lat: 35.71761, lng: 139.76632 }]);
    expect(q).toContain('node["railway"="station"](around:900,35.71761,139.76632)');
    expect(q).toContain("rel(bn.sp)");
    expect(q).toContain("subway|train");
  });

  it("réponse → gares nommées en latin, une ligne par code (ni sens ni variante), gares fusionnées", () => {
    const st = parseOverpass(RESPONSE as never);
    expect(st.filter((s) => s.name === "Nezu")).toHaveLength(1);
    const nezu = st.find((s) => s.name === "Nezu")!;
    expect(nezu.nameJa).toBe("根津");
    expect(nezu.lines).toEqual([{ ref: "C", name: "Tokyo Metro Chiyoda Line", colour: "#00A650", kind: "subway" }]);
    const yushima = st.find((s) => s.name === "Yushima")!;
    expect(sharedLines(nezu, yushima).map((l) => l.ref)).toEqual(["C"]);
  });

  it("compagnie sans ligne codée (Keihan) : ligne d'infrastructure rattachée au nœud de la gare", () => {
    const st = parseOverpass({ elements: [
      { type: "node", id: 5, lat: 35.0037, lon: 135.772, tags: { railway: "station", name: "祇園四条", "name:en": "Gion-shijo" } },
      { type: "relation", id: 200, members: [{ type: "node", ref: 5, role: "stop" }],
        tags: { route: "railway", name: "京阪本線", "name:en": "Keihan Main Line・Ōto Line", colour: "#5BA094" } },
      // Une ligne d'infrastructure n'est pas affichée quand des lignes codées existent déjà.
      { type: "relation", id: 201, members: [{ type: "node", ref: 1, role: "stop" }], tags: { route: "railway", "name:en": "Chiyoda Line (infra)" } },
      ...RESPONSE.elements,
    ] } as never);
    expect(st.find((s) => s.name === "Gion-shijo")!.lines).toEqual([{ ref: null, name: "Keihan Main Line・Ōto Line", colour: "#5BA094", kind: "train", infra: true }]);
    expect(st.find((s) => s.name === "Nezu")!.lines.map((l) => l.ref)).toEqual(["C"]);
  });

  it("gare la plus proche dans le rayon, sinon rien", () => {
    const st = parseOverpass(RESPONSE as never);
    expect(nearestTransit({ lat: 35.7203, lng: 139.7608 }, st)?.name).toBe("Nezu");
    expect(nearestTransit({ lat: 34.0, lng: 135.0 }, st)).toBeNull();
  });

  it("gares proches triées et trajet sans changement entre deux gares d'une même ligne", () => {
    const st = parseOverpass(RESPONSE as never);
    expect(nearbyTransit({ lat: 35.7165, lng: 139.7650 }, st).map((s) => s.name)).toEqual(["Nezu", "Yushima"]);
    const d = directOption({ lat: 35.7180, lng: 139.7660 }, { lat: 35.7125, lng: 139.7618 }, st)!;
    expect([d.from.name, d.to.name, d.lines[0].ref]).toEqual(["Nezu", "Yushima", "C"]);
    expect(directOption({ lat: 35.7180, lng: 139.7660 }, { lat: 34.0, lng: 135.0 }, st)).toBeNull();
  });

  it("cache local : le second appel ne touche pas le réseau (hors ligne)", async () => {
    const db = new LocalDb("transit-1");
    dbs.push(db);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(RESPONSE), { status: 200 }));
    const p = { lat: 35.7176, lng: 139.7663 };
    const first = await transitAround(db, [p, p], fetcher as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.stations.map((s: TransitStation) => s.name).sort()).toEqual(["Nezu", "Yushima"]);
    const again = await transitAround(db, [p], vi.fn() as never);
    expect(again.stations).toHaveLength(2);
  });

  it("service saturé : trois essais, puis erreur claire", async () => {
    const db = new LocalDb("transit-2");
    dbs.push(db);
    const fetcher = vi.fn(async () => new Response("busy", { status: 429 }));
    await expect(transitAround(db, [{ lat: 35, lng: 139 }], fetcher as never, 0)).rejects.toThrow(/indisponible/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
