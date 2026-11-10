"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CodeView } from "./CodeView";
import { FilePreview } from "./FilePreview";
import { FileStateBadge, type FileState } from "./DocumentRow";
import { getLocalDb } from "@/lib/db/schema";
import { CODE_FORMAT_LABEL, DOCUMENT_CATEGORY_LABEL, formatBytes, transportTitle } from "@/lib/tickets";
import { formatDayLong } from "@/lib/formatters";
import type { Transport, TripDocument } from "@/lib/types/tickets";
import type { Traveler } from "@/hooks/useTrip";

export function DocumentDetails({ doc, state, transport, travelers, pendingError, onEdit, onDelete, onFullscreen, onDownload, onForget, onOpenTransport }: {
  doc: TripDocument;
  state: FileState | null;
  transport?: Transport;
  travelers: Traveler[];
  pendingError?: string | null;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onFullscreen: () => void;
  onDownload: () => Promise<void>;
  onForget: () => Promise<void>;
  onOpenTransport: (id: string) => void;
}) {
  const local = useLiveQuery(() => getLocalDb().files.get(doc.id), [doc.id]);
  const [busy, setBusy] = useState<null | "download" | "forget" | "delete">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const names = doc.traveler_ids.map((id) => travelers.find((t) => t.id === id)?.display_name ?? "Ancien membre");
  const run = (what: "download" | "forget" | "delete", fn: () => Promise<void>) => async () => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-dim">
        <span>{DOCUMENT_CATEGORY_LABEL[doc.category]}</span>
        {doc.date && <span>· {formatDayLong(doc.date)}</span>}
        <FileStateBadge state={state} />
      </div>

      {doc.kind === "code" && doc.code_value && doc.code_format && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-4">
          <CodeView format={doc.code_format} value={doc.code_value} label={`Code de « ${doc.title} »`} />
          <Button onClick={onFullscreen} icon="expand" block>Plein écran</Button>
          <p className="text-xs text-[#40465f]">{CODE_FORMAT_LABEL[doc.code_format]} · généré sur l&apos;appareil, disponible hors ligne</p>
        </div>
      )}

      {doc.kind === "link" && doc.url && (
        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 break-all rounded-xl border border-line-strong px-3 py-2 text-sm text-sakura hover:bg-elev">
          <Icon name="external" size={18} className="shrink-0" /> {doc.url}
        </a>
      )}

      {doc.kind === "file" && (
        local ? (
          <FilePreview key={local.saved_at} blob={local.blob} title={doc.title} />
        ) : local === undefined ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-dim">
            <p>Fichier non présent sur cet appareil{doc.size_bytes ? ` (${formatBytes(doc.size_bytes)})` : ""} : téléchargez-le pour le consulter, y compris hors ligne.</p>
            <Button onClick={run("download", onDownload)} loading={busy === "download"} icon="download">Télécharger sur l&apos;appareil</Button>
          </div>
        ) : null
      )}
      {pendingError && <p role="alert" className="text-sm text-error">Le fichier n&apos;a pas pu être envoyé : {pendingError}</p>}
      {state === "pending" && <p className="text-sm text-warning">Fichier enregistré sur cet appareil ; il sera envoyé aux autres voyageurs à la prochaine synchronisation.</p>}

      {transport && (
        <button onClick={() => onOpenTransport(transport.id)} className="flex min-h-11 items-center gap-2 rounded-xl bg-night-soft px-3 text-left text-sm text-night">
          <Icon name="route" size={18} /> {transportTitle(transport)}
        </button>
      )}
      {doc.scope === "travelers" && <p className="text-sm text-dim">Concerne : {names.join(", ")}</p>}
      {doc.notes && <p className="whitespace-pre-wrap text-sm">{doc.notes}</p>}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="ghost" icon="edit" onClick={onEdit}>Modifier</Button>
        {doc.kind === "file" && local && state === "local" && (
          <Button variant="ghost" onClick={run("forget", onForget)} loading={busy === "forget"}>Retirer de l&apos;appareil</Button>
        )}
        {confirmDelete ? (
          <Button variant="danger" icon="trash" onClick={run("delete", onDelete)} loading={busy === "delete"}>Confirmer la suppression</Button>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Supprimer</Button>
        )}
      </div>
    </div>
  );
}
