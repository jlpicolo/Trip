"use client";

import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatDayLong } from "@/lib/formatters";
import { TRANSPORT_META, transportTitle } from "@/lib/tickets";
import type { Transport } from "@/lib/types/tickets";
import { stayEventsFor } from "@/lib/stays";
import type { Accommodation } from "@/lib/types/stays";
import type { Activity, Place, TripDay } from "@/lib/types/planning";
import { ActivityCard } from "./ActivityCard";

export function useDragSensors() {
  return useSensors(
    // Souris : petit seuil pour distinguer clic et glisser. Tactile : appui long pour
    // ne pas gêner le défilement de la page.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

const announcements = {
  onDragStart: () => "Déplacement commencé. Flèches haut et bas pour changer la position, Espace pour valider, Échap pour annuler.",
  onDragOver: () => "",
  onDragEnd: () => "Activité déplacée.",
  onDragCancel: () => "Déplacement annulé.",
};

export function ActivityList({ items, places, onOpen, onToggleDone, onReorder, label }: {
  items: Activity[];
  places: Map<string, Place>;
  onOpen: (a: Activity) => void;
  onToggleDone: (a: Activity) => void;
  onReorder: (a: Activity, newIndex: number) => void;
  label: string;
}) {
  const sensors = useDragSensors();
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const moved = items.find((a) => a.id === e.active.id);
    const newIndex = items.findIndex((a) => a.id === e.over!.id);
    if (moved && newIndex >= 0) onReorder(moved, newIndex);
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "Pour réordonner, appuyez sur Espace puis utilisez les flèches." } }}>
      <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" aria-label={label}>
          {items.map((a) => (
            <ActivityCard key={a.id} activity={a} place={a.place_id ? places.get(a.place_id) : undefined}
              onOpen={() => onOpen(a)} onToggleDone={() => onToggleDone(a)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Une étape du parcours : pastille sur le tracé, en-tête de journée, puis activités.
 * Une journée vide tient sur une ligne.
 */
export function DaySection({ date, dayNumber, isToday, day, items, transports = [], stays = [], places, onOpen, onToggleDone, onReorder, onAdd, onEditDay }: {
  date: string;
  dayNumber: number;
  isToday: boolean;
  day?: TripDay;
  items: Activity[];
  transports?: Transport[];
  stays?: Accommodation[];
  places: Map<string, Place>;
  onOpen: (a: Activity) => void;
  onToggleDone: (a: Activity) => void;
  onReorder: (a: Activity, newIndex: number) => void;
  onAdd: () => void;
  onEditDay: () => void;
}) {
  const title = formatDayLong(date);
  const empty = items.length === 0;
  const stayEvents = stayEventsFor(stays, date);
  const STAY_LABEL = { check_in: "Arrivée", night: "Nuit", check_out: "Départ" } as const;
  return (
    <section id={`jour-${date}`} data-day={date} aria-labelledby={`titre-${date}`} className="relative scroll-mt-32 pl-8">
      <span aria-hidden="true"
        className={`absolute left-[3px] top-1.5 size-[18px] rounded-full border-[3px] bg-canvas ${isToday ? "border-coral shadow-[0_0_0_5px_var(--coral-soft)]" : empty && !day?.is_free ? "border-line-strong" : "border-sakura"}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`titre-${date}`} className="text-lg font-extrabold leading-tight">
            {title}{day?.city && <span className="font-sans text-base font-medium text-dim"> · {day.city}</span>}
          </h2>
          <p className="text-xs text-mute">
            Jour {dayNumber}{isToday && <span className="ml-1.5 font-bold text-coral">· Aujourd&apos;hui</span>}
            {day?.title && <span className="text-dim"> · {day.title}</span>}
          </p>
        </div>
        <div className="flex shrink-0">
          {!empty && (
            <Link href={`/carte?parcours=${date}`} aria-label={`Voir le parcours du ${title.toLowerCase()} sur la carte`}
              className="grid size-10 place-items-center rounded-full text-dim hover:bg-elev"><Icon name="route" size={18} /></Link>
          )}
          <button onClick={onEditDay} aria-label={`Note et ville du ${title}`}
            className="grid size-10 place-items-center rounded-full text-dim hover:bg-elev"><Icon name="edit" size={18} /></button>
        </div>
      </div>
      {(day?.is_free || day?.notes) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-teal/40 bg-teal-soft px-3 py-2 text-sm">
          {day.is_free && <span className="rounded-full bg-teal px-2 py-0.5 text-xs font-bold text-on-accent">Journée libre</span>}
          {day.notes && <p className="whitespace-pre-line text-dim">{day.notes}</p>}
        </div>
      )}
      {transports.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2" aria-label={`Trajets du ${title}`}>
          {transports.map((t) => (
            <li key={t.id}>
              <Link href={`/billets?trajet=${t.id}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-night/30 bg-night-soft px-3 py-2 text-sm">
                <Icon name={TRANSPORT_META[t.kind].icon} size={18} className="shrink-0 text-night" />
                {t.departure_time && <span className="font-bold tabular-nums">{t.departure_time.slice(0, 5)}</span>}
                <span className="min-w-0 flex-1 truncate">{transportTitle(t)}</span>
                <Icon name="ticket" size={16} className="shrink-0 text-night" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {stayEvents.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1" aria-label={`Hébergements du ${title}`}>
          {stayEvents.map(({ stay, kind }) => {
            const time = kind === "check_in" ? stay.check_in_time : kind === "check_out" ? stay.check_out_time : null;
            return (
              <li key={`${stay.id}-${kind}`}>
                <Link href={`/hebergements?sejour=${stay.id}`}
                  className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm ${kind === "night" ? "text-mute hover:bg-elev" : "border border-teal/30 bg-teal-soft"}`}>
                  <Icon name="bed" size={16} className="shrink-0 text-teal" />
                  <span className="font-semibold">{STAY_LABEL[kind]}</span>
                  <span className="min-w-0 flex-1 truncate">{stay.name}</span>
                  {time && <span className="tabular-nums text-dim">{kind === "check_in" ? "dès" : "avant"} {time.slice(0, 5)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {empty ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="text-mute">{day?.is_free || transports.length > 0 || stayEvents.some((e) => e.kind !== "night") ? "" : "Rien de prévu"}</span>
          <button onClick={onAdd} aria-label={`Ajouter au ${title.toLowerCase()}`}
            className="flex min-h-10 items-center gap-1 rounded-full px-3 font-semibold text-sakura hover:bg-sakura-soft">
            <Icon name="plus" size={16} /> Ajouter
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2">
            <ActivityList items={items} places={places} onOpen={onOpen} onToggleDone={onToggleDone} onReorder={onReorder}
              label={`Activités du ${title}`} />
          </div>
          <button onClick={onAdd} aria-label={`Ajouter au ${title.toLowerCase()}`}
            className="mt-1 flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-sakura hover:bg-sakura-soft">
            <Icon name="plus" size={16} /> Ajouter
          </button>
        </>
      )}
    </section>
  );
}
