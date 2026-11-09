import type { SyncEngine, SyncStatus } from "./engine";

export interface SchedulerOptions {
  engine: SyncEngine;
  resolveTripId: () => Promise<string | null>;
  isOnline: () => boolean;
  debounceMs?: number;
  maxBackoffMs?: number;
}

/**
 * Planifie les synchronisations sans polling permanent : immédiatement à la demande,
 * et quelques secondes après toute modification restée en attente — y compris celles
 * faites PENDANT une synchronisation (sinon elles resteraient bloquées jusqu'au
 * prochain retour au premier plan). Erreurs serveur : nouvel essai avec délai croissant.
 */
export function createSyncScheduler({ engine, resolveTripId, isOnline, debounceMs = 2000, maxBackoffMs = 60_000 }: SchedulerOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let stopped = false;

  const runNow = async () => {
    if (stopped || !isOnline()) return;
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      // L'annuaire d'abord : sur un appareil neuf, c'est lui qui fait connaître le voyage à récupérer.
      await engine.refreshDirectory();
      await engine.sync(await resolveTripId());
    } catch {
      // État exposé par le moteur ; la reprise est gérée par onStatus.
    }
  };

  const schedule = (delay: number) => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void runNow();
    }, delay);
  };

  const onStatus = (s: SyncStatus) => {
    if (s.syncing || !s.online || s.pending === 0) {
      if (!s.syncing && s.pending === 0) failures = 0;
      return;
    }
    if (s.lastError) failures++;
    else failures = 0;
    schedule(failures === 0 ? debounceMs : Math.min(maxBackoffMs, debounceMs * 2 ** failures));
  };

  const unsubscribe = engine.subscribe(onStatus);
  return {
    runNow,
    stop() {
      stopped = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    },
  };
}
