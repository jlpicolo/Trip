"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useSyncStatus } from "@/hooks/useSync";
import { formatRelative } from "@/lib/formatters";

/** État réel du moteur de synchronisation (jamais simulé). */
export function SyncIndicator() {
  const s = useSyncStatus();
  const attention = s.conflicts + s.rejected;
  let tone = "text-dim";
  let label = s.lastSyncAt ? `Synchronisé ${formatRelative(s.lastSyncAt)}` : "Jamais synchronisé";
  // Un fichier pas encore envoyé n'est pas « synchronisé » : il compte comme une attente.
  const waiting = s.pending + s.pendingFiles;
  let icon: "sync" | "cloudOff" | "alert" | "check" = s.lastSyncAt ? "check" : "sync";
  if (s.syncing) {
    label = "Synchronisation…";
    icon = "sync";
  } else if (attention > 0) {
    tone = "text-warning";
    icon = "alert";
    label = `${attention} à vérifier`;
  } else if (!s.online) {
    tone = "text-warning";
    icon = "cloudOff";
    label = waiting ? `Hors ligne · ${waiting} en attente` : "Hors ligne";
  } else if (waiting > 0) {
    label = `${waiting} en attente`;
    icon = "sync";
  }
  return (
    <Link href="/synchronisation" className={`flex min-h-11 items-center gap-1.5 rounded-full px-2 text-xs font-medium ${tone} hover:bg-elev`}
      aria-label={`État de la synchronisation : ${label}`}>
      <Icon name={icon} size={16} className={s.syncing ? "animate-spin-slow" : ""} />
      <span className="max-w-[9rem] truncate">{label}</span>
    </Link>
  );
}
