"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DocumentRow, fileState } from "@/components/features/tickets/DocumentRow";
import { formatDayLong } from "@/lib/formatters";
import { mapsLinks } from "@/lib/planning";
import { nightsOf } from "@/lib/stays";
import type { Accommodation } from "@/lib/types/stays";
import type { Place } from "@/lib/types/planning";
import type { TripDocument } from "@/lib/types/tickets";

export function StayDetails({ stay: s, place, docs, local, pending, onEdit, onDelete, onAddDocument, onOpenDocument, onCode }: {
  stay: Accommodation;
  place?: Place;
  docs: TripDocument[];
  local: Set<string>;
  pending: Map<string, string | null>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onAddDocument: () => void;
  onOpenDocument: (id: string) => void;
  onCode: (doc: TripDocument) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = nightsOf(s);
  const links = mapsLinks({ lat: place?.lat, lng: place?.lng, address: s.address, name: s.address ? null : `${s.name} ${s.city ?? ""}` });
  const row = (label: string, value: React.ReactNode) =>
    value ? <div className="flex justify-between gap-3 py-1.5"><dt className="text-dim">{label}</dt><dd className="min-w-0 text-right font-medium">{value}</dd></div> : null;

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-line text-sm">
        {row("Arrivée", `${formatDayLong(s.check_in_date)}${s.check_in_time ? ` · dès ${s.check_in_time.slice(0, 5)}` : ""}`)}
        {row("Départ", `${formatDayLong(s.check_out_date)}${s.check_out_time ? ` · avant ${s.check_out_time.slice(0, 5)}` : ""}`)}
        {row("Durée", `${n} nuit${n > 1 ? "s" : ""}`)}
        {row("Ville", s.city)}
        {row("Voyageurs", s.guests)}
        {row("Réservation", [s.booking_site, s.booking_ref].filter(Boolean).join(" · "))}
        {row("Téléphone", s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="text-sakura">{s.phone}</a>)}
        {row("Email", s.email && <a href={`mailto:${s.email}`} className="break-all text-sakura">{s.email}</a>)}
      </dl>

      {(s.address || s.address_local) && (
        <div className="rounded-xl bg-elev p-3 text-sm">
          {s.address && <p>{s.address}</p>}
          {s.address_local && <p lang="ja" className="mt-1 text-base font-semibold">{s.address_local}</p>}
          {s.address_local && <p className="mt-1 text-xs text-mute">À montrer au chauffeur de taxi.</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {links && (
          <a href={links.directions} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev">
            <Icon name="route" size={18} /> Itinéraire (Google)
          </a>
        )}
        {place?.lat != null && (
          <Link href={`/carte?lieu=${place.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev">
            <Icon name="map" size={18} /> Voir sur la carte
          </Link>
        )}
        {s.booking_url && (
          <a href={s.booking_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev">
            <Icon name="external" size={18} /> Réservation
          </a>
        )}
      </div>
      {!place && <p className="text-xs text-mute">Ajoutez une adresse ou des coordonnées pour le placer sur la carte.</p>}

      {s.rooms && <section><h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-dim">Chambres</h3><p className="whitespace-pre-wrap text-sm">{s.rooms}</p></section>}
      {s.practical_info && <section><h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-dim">Infos pratiques</h3><p className="whitespace-pre-wrap text-sm">{s.practical_info}</p></section>}
      {s.notes && <section><h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-dim">Notes</h3><p className="whitespace-pre-wrap text-sm">{s.notes}</p></section>}

      <section aria-labelledby="docs-hebergement" className="flex flex-col gap-2">
        <h3 id="docs-hebergement" className="text-xs font-semibold uppercase tracking-wider text-dim">Confirmations et documents</h3>
        {docs.length === 0 ? (
          <p className="text-sm text-dim">Aucun document rattaché.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => <DocumentRow key={d.id} doc={d} state={fileState(d, local, pending)} onOpen={() => onOpenDocument(d.id)} onCode={() => onCode(d)} />)}
          </ul>
        )}
        <Button variant="subtle" icon="plus" onClick={onAddDocument}>Ajouter une confirmation</Button>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="ghost" icon="edit" onClick={onEdit}>Modifier</Button>
        {confirm ? (
          <Button variant="danger" icon="trash" loading={busy} onClick={async () => { setBusy(true); try { await onDelete(); } finally { setBusy(false); } }}>
            Confirmer (documents conservés)
          </Button>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>Supprimer</Button>
        )}
      </div>
    </div>
  );
}
