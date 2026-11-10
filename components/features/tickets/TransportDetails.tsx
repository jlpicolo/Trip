"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DocumentRow, fileState } from "./DocumentRow";
import { TRANSPORT_META } from "@/lib/tickets";
import { formatDayLong } from "@/lib/formatters";
import type { Transport, TripDocument } from "@/lib/types/tickets";
import type { Traveler } from "@/hooks/useTrip";

export function TransportDetails({ transport: t, docs, local, pending, travelers, onEdit, onDelete, onAddDocument, onOpenDocument, onCode }: {
  transport: Transport;
  docs: TripDocument[];
  local: Set<string>;
  pending: Map<string, string | null>;
  travelers: Traveler[];
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onAddDocument: () => void;
  onOpenDocument: (id: string) => void;
  onCode: (doc: TripDocument) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = t.traveler_ids.map((id) => travelers.find((x) => x.id === id)?.display_name ?? "Ancien membre");
  const row = (label: string, value: string | null | undefined) =>
    value ? <div className="flex justify-between gap-3 py-1.5"><dt className="text-dim">{label}</dt><dd className="text-right font-medium">{value}</dd></div> : null;
  const when = (date: string | null, time: string | null) => (date ? `${formatDayLong(date)}${time ? ` · ${time.slice(0, 5)}` : ""}` : time?.slice(0, 5));

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-line text-sm">
        {row("Type", TRANSPORT_META[t.kind].label)}
        {row("Départ", [t.departure_name, when(t.departure_date, t.departure_time)].filter(Boolean).join(" — "))}
        {row("Arrivée", [t.arrival_name, when(t.arrival_date ?? t.departure_date, t.arrival_time)].filter(Boolean).join(" — "))}
        {row("Places", t.seat_info)}
        {row("Réservation", t.booking_ref)}
        {row("Voyageurs", who.length ? who.join(", ") : "Tout le groupe")}
      </dl>
      <p className="text-xs text-mute">Heures saisies telles qu&apos;indiquées sur le billet (heure locale).</p>
      {t.booking_url && (
        <a href={t.booking_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-sakura">
          <Icon name="external" size={18} /> Voir la réservation
        </a>
      )}
      {t.notes && <p className="whitespace-pre-wrap text-sm">{t.notes}</p>}

      <section aria-labelledby="billets-trajet" className="flex flex-col gap-2">
        <h3 id="billets-trajet" className="text-xs font-semibold uppercase tracking-wider text-dim">Billets de ce trajet</h3>
        {docs.length === 0 ? (
          <p className="text-sm text-dim">Aucun billet rattaché pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => <DocumentRow key={d.id} doc={d} state={fileState(d, local, pending)} onOpen={() => onOpenDocument(d.id)} onCode={() => onCode(d)} />)}
          </ul>
        )}
        <Button variant="subtle" icon="plus" onClick={onAddDocument}>Ajouter un billet à ce trajet</Button>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="ghost" icon="edit" onClick={onEdit}>Modifier</Button>
        {confirm ? (
          <Button variant="danger" icon="trash" loading={busy} onClick={async () => { setBusy(true); try { await onDelete(); } finally { setBusy(false); } }}>
            Confirmer (les billets sont conservés)
          </Button>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>Supprimer le trajet</Button>
        )}
      </div>
    </div>
  );
}
