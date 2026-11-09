import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { createSyncScheduler } from "@/lib/sync/scheduler";
import type { MutationResult, OutboxEntry } from "@/lib/types/sync";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
let dbs: LocalDb[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const d of dbs) await d.delete();
  dbs = [];
});

function setup(server: FakeServer) {
  const db = new LocalDb(`sched-${Math.random()}`);
  dbs.push(db);
  const engine = new SyncEngine(db, server.remote("alice"));
  return { db, engine };
}

const until = async (cond: () => Promise<boolean> | boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error("délai dépassé");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("planification de la synchronisation", () => {
  it("une modification faite PENDANT une synchronisation est envoyée ensuite, sans autre déclencheur", async () => {
    const server = new FakeServer();
    const { db, engine } = setup(server);
    // Le serveur répond lentement : la deuxième saisie arrive pendant l'envoi de la première.
    const realPush = server.push.bind(server);
    server.push = (user: string, muts: OutboxEntry[]) => realPush(user, muts) as MutationResult[];
    const remote = server.remote("alice");
    const slow = { ...remote, push: async (m: OutboxEntry[]) => { await new Promise((r) => setTimeout(r, 150)); return remote.push(m); } };
    const slowEngine = new SyncEngine(db, slow);
    const scheduler = createSyncScheduler({ engine: slowEngine, resolveTripId: async () => TRIP, isOnline: () => true, debounceMs: 50 });

    await slowEngine.insert("activities", { trip_id: TRIP, title: "Première" });
    await until(() => slowEngine.getStatus().syncing);
    await slowEngine.insert("activities", { trip_id: TRIP, title: "Deuxième" });
    await slowEngine.insert("activities", { trip_id: TRIP, title: "Troisième" });
    await until(async () => (await db.outbox.count()) === 0 && !slowEngine.getStatus().syncing);
    expect([...server.rows.values()].map((r) => r.title).sort()).toEqual(["Deuxième", "Première", "Troisième"]);
    scheduler.stop();
    void engine;
  });

  it("hors ligne : aucune tentative ; au retour du réseau, tout part", async () => {
    const server = new FakeServer();
    const { db, engine } = setup(server);
    let online = false;
    const scheduler = createSyncScheduler({ engine, resolveTripId: async () => TRIP, isOnline: () => online, debounceMs: 30 });
    await engine.insert("places", { trip_id: TRIP, name: "Dotonbori" });
    await new Promise((r) => setTimeout(r, 120));
    expect(server.pushCalls).toBe(0);
    online = true;
    await scheduler.runNow();
    await until(async () => (await db.outbox.count()) === 0);
    scheduler.stop();
  });

  it("erreur serveur persistante : nouvelles tentatives espacées (pas de boucle serrée)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = new FakeServer();
    const { engine } = setup(server);
    const remote = server.remote("alice");
    let calls = 0;
    const failing = { ...remote, push: async () => { calls++; throw new Error("erreur 500"); } };
    const e2 = new SyncEngine(engine.db, failing);
    const scheduler = createSyncScheduler({ engine: e2, resolveTripId: async () => TRIP, isOnline: () => true, debounceMs: 1000, maxBackoffMs: 8000 });
    await e2.insert("places", { trip_id: TRIP, name: "X" });
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(1000);
    // En 40 s : envois à ~2 s, 4 s, 8 s puis toutes les 8 s maximum, et non toutes les secondes.
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(calls).toBeLessThanOrEqual(8);
    scheduler.stop();
  });
});
