"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getEngine } from "@/lib/sync/client";
import type { SyncStatus } from "@/lib/sync/engine";

const serverSnapshot: SyncStatus = {
  syncing: false, pending: 0, pendingFiles: 0, conflicts: 0, rejected: 0, lastSyncAt: null, lastError: null, online: true,
};

function subscribeNetwork(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * État de synchro du moteur, corrigé par l'état réseau du navigateur : ouverte sans réseau,
 * l'app n'a encore tenté aucune synchro mais doit tout de suite l'afficher « hors ligne ».
 */
export function useSyncStatus(): SyncStatus {
  const status = useSyncExternalStore(
    (cb) => getEngine().subscribe(cb),
    () => getEngine().getStatus(),
    () => serverSnapshot,
  );
  const browserOnline = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  return useMemo(() => (browserOnline ? status : { ...status, online: false }), [status, browserOnline]);
}
