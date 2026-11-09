"use client";

import { useSyncExternalStore } from "react";
import { getEngine } from "@/lib/sync/client";
import type { SyncStatus } from "@/lib/sync/engine";

const serverSnapshot: SyncStatus = {
  syncing: false, pending: 0, conflicts: 0, rejected: 0, lastSyncAt: null, lastError: null, online: true,
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => getEngine().subscribe(cb),
    () => getEngine().getStatus(),
    () => serverSnapshot,
  );
}
