"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Field";
import { journalMeta, PRIORITY_META } from "@/lib/journal";
import { mapsLinks } from "@/lib/planning";
import { formatDayLong, formatDayShort } from "@/lib/formatters";
import type { JournalEntry } from "@/lib/types/journal";
import type { Activity, Place } from "@/lib/types/planning";

export function JournalDetails({ entry: e, place, planned, dates, onEdit, onDelete, onPlan }: {
  entry: JournalEntry;
  place?: Place;
  planned: Activity[];
  dates: string[];
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onPlan: (date: string | null) => Promise<void>;
}) {
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState<null | "plan" | "delete">(null);
  const [confirm, setConfirm] = useState(false);
  const meta = journalMeta(e.category);
  const links = place ? mapsLinks({ lat: place.lat, lng: place.lng, address: place.address, name: e.title }) : null;
  const run = (what: "plan" | "delete", fn: () => Promise<void>) => async () => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-dim">
        <Icon name={meta.icon} size={16} /> {meta.label}{e.city && <> · {e.city}</>}
        {e.priority && <span className="text-sun">{PRIORITY_META[e.priority].short} {PRIORITY_META[e.priority].label}</span>}
      </p>
      {e.body && <p className="whitespace-pre-wrap text-sm">{e.body}</p>}
      <div className="flex flex-wrap gap-2">
        {e.url && (
          <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev">
            <Icon name="external" size={18} /> Ouvrir le lien
          </a>
        )}
        {place?.lat != null && (
          <Link href={`/carte?lieu=${place.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev">
            <Icon name="map" size={18} /> Voir sur la carte
          </Link>
        )}
        {links && (
          <a href={links.directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev">
            <Icon name="route" size={18} /> Itinéraire (Google)
          </a>
        )}
      </div>

      <section aria-labelledby="planif-carnet" className="flex flex-col gap-2 rounded-2xl border border-line bg-elev p-3">
        <h3 id="planif-carnet" className="text-xs font-semibold uppercase tracking-wider text-dim">Planning</h3>
        {planned.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {planned.map((a) => (
              <li key={a.id}>
                <Link href={a.date ? `/planning#jour-${a.date}` : "/planning"} className="inline-flex min-h-10 items-center gap-2 text-teal">
                  <Icon name="check" size={16} /> {a.date ? `Prévu le ${formatDayLong(a.date).toLowerCase()}` : "Dans les idées du planning"}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <SelectField label="Ajouter au planning" value={day} onChange={(ev) => setDay(ev.target.value)}>
            <option value="">Idée sans date</option>
            {dates.map((d) => <option key={d} value={d}>{formatDayShort(d)}</option>)}
          </SelectField>
          <Button onClick={run("plan", () => onPlan(day || null))} loading={busy === "plan"} icon="calendar">Planifier</Button>
        </div>
        <p className="text-xs text-mute">Titre, notes, lien et lieu sont repris dans l&apos;activité, sans ressaisie.</p>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="ghost" icon="edit" onClick={onEdit}>Modifier</Button>
        {confirm ? (
          <Button variant="danger" icon="trash" onClick={run("delete", onDelete)} loading={busy === "delete"}>
            Confirmer{planned.length > 0 ? " (le planning est conservé)" : ""}
          </Button>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>Supprimer</Button>
        )}
      </div>
    </div>
  );
}
