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
    <div className="flex items-center gap-2 py-1 pl-6 text-xs text-mute">
      <span className="h-4 border-l border-dashed border-line-strong" aria-hidden="true" />
      <Icon name="walk" size={14} />
      <span>≈ {formatMinutes(activity.travel_minutes_estimate)} {mode} <em className="not-italic text-dim">· estimation</em></span>
    </div>
  );
}

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

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative ${isDragging ? "z-10 opacity-80" : ""}`} data-activity-id={activity.id}>
      <TravelEstimate activity={activity} />
      <div className={`flex items-stretch gap-1 rounded-2xl border bg-card ${isDragging ? "border-sakura shadow-[var(--shadow)]" : "border-line"}`}>
        {sortable && (
          <button ref={setActivatorNodeRef} {...attributes} {...listeners}
            aria-label={`Réordonner « ${activity.title} »`}
            className="grid w-9 shrink-0 cursor-grab touch-none place-items-center rounded-l-2xl text-mute hover:bg-elev active:cursor-grabbing">
            <Icon name="grip" size={18} />
          </button>
        )}
        <button onClick={onOpen} className={`min-w-0 flex-1 py-3 text-left ${sortable ? "" : "pl-3"}`} aria-label={`Ouvrir « ${activity.title} »`}>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: meta.color }}>
              <Icon name={meta.icon} size={14} />{meta.label}
            </span>
            <span className="text-dim">{start ? `${start}${end ? `–${end}` : ""}` : "Sans horaire"}</span>
            {activity.duration_minutes != null && <span className="text-mute">· {formatMinutes(activity.duration_minutes)} (estimée)</span>}
          </div>
          <p className={`mt-0.5 font-semibold ${activity.is_done ? "text-dim line-through" : ""}`}>{activity.title}</p>
          {(place?.address || activity.estimated_cost_minor != null) && (
            <p className="mt-0.5 truncate text-xs text-dim">
              {place?.address}
              {place?.address && activity.estimated_cost_minor != null && " · "}
              {activity.estimated_cost_minor != null && `≈ ${formatMoney(activity.estimated_cost_minor, activity.estimated_cost_currency ?? "EUR")} (estimé)`}
            </p>
          )}
        </button>
        <div className="flex flex-col items-center justify-center gap-1 pr-2">
          <button role="checkbox" aria-checked={activity.is_done} onClick={onToggleDone}
            aria-label={activity.is_done ? `Marquer « ${activity.title} » comme non réalisée` : `Marquer « ${activity.title} » comme réalisée`}
            className={`grid size-9 place-items-center rounded-full border ${activity.is_done ? "border-success bg-success/15 text-success" : "border-line-strong text-transparent hover:text-mute"}`}>
            <Icon name="check" size={16} />
          </button>
          {place?.lat != null && (
            <Link href={`/carte?lieu=${place.id}`} aria-label={`Voir « ${activity.title} » sur la carte`}
              className="grid size-9 place-items-center rounded-full text-sakura hover:bg-sakura-soft">
              <Icon name="map" size={16} />
            </Link>
          )}
          {links && (
            <a href={links.directions} target="_blank" rel="noopener noreferrer" aria-label={`Itinéraire vers « ${activity.title} » (Google Maps)`}
              className="grid size-9 place-items-center rounded-full text-night hover:bg-night-soft">
              <Icon name="pin" size={16} />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
