"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { getLocalDb } from "@/lib/db/schema";
import { activitiesForPlace } from "@/lib/db/places";
import { placeMeta } from "@/lib/places";
import { mapsLinks, hm } from "@/lib/planning";
import { formatCoordinates } from "@/lib/geo";
import { formatDayShort } from "@/lib/formatters";
import type { Place } from "@/lib/types/planning";

export function PlaceDetails({ place, tripId, dates, onEdit, onMove, onToggleFavorite, onAddToPlanning, onDelete }: {
  place: Place;
  tripId: string;
  dates: string[];
  onEdit: () => void;
  onMove: () => void;
  onToggleFavorite: () => void;
  onAddToPlanning: (date: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const meta = placeMeta(place.category);
  const links = mapsLinks({ lat: place.lat, lng: place.lng, address: place.address, name: place.name });
  const linked = useLiveQuery(() => activitiesForPlace(getLocalDb(), tripId, place.id), [tripId, place.id]);
  const [planDate, setPlanDate] = useState(dates[0] ?? "");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: meta.color }}>
          <Icon name={meta.icon} size={16} />{meta.label}
        </span>
        {place.city && <Badge>{place.city}</Badge>}
        <button onClick={onToggleFavorite} aria-pressed={place.is_favorite}
          className={`ml-auto flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${place.is_favorite ? "bg-sakura-soft text-sakura" : "text-dim hover:bg-elev"}`}>
          <Icon name="heart" size={16} /> {place.is_favorite ? "Favori" : "Ajouter aux favoris"}
        </button>
      </div>

      {(place.address || place.address_local || place.lat != null) && (
        <dl className="grid gap-1 text-sm">
          {place.address && <><dt className="text-mute">Adresse</dt><dd>{place.address}</dd></>}
          {place.address_local && <><dt className="text-mute">Adresse en japonais</dt><dd lang="ja">{place.address_local}</dd></>}
          {place.lat != null && <><dt className="text-mute">Coordonnées</dt><dd className="font-mono text-xs">{formatCoordinates(place.lat, place.lng)}</dd></>}
        </dl>
      )}
      {place.lat == null && <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">Ce lieu n&apos;a pas de coordonnées : il n&apos;apparaît pas sur la carte.</p>}
      {place.description && <p className="whitespace-pre-line text-sm">{place.description}</p>}
      {place.notes && <p className="whitespace-pre-line rounded-xl bg-elev px-3 py-2 text-sm text-dim">{place.notes}</p>}
      {place.url && <a href={place.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-night">Ouvrir le lien</a>}

      {links && (
        <div className="grid grid-cols-2 gap-2">
          <a href={links.directions} target="_blank" rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-night-soft text-sm font-semibold text-night">
            <Icon name="pin" size={16} /> Itinéraire (Google)
          </a>
          <a href={links.apple} target="_blank" rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong text-sm font-semibold">
            Plans (Apple)
          </a>
        </div>
      )}

      <section aria-labelledby="planning-du-lieu" className="flex flex-col gap-2">
        <h3 id="planning-du-lieu" className="text-sm font-semibold text-dim">Dans le planning</h3>
        {linked?.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {linked.map((a) => (
              <li key={a.id}>
                <Link href={a.date ? `/planning#jour-${a.date}` : "/planning"} className="flex min-h-11 items-center gap-2 rounded-xl bg-elev px-3 hover:brightness-110">
                  <Icon name="calendar" size={16} className="text-night" />
                  <span className="flex-1">{a.date ? formatDayShort(a.date) : "Idée non planifiée"}{a.start_time ? ` · ${hm(a.start_time)}` : ""}</span>
                  <span className="truncate text-dim">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">Pas encore dans le planning.</p>
        )}
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <SelectField label="Ajouter au planning" value={planDate} onChange={(e) => setPlanDate(e.target.value)}>
            <option value="">Comme idée (sans date)</option>
            {dates.map((d, i) => <option key={d} value={d}>Jour {i + 1} · {formatDayShort(d)}</option>)}
          </SelectField>
          <Button variant="subtle" icon="plus" loading={adding} onClick={async () => {
            setAdding(true);
            await onAddToPlanning(planDate || null);
            setAdding(false);
          }}>Ajouter</Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" icon="edit" onClick={onEdit}>Modifier</Button>
        <Button variant="ghost" icon="crosshair" onClick={onMove}>{place.lat == null ? "Placer sur la carte" : "Déplacer le point"}</Button>
      </div>
      {confirmDelete ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-sm">
          <p>Supprimer « {place.name} » pour tous les voyageurs ? Les activités du planning sont conservées, sans lieu.</p>
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" onClick={() => onDelete()}>Supprimer</Button>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Supprimer le lieu</Button>
      )}
    </div>
  );
}
