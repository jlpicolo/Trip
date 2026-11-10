"use client";

import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/tickets";
import type { TripDocument } from "@/lib/types/tickets";

export type FileState = "local" | "pending" | "failed" | "remote";

export function fileState(doc: TripDocument, local: Set<string>, pending: Map<string, string | null>): FileState | null {
  if (doc.kind !== "file") return null;
  if (pending.has(doc.id)) return pending.get(doc.id) ? "failed" : "pending";
  return local.has(doc.id) ? "local" : "remote";
}

export function FileStateBadge({ state }: { state: FileState | null }) {
  if (state === "local") return <Badge tone="success"><Icon name="check" size={12} /> Sur l&apos;appareil</Badge>;
  if (state === "pending") return <Badge tone="warning">En attente d&apos;envoi</Badge>;
  if (state === "failed") return <Badge tone="error">Envoi refusé</Badge>;
  if (state === "remote") return <Badge>En ligne uniquement</Badge>;
  return null;
}

const KIND_ICON: Record<TripDocument["kind"], IconName> = { file: "file", link: "link", code: "qr" };

export function DocumentRow({ doc, state, onOpen, onCode }: {
  doc: TripDocument; state: FileState | null; onOpen: () => void; onCode?: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-line bg-card pr-2">
      <button onClick={onOpen} aria-label={`Ouvrir « ${doc.title} »`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-elev">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sakura-soft text-sakura"><Icon name={KIND_ICON[doc.kind]} size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{doc.title}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-dim">
            {DOCUMENT_CATEGORY_LABEL[doc.category]}
            {doc.scope === "travelers" && <Badge tone="night">Certains voyageurs</Badge>}
            <FileStateBadge state={state} />
          </span>
        </span>
      </button>
      {onCode && doc.kind === "code" && (
        <button onClick={onCode} aria-label={`Afficher le code de « ${doc.title} » en plein écran`}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral text-on-accent">
          <Icon name="expand" size={20} />
        </button>
      )}
    </li>
  );
}
