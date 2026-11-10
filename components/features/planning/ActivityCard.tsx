"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/ui/Icon";
import { categoryMeta, hm, mapsLinks, TRAVEL_MODE_LABEL } from "@/lib/planning";
import { formatMinutes, formatMoney } from "@/lib/formatters";
import type { Activity, Place } from "@/lib/types/planning";

export function TravelEstimate({ activity }: { activity: Activity }) {
  if (activity.travel_minutes_estimate == null) return null;
  const mode = activity.travel_mode ? TRAVEL_MODE_LABEL[activity.travel_mode] : "";
  return (
    <div className="flex items-center gap-1.5 py-1.5 pl-1 text-xs text-dim">
      <Icon name="walk" size={14} />
      <span>≈ {formatMinutes(activity.travel_minutes_estimate)} {mode} <em className="font-semibold not-italic text-sun">· estimation</em></span>
    </div>
  );
}

/**
 * Carte d'activité du parcours : pastille horaire colorée par catégorie à gauche,
 * contenu au centre, actions (fait, carte, itinéraire) à droite.
 */
export function ActivityCard({ activity, place, onOpen, onToggleDone, sortable = true }: {
  activity: Activity;
  place?: Place;
  onOpen: () => void;
  onToggleDone: () => void;
  sortable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
    disabled: !sortable,
  });
  const meta = categoryMeta(activity.category);
  const start = hm(activity.start_time);
  const end = hm(activity.end_time);
  const links = place ? mapsLinks({ lat: place.lat, lng: place.lng, address: place.address, name: place.name }) : null;
  const details = [
    meta.label,
    activity.is_done ? "fait" : null,
    place?.address ?? place?.name ?? null,
    activity.estimated_cost_minor != null ? `≈ ${formatMoney(activity.estimated_cost_minor, activity.estimated_cost_currency ?? "EUR")} (estimé)` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative ${isDragging ? "z-10 opacity-90" : ""}`} data-activity-id={activity.id}>
      <TravelEstimate activity={activity} />
      <div className={`flex items-stretch overflow-hidden rounded-2xl border bg-card ${isDragging ? "border-sakura shadow-[var(--shadow)]" : "border-line"}`}>
        {sortable ? (
          <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Réordonner « ${activity.title} »`}
            className="flex w-[58px] shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-0.5 text-on-accent active:cursor-grabbing"
            style={{ background: meta.color }}>
            <TimeLabel start={start} end={end} duration={activity.duration_minutes} />
          </button>
        ) : (
          <div className="flex w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 text-on-accent" style={{ background: meta.color }}>
            <TimeLabel start={start} end={end} duration={activity.duration_minutes} />
          </div>
        )}
        <button onClick={onOpen} className="min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-elev" aria-label={`Ouvrir « ${activity.title} »`}>
          <p className={`font-semibold leading-snug ${activity.is_done ? "text-dim line-through" : ""}`}>{activity.title}</p>
          <span className="mt-0.5 block truncate text-xs text-dim">{details}</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
          {place?.lat != null && (
            <Link href={`/carte?lieu=${place.id}`} aria-label={`Voir « ${activity.title} » sur la carte`}
              className="grid size-10 place-items-center rounded-full text-sakura hover:bg-sakura-soft">
              <Icon name="map" size={18} />
            </Link>
          )}
          {links && (
            <a href={links.directions} target="_blank" rel="noopener noreferrer" aria-label={`Itinéraire vers « ${activity.title} » (Google Maps)`}
              className="hidden size-10 place-items-center rounded-full text-night hover:bg-night-soft sm:grid">
              <Icon name="pin" size={18} />
            </a>
          )}
          <button role="checkbox" aria-checked={activity.is_done} onClick={onToggleDone}
            aria-label={activity.is_done ? `Marquer « ${activity.title} » comme non réalisée` : `Marquer « ${activity.title} » comme réalisée`}
            className={`grid size-10 place-items-center rounded-full border-2 ${activity.is_done ? "border-teal bg-teal-soft text-teal" : "border-line-strong text-transparent hover:text-mute"}`}>
            <Icon name="check" size={18} />
          </button>
        </div>
      </div>
    </li>
  );
}

function TimeLabel({ start, end, duration }: { start: string | null; end: string | null; duration: number | null }) {
  if (!start) {
    return <span className="text-center text-[11px] font-bold leading-tight">sans<br />horaire</span>;
  }
  return (
    <>
      <span className="text-[15px] font-bold leading-none tabular-nums">{start}</span>
      {(end || duration != null) && (
        <span className="text-[10.5px] font-semibold leading-none opacity-80 tabular-nums">{end ? `→ ${end}` : formatMinutes(duration!)}</span>
      )}
    </>
  );
}
